"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { MemoryItemDTO, MemoryItemKind } from "@workspace/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";

/**
 * Memory panel — surfaces structured items extracted from past AI turns
 * (decisions / open questions / action items / context) and the items that
 * have rotted past their freshness threshold (the "Needs review" tab).
 *
 * Needs-review is the daily-engagement hook: stale DECISION/CONTEXT items
 * get a prominent "Still true" button (resets the staleness clock), stale
 * ACTION_ITEMs and QUESTIONs get a "Mark done" button. Each confirm/dismiss
 * propagates back to the header via `onStaleChange` so the red dot updates
 * without waiting for the next interval poll.
 */

type FilterKind = "NEEDS_REVIEW" | "ALL" | MemoryItemKind;

const TABS: Array<{ key: FilterKind; label: string }> = [
  { key: "NEEDS_REVIEW", label: "Needs review" },
  { key: "ALL", label: "All" },
  { key: "DECISION", label: "Decisions" },
  { key: "QUESTION", label: "Questions" },
  { key: "ACTION_ITEM", label: "Action items" },
  { key: "CONTEXT", label: "Context" },
];

const KIND_LABEL: Record<MemoryItemKind, string> = {
  DECISION: "Decision",
  QUESTION: "Question",
  ACTION_ITEM: "Action item",
  CONTEXT: "Context",
};

const KIND_BADGE: Record<MemoryItemKind, string> = {
  DECISION: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  QUESTION: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  ACTION_ITEM: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  CONTEXT: "bg-violet-500/15 text-violet-300 border-violet-500/30",
};

interface MemoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staleCount: number;
  onStaleChange: () => void;
}

