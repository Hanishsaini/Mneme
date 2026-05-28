"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDown,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  GitBranch,
  History,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type {
  MemoryItemDTO,
  MemoryItemKind,
  RevisitedDecisionDTO,
  RevisitedMemoryResponseDTO,
} from "@workspace/shared";
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
import { MemoryAskView } from "./memory-ask-view";

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

type FilterKind = "ASK" | "NEEDS_REVIEW" | "HISTORY" | "ALL" | MemoryItemKind;

const TABS: Array<{ key: FilterKind; label: string }> = [
  { key: "ASK", label: "Ask" },
  { key: "NEEDS_REVIEW", label: "Needs review" },
  { key: "HISTORY", label: "History" },
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
  /** "Decisions revisited recently" data — fetched alongside the panel
   *  opening so the Needs Review surface and the header stats pill can
   *  render without a second round-trip. */
  const [revisited, setRevisited] = useState<RevisitedDecisionDTO[]>([]);
  const [quarterCount, setQuarterCount] = useState(0);

  // Re-pick the default tab each time the panel opens, so the user always
  // lands on the most useful view for the current state.
  useEffect(() => {
    if (open) setFilter(staleCount > 0 ? "NEEDS_REVIEW" : "ALL");
  }, [open, staleCount]);

  // Revisited fetch fires once per panel open — independent of the active
  // tab, since both the Needs Review section and the header pill consume it.
  useEffect(() => {
    if (!open || !workspace) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/workspaces/${workspace.id}/memory/revisited`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as RevisitedMemoryResponseDTO;
        if (cancelled) return;
        setRevisited(data.items);
        setQuarterCount(data.quarterCount);
      } catch {
        // Stats pill + revisited surface are progressive enhancements —
        // don't block the panel on a transient failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, workspace]);

  const fetchItems = useCallback(async () => {
    if (!workspace) return;
    // The Ask tab is interactive — it doesn't fetch a list of items, it
    // submits a question per user action. Skip the GET entirely.
    if (filter === "ASK") {
      setItems([]);
      setLoading(false);
      return;
    }
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
        // History reuses /items — we just filter to revised heads client-side
        // below. Avoids a parallel server endpoint for what is a small subset.
        if (filter !== "ALL" && filter !== "HISTORY") {
          url.searchParams.set("kind", filter);
        }
      }
      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`Failed to load memory (${res.status})`);
      }
      const data = (await res.json()) as { items: MemoryItemDTO[] };
      const filtered =
        filter === "HISTORY"
          ? data.items.filter((it) => it.revisionCount > 0)
          : data.items;
      setItems(filtered);
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
      ASK: 0,
      NEEDS_REVIEW: 0,
      HISTORY: 0,
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
  const isAskMode = filter === "ASK";
  const isHistoryMode = filter === "HISTORY";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(880px,95vw)] max-w-none flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" />
            Team memory
            {quarterCount > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-300"
                title="Memory items revised in the last 90 days"
              >
                <RefreshCw className="h-3 w-3" />
                {quarterCount}{" "}
                {quarterCount === 1 ? "decision" : "decisions"} revised this
                quarter
              </span>
            )}
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
            {isAskMode && workspace ? (
              <MemoryAskView
                workspaceId={workspace.id}
                onClose={() => onOpenChange(false)}
              />
            ) : isReviewMode ? (
              <>
                {revisited.length > 0 && (
                  <RevisitedSection items={revisited} />
                )}
                {items.length > 0 && (
                  <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                    These items haven't been touched in a while. Confirm if
                    still true, mark done, or remove if no longer relevant.
                  </div>
                )}
              </>
            ) : null}

            {!isAskMode && (loading && items.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading memory…
              </div>
            ) : error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : items.length === 0 ? (
              // In Needs Review, the EmptyState is misleading when the
              // revisited section above DID render content. Suppress it
              // there — the user already sees the panel is alive.
              isReviewMode && revisited.length > 0 ? null : (
                <EmptyState filter={filter} />
              )
            ) : isHistoryMode ? (
              <ul className="flex flex-col gap-1">
                {items.map((it) => (
                  <HistoryRow key={it.id} item={it} />
                ))}
              </ul>
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
            ))}
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
        <p className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>
            {reviewMode
              ? `${daysSince(item.confirmedAt ?? item.createdAt)}d since ${item.confirmedAt ? "confirmed" : "logged"}`
              : new Date(item.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
          </span>
          {item.revisionCount > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-1.5 py-0 normal-case tracking-normal text-violet-300"
              title="This item replaced earlier revisions. Future versions will get the dedicated history viewer."
            >
              <History className="h-2.5 w-2.5" />
              Revised
            </span>
          )}
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
  if (filter === "HISTORY") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <GitBranch className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">No revised decisions yet</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          When the team revisits a past decision and lands somewhere new,
          the old version moves here with the rationale for the change.
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

/**
 * Top-of-panel section in Needs Review: "Decisions revisited recently".
 * Each card surfaces the Originally / Now / Why preview the extractor
 * already wrote — same data the History tab expands fully.
 */
function RevisitedSection({ items }: { items: RevisitedDecisionDTO[] }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Decisions revisited recently
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((r) => (
          <li
            key={r.current.id}
            className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2.5"
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                Revised {r.current.revisionCount}×
              </span>
              <span className="text-[10px] text-muted-foreground">
                {timeAgo(r.current.updatedAt)}
              </span>
            </div>
            <div className="grid grid-cols-[60px_1fr] items-baseline gap-x-2 gap-y-1 text-xs">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Originally
              </span>
              <span className="text-muted-foreground line-through decoration-muted-foreground/40">
                {r.prior.text}
              </span>
              <span className="col-span-2 my-0.5 flex items-center gap-1.5 text-muted-foreground/60">
                <span className="h-px flex-1 bg-border" />
                <ArrowDown className="h-3 w-3" />
                <span className="h-px flex-1 bg-border" />
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Now
              </span>
              <span className="leading-snug">{r.current.text}</span>
              {r.prior.reason && (
                <>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Why
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {r.prior.reason}
                  </span>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * History tab row — current head text + a "N revisions" toggle that
 * lazily loads the full chain from /api/memory/items/:id/history and
 * renders each ancestor with its op label + the LLM's why.
 */
function HistoryRow({ item }: { item: MemoryItemDTO }) {
  const [expanded, setExpanded] = useState(false);
  const [chain, setChain] = useState<MemoryItemDTO[] | null>(null);
  const [chainLoading, setChainLoading] = useState(false);

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && chain === null) {
      setChainLoading(true);
      try {
        const res = await fetch(`/api/memory/items/${item.id}/history`);
        if (!res.ok) throw new Error("Could not load history");
        const data = (await res.json()) as { items: MemoryItemDTO[] };
        // Endpoint returns newest-first (head → root). Render oldest-first
        // so the reader walks the decision's evolution top-down. Drop the
        // first element (the head itself — already shown above the chain).
        setChain(data.items.slice(1).reverse());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not load history");
        setExpanded(false);
      } finally {
        setChainLoading(false);
      }
    }
  }

  return (
    <li className="border-b border-border/50 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <p className="flex-1 break-words text-sm leading-snug">{item.text}</p>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-secondary/50 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary"
        >
          <GitBranch className="h-3 w-3" />
          {item.revisionCount}{" "}
          {item.revisionCount === 1 ? "revision" : "revisions"}
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")}
          />
        </button>
      </div>

      {expanded && (
        <div className="ml-1 mt-2 border-l-2 border-border/60 pl-3">
          {chainLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading history…
            </div>
          ) : chain && chain.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {chain.map((entry) => (
                <li key={entry.id}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-full bg-sky-500/15 px-1.5 py-0 text-[10px] font-medium text-sky-300">
                      UPDATE
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="text-xs leading-snug">{entry.text}</p>
                  {entry.supersededReason && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {entry.supersededReason}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-1 text-[11px] text-muted-foreground">
              No prior revisions found.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}
