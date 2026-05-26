"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Polls the stale-memory count for a workspace and exposes a `refresh()`
 * the panel can call after a confirm/resolve so the header dot updates
 * without waiting for the next interval.
 *
 * 60s cadence is the right knob: stale-decision UX is anxiety-driven, not
 * realtime — too frequent and we burn API quota for nothing, too slow and
 * the red dot lies after a confirm.
 */
const POLL_INTERVAL_MS = 60_000;

export function useStaleCount(workspaceId: string | null | undefined) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/memory/stale`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { count: number };
      setCount(data.count);
    } catch {
      // swallow — the header indicator just doesn't update on transient
      // failures; the next interval re-runs the fetch.
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [workspaceId, refresh]);

  return { count, refresh };
}
