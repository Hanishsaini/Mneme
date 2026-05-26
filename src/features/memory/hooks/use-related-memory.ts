"use client";

import { useEffect, useRef, useState } from "react";
import type { RelatedMemoryHitDTO } from "@workspace/shared";

/**
 * Debounced fetch of "related past discussions" for the prompt composer.
 *
 * Three layers of restraint, because firing an embedding API call on every
 * keystroke would burn the free-tier quota in an afternoon:
 *
 *   1. Min length gate (`MIN_QUERY_CHARS`) — don't even debounce until the
 *      user has typed enough to mean something. "what" produces noise.
 *   2. Debounce (`DEBOUNCE_MS`) — only fire after the typing pause.
 *   3. AbortController per request — when the query changes mid-flight,
 *      cancel the previous fetch so we never render stale results.
 *
 * Returns an empty list (not stale data) while loading, so the UI just
 * hides the panel rather than flashing yesterday's hits.
 */

const DEBOUNCE_MS = 500;
const MIN_QUERY_CHARS = 25;

interface UseRelatedMemoryArgs {
  workspaceId: string | null | undefined;
  conversationId: string | null | undefined;
  query: string;
  enabled?: boolean;
}

export function useRelatedMemory({
  workspaceId,
  conversationId,
  query,
  enabled = true,
}: UseRelatedMemoryArgs) {
  const [hits, setHits] = useState<RelatedMemoryHitDTO[]>([]);
  const [loading, setLoading] = useState(false);

  // Track the latest in-flight controller so a fresh keystroke can cancel
  // the previous request rather than letting it race.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || !workspaceId) {
      setHits([]);
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_CHARS) {
      setHits([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/memory/related`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              query: trimmed,
              ...(conversationId ? { excludeConversationId: conversationId } : {}),
            }),
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          setHits([]);
          return;
        }
        const data = (await res.json()) as { hits: RelatedMemoryHitDTO[] };
        // Defensive: only commit if this is still the latest request.
        if (controller === abortRef.current) {
          setHits(data.hits);
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setHits([]);
      } finally {
        if (controller === abortRef.current) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [workspaceId, conversationId, query, enabled]);

  return { hits, loading };
}