export function MemoryPanel({
  open,
  onOpenChange,
  staleCount,
  onStaleChange,
}: MemoryPanelProps) {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const conversations = useWorkspaceStore((s) => s.conversations);
  const router = useRouter();

  // Default tab: if there's something to review, land there. Otherwise All.
  const [filter, setFilter] = useState<FilterKind>(
    staleCount > 0 ? "NEEDS_REVIEW" : "ALL",
  );
  const [items, setItems] = useState<MemoryItemDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-pick the default tab each time the panel opens, so the user always
  // lands on the most useful view for the current state.
  useEffect(() => {
    if (open) setFilter(staleCount > 0 ? "NEEDS_REVIEW" : "ALL");
  }, [open, staleCount]);

  const fetchItems = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    setError(null);
    try {
      let url: URL;
      if (filter === "NEEDS_REVIEW") {
        url = new URL(
          `/api/workspaces/${workspace.id}/memory/stale`,
          window.location.origin,
        );
      } else {
        url = new URL(
          `/api/workspaces/${workspace.id}/memory/items`,
          window.location.origin,
        );
        if (filter !== "ALL") url.searchParams.set("kind", filter);
      }
      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`Failed to load memory (${res.status})`);
      }
      const data = (await res.json()) as { items: MemoryItemDTO[] };
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memory");
    } finally {
      setLoading(false);
    }
  }, [workspace, filter]);

  useEffect(() => {
    if (open) void fetchItems();
  }, [open, fetchItems]);

  const counts = useMemo(() => {
    const c: Record<FilterKind, number> = {
      NEEDS_REVIEW: 0,
      ALL: items.length,
      DECISION: 0,
      QUESTION: 0,
      ACTION_ITEM: 0,
      CONTEXT: 0,
    };
    for (const it of items) c[it.kind]++;
    return c;
  }, [items]);
  // Tab counts only make sense on ALL (where every kind is present in the
  // fetched set). Other tabs already filter server-side.
  const showCount = filter === "ALL";

  /** Patch the server, then both the in-panel list and the header's stale
   *  count converge. Optimistic UI with rollback on failure. */
  async function applyPatch(
    item: MemoryItemDTO,
    patch: { resolved?: boolean; confirmed?: boolean },
    removeFromList: boolean,
  ) {
    const prev = items;
    if (removeFromList) {
      setItems((p) => p.filter((it) => it.id !== item.id));
    } else {
      setItems((p) =>
        p.map((it) => {
          if (it.id !== item.id) return it;
          return {
            ...it,
            ...(patch.resolved !== undefined
              ? { resolvedAt: patch.resolved ? new Date().toISOString() : null }
              : {}),
            ...(patch.confirmed !== undefined
              ? { confirmedAt: patch.confirmed ? new Date().toISOString() : null }
              : {}),
          };
        }),
      );
    }
    try {
      const res = await fetch(`/api/memory/items/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Could not update");
      onStaleChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
      setItems(prev);
    }
  }

  async function remove(item: MemoryItemDTO) {
    const prev = items;
    setItems((p) => p.filter((it) => it.id !== item.id));
    try {
      const res = await fetch(`/api/memory/items/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Could not delete");
      onStaleChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
      setItems(prev);
    }
  }

  function openSource(item: MemoryItemDTO) {
    if (!workspace) return;
    const conv = conversations.find((c) => c.id === item.conversationId);
    if (!conv) {
      toast.error("Source thread no longer exists");
      return;
    }
    onOpenChange(false);
    router.push(`/w/${workspace.id}?thread=${item.conversationId}`);
    router.refresh();
  }

  const isReviewMode = filter === "NEEDS_REVIEW";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(880px,95vw)] max-w-none flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" />
            Team memory
          </DialogTitle>
          <DialogDescription>
            Decisions, open questions, and action items extracted from past AI
            conversations in this workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-5 py-2">
          {TABS.map((tab) => {
            const isNeedsReview = tab.key === "NEEDS_REVIEW";
            const badge = isNeedsReview
              ? staleCount
              : showCount
                ? counts[tab.key]
                : 0;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === tab.key
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/50",
                  isNeedsReview && staleCount > 0 && filter !== tab.key && "text-destructive",
                )}
              >
                {isNeedsReview && <AlertCircle className="h-3 w-3" />}
                {tab.label}
                {badge > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] font-semibold leading-tight",
                      isNeedsReview
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-5 py-4">
            {isReviewMode && items.length > 0 && (
              <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                These items haven't been touched in a while. Confirm if still
                true, mark done, or remove if no longer relevant.
              </div>
            )}

            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading memory…
              </div>
            ) : error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : items.length === 0 ? (
              <EmptyState filter={filter} />
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((it) => (
                  <MemoryRow
                    key={it.id}
                    item={it}
                    reviewMode={isReviewMode}
                    onConfirm={(item) =>
                      applyPatch(item, { confirmed: true }, isReviewMode)
                    }
                    onResolve={(item) =>
                      applyPatch(item, { resolved: true }, isReviewMode)
                    }
                    onUnresolve={(item) =>
                      applyPatch(item, { resolved: false }, false)
                    }
                    onDelete={remove}
                    onOpenSource={openSource}
                  />
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface MemoryRowProps {
  item: MemoryItemDTO;
  reviewMode: boolean;
  onConfirm: (item: MemoryItemDTO) => void;
  onResolve: (item: MemoryItemDTO) => void;
  onUnresolve: (item: MemoryItemDTO) => void;
  onDelete: (item: MemoryItemDTO) => void;
  onOpenSource: (item: MemoryItemDTO) => void;
}

function MemoryRow({
  item,
  reviewMode,
  onConfirm,
  onResolve,
  onUnresolve,
  onDelete,
  onOpenSource,
}: MemoryRowProps) {
  const resolved = Boolean(item.resolvedAt);
  const isActionItem = item.kind === "ACTION_ITEM";
  const isQuestion = item.kind === "QUESTION";
  const isDecisionLike = item.kind === "DECISION" || item.kind === "CONTEXT";

  return (
    <li
      className={cn(
        "group flex items-start gap-3 rounded-lg border bg-card/40 px-3 py-2.5 transition-colors hover:bg-card/70",
        resolved && "opacity-60",
        reviewMode && "border-amber-500/20",
      )}
    >
      {isActionItem && !reviewMode ? (
        <button
          type="button"
          onClick={() => (resolved ? onUnresolve(item) : onResolve(item))}
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={resolved ? "Mark as open" : "Mark as resolved"}
        >
          {resolved ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
        </button>
      ) : (
        <Badge
          variant="outline"
          className={cn(
            "mt-0.5 shrink-0 px-1.5 py-0 text-[10px]",
            KIND_BADGE[item.kind],
          )}
        >
          {KIND_LABEL[item.kind]}
        </Badge>
      )}

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "break-words text-sm leading-snug",
            resolved && "line-through",
          )}
        >
          {item.text}
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {reviewMode
            ? `${daysSince(item.confirmedAt ?? item.createdAt)}d since ${item.confirmedAt ? "confirmed" : "logged"}`
            : new Date(item.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
        </p>
      </div>

      <div
        className={cn(
          "flex shrink-0 items-center gap-1",
          !reviewMode && "opacity-0 transition-opacity group-hover:opacity-100",
        )}
      >
        {reviewMode && isDecisionLike && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-emerald-500/30 px-2 text-xs text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
            onClick={() => onConfirm(item)}
          >
            <CheckCircle2 className="h-3 w-3" />
            Still true
          </Button>
        )}
        {reviewMode && (isActionItem || isQuestion) && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-emerald-500/30 px-2 text-xs text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
            onClick={() => onResolve(item)}
          >
            <CheckCircle2 className="h-3 w-3" />
            {isActionItem ? "Mark done" : "Answered"}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Open source thread"
          onClick={() => onOpenSource(item)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          aria-label="Delete item"
          onClick={() => onDelete(item)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000)));
}

function EmptyState({ filter }: { filter: FilterKind }) {
  if (filter === "NEEDS_REVIEW") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-400/60" />
        <p className="text-sm font-medium">All clear</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Nothing stale right now. Decisions get surfaced here after 45 days,
          action items after a week.
        </p>
      </div>
    );
  }
  const label =
    filter === "ALL"
      ? "memory items"
      : TABS.find((t) => t.key === filter)?.label.toLowerCase();
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <BrainCircuit className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium">No {label} yet</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Have a conversation with the AI — decisions, questions, and action
        items get pulled out automatically as you chat.
      </p>
    </div>
  );
}
