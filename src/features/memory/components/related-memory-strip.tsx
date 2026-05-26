"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrainCircuit, ChevronDown, ChevronUp, X } from "lucide-react";
import type { RelatedMemoryHitDTO } from "@workspace/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useRelatedMemory } from "../hooks/use-related-memory";

/**
 * The proactive surface — sits above the prompt composer and quietly fills
 * itself with related past discussions as the user types. This is the
 * single moment where the product feels different from every chat tool:
 * memory shows up before you asked for it.
 *
 * Restraint is the whole UX. The strip hides entirely when:
 *   - the workspace embedding pool is too small to be useful
 *   - the user's draft is too short to mean anything
 *   - nothing in the corpus clears the similarity threshold
 *
 * It also remembers per-session dismissals — if the user closes the strip
 * for the current draft, we don't re-pop it until they materially change
 * what they're typing.
 */
export function RelatedMemoryStrip({
  query,
  enabled,
}: {
  query: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const conversation = useWorkspaceStore((s) => s.conversation);

  // Per-draft dismissal: store the query the user dismissed against, so a
  // significantly different next draft re-engages the surface.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const dismissedActive =
    dismissedFor !== null && substantiallySimilar(dismissedFor, query);

  const { hits, loading } = useRelatedMemory({
    workspaceId: workspace?.id,
    conversationId: conversation?.id,
    query,
    enabled: enabled && !dismissedActive,
  });

  if (!enabled || dismissedActive) return null;
  if (hits.length === 0) return null;

  function jumpTo(hit: RelatedMemoryHitDTO) {
    if (!workspace) return;
    router.push(`/w/${workspace.id}?thread=${hit.conversationId}`);
    router.refresh();
  }

  return (
    <div className="border-t bg-card/30 px-3 pt-2">
      <div className="flex items-center justify-between gap-2 pb-1.5">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <BrainCircuit className="h-3 w-3 text-primary" />
          {hits.length} related past discussion{hits.length === 1 ? "" : "s"}
          {collapsed ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          )}
          {loading && (
            <span className="ml-1 text-[9px] text-muted-foreground/60">
              refreshing
            </span>
          )}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          onClick={() => setDismissedFor(query)}
          aria-label="Dismiss for this draft"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {!collapsed && (
        <ul className="mb-1.5 flex flex-col gap-1.5">
          {hits.map((hit) => (
            <li key={hit.messageId}>
              <button
                type="button"
                onClick={() => jumpTo(hit)}
                className="group w-full rounded-md border bg-card/60 px-2.5 py-1.5 text-left transition-colors hover:border-primary/30 hover:bg-card"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-medium text-muted-foreground group-hover:text-foreground">
                    {hit.conversationTitle}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider",
                      hit.similarity > 0.75
                        ? "bg-emerald-500/15 text-emerald-300"
                        : hit.similarity > 0.55
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {Math.round(hit.similarity * 100)}%
                  </span>
                </div>
                <p className="line-clamp-2 text-xs text-foreground/80">
                  {hit.snippet}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Cheap text-similarity gate for the dismissal memory. The goal is "did the
 * user meaningfully change what they're typing." We compare normalized
 * word sets via Jaccard — if the overlap stays high, treat it as the same
 * draft and keep the strip dismissed; otherwise re-engage.
 *
 * Threshold of 0.6 picks the right edge in practice: typo corrections /
 * appending a few words stays dismissed, switching topics re-engages.
 */
function substantiallySimilar(a: string, b: string): boolean {
  const at = tokenSet(a);
  const bt = tokenSet(b);
  if (at.size === 0 || bt.size === 0) return false;
  let intersection = 0;
  for (const t of at) if (bt.has(t)) intersection++;
  const union = at.size + bt.size - intersection;
  return union > 0 && intersection / union >= 0.6;
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}
