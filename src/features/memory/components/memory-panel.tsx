"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDown,
  Brain,
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  GitBranch,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { MemoryAskView } from "./memory-ask-view";

/**
 * Memory panel — the dossier surface for everything Mneme has captured,
 * connected, and evolved for this workspace.
 *
 * Four top-level views, picked to match the three engineering stages plus
 * the Q&A entry point:
 *   - Ask        — Q&A over the workspace's past discussions
 *   - Memory     — chronological list of captured items, with kind chips
 *                  and a "recently revisited" callout when relevant
 *   - Review     — stale items that need a "still true" or "mark done"
 *                  touch from a human
 *   - History    — the supersession spine: every decision the team has
 *                  revised, with the inline chain-walk
 *
 * Visual register is dossier — serif headlines, mono labels for ids and
 * timestamps, hairline rules, amber as the only accent. Matches the
 * landing aesthetic; signals "this is a record, not a chatbot."
 */

type TopTab = "ASK" | "MEMORY" | "REVIEW" | "HISTORY";
type KindChip = MemoryItemKind | "ALL";

const TOP_TABS: Array<{ key: TopTab; label: string; sublabel: string }> = [
  { key: "ASK", label: "Ask", sublabel: "Q&A" },
  { key: "MEMORY", label: "Memory", sublabel: "Captured" },
  { key: "REVIEW", label: "Review", sublabel: "Needs touch" },
  { key: "HISTORY", label: "History", sublabel: "Revisions" },
];

const KIND_CHIPS: Array<{ key: KindChip; label: string }> = [
  { key: "ALL", label: "All kinds" },
  { key: "DECISION", label: "Decisions" },
  { key: "QUESTION", label: "Questions" },
  { key: "ACTION_ITEM", label: "Action items" },
  { key: "CONTEXT", label: "Context" },
];

const KIND_LABEL: Record<MemoryItemKind, string> = {
  DECISION: "Decision",
  QUESTION: "Question",
  ACTION_ITEM: "Action",
  CONTEXT: "Context",
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

  const [tab, setTab] = useState<TopTab>(
    staleCount > 0 ? "REVIEW" : "MEMORY",
  );
  const [kindChip, setKindChip] = useState<KindChip>("ALL");
  const [items, setItems] = useState<MemoryItemDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Revisited + quarter count — fetched alongside the panel opening so
   *  both the Memory tab callout and the header stats pill render without
   *  a second round-trip. */
  const [revisited, setRevisited] = useState<RevisitedDecisionDTO[]>([]);
  const [quarterCount, setQuarterCount] = useState(0);

  // Re-pick the default tab each time the panel opens, so the user always
  // lands on the most useful view for the current state.
  useEffect(() => {
    if (open) {
      setTab(staleCount > 0 ? "REVIEW" : "MEMORY");
      setKindChip("ALL");
    }
  }, [open, staleCount]);

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
        // Progressive enhancement — don't block the panel on a transient miss.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, workspace]);

  const fetchItems = useCallback(async () => {
    if (!workspace) return;
    if (tab === "ASK") {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let url: URL;
      if (tab === "REVIEW") {
        url = new URL(
          `/api/workspaces/${workspace.id}/memory/stale`,
          window.location.origin,
        );
      } else {
        url = new URL(
          `/api/workspaces/${workspace.id}/memory/items`,
          window.location.origin,
        );
        if (tab === "MEMORY" && kindChip !== "ALL") {
          url.searchParams.set("kind", kindChip);
        }
      }
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Failed to load memory (${res.status})`);
      const data = (await res.json()) as { items: MemoryItemDTO[] };
      const filtered =
        tab === "HISTORY"
          ? data.items.filter((it) => it.revisionCount > 0)
          : data.items;
      setItems(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memory");
    } finally {
      setLoading(false);
    }
  }, [workspace, tab, kindChip]);

  useEffect(() => {
    if (open) void fetchItems();
  }, [open, fetchItems]);

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

  const isReview = tab === "REVIEW";
  const isAsk = tab === "ASK";
  const isHistory = tab === "HISTORY";
  const isMemory = tab === "MEMORY";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[min(960px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0">
        {/* ── Header ───────────────────────────────────────────────── */}
        <DialogHeader className="space-y-0 border-b border-border/60 bg-card/40 px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="mb-1 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
                <span className="h-px w-5 bg-primary/60" />
                Dossier
              </p>
              <DialogTitle className="font-serif text-2xl font-medium tracking-tight">
                Team memory
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-muted-foreground">
                Every decision, question, and commitment your team has
                made — captured, connected, and evolving.
              </DialogDescription>
            </div>
            {quarterCount > 0 && (
              <div
                className="hidden rounded-md border border-primary/30 bg-primary/[0.06] px-3 py-2 text-right sm:block"
                title="Memory items revised in the last 90 days"
              >
                <p className="font-mono text-[9px] uppercase tracking-wider text-primary/80">
                  Revised this quarter
                </p>
                <p className="mt-0.5 font-serif text-xl font-medium tracking-tight text-primary">
                  {quarterCount}
                </p>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* ── Top tabs ─────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-border/60 px-6">
          <div className="flex gap-6">
            {TOP_TABS.map((t) => {
              const active = tab === t.key;
              const badge =
                t.key === "REVIEW"
                  ? staleCount
                  : t.key === "HISTORY"
                    ? quarterCount
                    : 0;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "group relative flex flex-col items-start py-3 text-left transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-2 font-serif text-base font-medium tracking-tight">
                    {t.label}
                    {badge > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0 font-mono text-[10px] font-normal",
                          t.key === "REVIEW"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-primary/15 text-primary",
                        )}
                      >
                        {badge}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
                    {t.sublabel}
                  </span>
                  {active && (
                    <span className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Kind chips (Memory tab only) ──────────────────────────── */}
        {isMemory && (
          <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border/60 bg-card/30 px-6 py-2.5">
            {KIND_CHIPS.map((c) => {
              const active = kindChip === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setKindChip(c.key)}
                  className={cn(
                    "whitespace-nowrap rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Body ─────────────────────────────────────────────────── */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-6 py-5">
            {isAsk && workspace ? (
              <MemoryAskView
                workspaceId={workspace.id}
                onClose={() => onOpenChange(false)}
              />
            ) : null}

            {isMemory && revisited.length > 0 && (
              <RevisitedCallout items={revisited} onJumpToHistory={() => setTab("HISTORY")} />
            )}

            {isReview && items.length > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.04] px-3 py-2.5 text-xs text-foreground/80">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <p>
                  These haven&apos;t been touched in a while. Confirm if still
                  true, mark done, or remove if no longer relevant.
                </p>
              </div>
            )}

            {!isAsk &&
              (loading && items.length === 0 ? (
                <LoadingRow />
              ) : error ? (
                <ErrorRow message={error} />
              ) : items.length === 0 ? (
                isMemory && revisited.length > 0 ? null : (
                  <EmptyState tab={tab} />
                )
              ) : isHistory ? (
                <ul className="flex flex-col">
                  {items.map((it) => (
                    <HistoryRow key={it.id} item={it} />
                  ))}
                </ul>
              ) : (
                <ul className="flex flex-col">
                  {items.map((it) => (
                    <DossierRow
                      key={it.id}
                      item={it}
                      reviewMode={isReview}
                      onConfirm={(item) =>
                        applyPatch(item, { confirmed: true }, isReview)
                      }
                      onResolve={(item) =>
                        applyPatch(item, { resolved: true }, isReview)
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

/* ── Rows ────────────────────────────────────────────────────────── */

interface DossierRowProps {
  item: MemoryItemDTO;
  reviewMode: boolean;
  onConfirm: (item: MemoryItemDTO) => void;
  onResolve: (item: MemoryItemDTO) => void;
  onUnresolve: (item: MemoryItemDTO) => void;
  onDelete: (item: MemoryItemDTO) => void;
  onOpenSource: (item: MemoryItemDTO) => void;
}

function DossierRow({
  item,
  reviewMode,
  onConfirm,
  onResolve,
  onUnresolve,
  onDelete,
  onOpenSource,
}: DossierRowProps) {
  const resolved = Boolean(item.resolvedAt);
  const isActionItem = item.kind === "ACTION_ITEM";
  const isQuestion = item.kind === "QUESTION";
  const isDecisionLike = item.kind === "DECISION" || item.kind === "CONTEXT";

  return (
    <li
      className={cn(
        "group grid grid-cols-[100px_1fr_auto] items-start gap-4 border-b border-border/60 py-4 last:border-b-0",
        resolved && "opacity-55",
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
          {KIND_LABEL[item.kind]}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
          {reviewMode
            ? `${daysSince(item.confirmedAt ?? item.createdAt)}d ${item.confirmedAt ? "confirmed" : "logged"}`
            : new Date(item.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
        </span>
      </div>

      <div className="min-w-0">
        <div className="flex items-start gap-2">
          {isActionItem && !reviewMode && (
            <button
              type="button"
              onClick={() => (resolved ? onUnresolve(item) : onResolve(item))}
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={resolved ? "Mark as open" : "Mark as resolved"}
            >
              {resolved ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <Circle className="h-4 w-4" />
              )}
            </button>
          )}
          <p
            className={cn(
              "font-serif text-[15px] leading-snug",
              resolved && "line-through",
            )}
          >
            {item.text}
          </p>
        </div>
        {item.revisionCount > 0 && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
            <GitBranch className="h-2.5 w-2.5" />
            Revised {item.revisionCount}×
          </p>
        )}
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
            className="h-7 gap-1 border-primary/40 px-2 font-mono text-[10px] uppercase tracking-wider text-primary hover:bg-primary/10 hover:text-primary"
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
            className="h-7 gap-1 border-primary/40 px-2 font-mono text-[10px] uppercase tracking-wider text-primary hover:bg-primary/10 hover:text-primary"
            onClick={() => onResolve(item)}
          >
            <CheckCircle2 className="h-3 w-3" />
            {isActionItem ? "Done" : "Answered"}
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

/**
 * History tab row — current head text + a "N revisions" toggle that
 * lazy-loads the full chain from /api/memory/items/:id/history and
 * renders each ancestor with its operation label + the LLM's why.
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
        // Endpoint returns newest-first (head → root). Render oldest-first so
        // the reader walks the decision top-down. Drop the head — already shown.
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
    <li className="border-b border-border/60 py-4 last:border-b-0">
      <div className="grid grid-cols-[100px_1fr_auto] items-start gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
            {KIND_LABEL[item.kind]}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
            {new Date(item.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
        <p className="font-serif text-[15px] leading-snug">{item.text}</p>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/30 bg-primary/[0.06] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-primary transition-colors hover:bg-primary/15"
        >
          <GitBranch className="h-3 w-3" />
          {item.revisionCount} {item.revisionCount === 1 ? "rev" : "revs"}
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")}
          />
        </button>
      </div>

      {expanded && (
        <div className="ml-[100px] mt-3 pl-4">
          {chainLoading ? (
            <div className="flex items-center gap-2 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading chain
            </div>
          ) : chain && chain.length > 0 ? (
            <ol className="relative space-y-4">
              <span
                aria-hidden
                className="absolute left-[6px] top-2 bottom-2 w-px bg-border"
              />
              {chain.map((entry) => (
                <li key={entry.id} className="relative pl-6">
                  <span className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-border bg-card" />
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    · Revised
                  </p>
                  <p className="mt-1 font-serif text-[14px] leading-snug text-foreground/85">
                    {entry.text}
                  </p>
                  {entry.supersededReason && (
                    <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-primary/80">
                        Why ·
                      </span>{" "}
                      {entry.supersededReason}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              No prior revisions
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Top-of-Memory callout — "decisions revisited recently". The supersession
 * moat surfaced inside the most-visited tab. Each card collapses the
 * Originally → Now → Why preview without burying it behind a click.
 */
function RevisitedCallout({
  items,
  onJumpToHistory,
}: {
  items: RevisitedDecisionDTO[];
  onJumpToHistory: () => void;
}) {
  return (
    <section className="mb-6 rounded-lg border border-primary/25 bg-primary/[0.04] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 text-primary" />
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
            Decisions revisited recently
          </p>
        </div>
        <button
          type="button"
          onClick={onJumpToHistory}
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          See all in History
          <ChevronDown className="h-3 w-3 -rotate-90" />
        </button>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {items.slice(0, 4).map((r) => (
          <li
            key={r.current.id}
            className="rounded-md border border-border/70 bg-card/70 p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
                Revised {r.current.revisionCount}×
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                {timeAgo(r.current.updatedAt)}
              </span>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              Originally
            </p>
            <p className="mt-0.5 font-serif text-[13px] italic leading-snug text-muted-foreground line-through decoration-muted-foreground/40">
              {r.prior.text}
            </p>
            <div className="my-2 flex items-center gap-1.5 text-muted-foreground/50">
              <span className="h-px flex-1 bg-border" />
              <ArrowDown className="h-3 w-3" />
              <span className="h-px flex-1 bg-border" />
            </div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-primary/80">
              Now
            </p>
            <p className="mt-0.5 font-serif text-[13px] leading-snug">
              {r.current.text}
            </p>
            {r.prior.reason && (
              <p className="mt-3 border-t border-border/50 pt-2 text-[11px] leading-snug text-muted-foreground">
                <span className="font-mono text-[9px] uppercase tracking-wider text-primary/80">
                  Why ·
                </span>{" "}
                {r.prior.reason}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Small parts ─────────────────────────────────────────────────── */

function LoadingRow() {
  return (
    <div className="flex items-center justify-center gap-2 py-12 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      Loading dossier
    </div>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/[0.05] px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

function EmptyState({ tab }: { tab: TopTab }) {
  if (tab === "REVIEW") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <CheckCircle2 className="h-7 w-7 text-primary/70" />
        <p className="font-serif text-base font-medium">All clear</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Nothing stale right now. Decisions surface here after 45 days,
          action items after a week.
        </p>
      </div>
    );
  }
  if (tab === "HISTORY") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <GitBranch className="h-7 w-7 text-muted-foreground/60" />
        <p className="font-serif text-base font-medium">
          No revisions yet
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          When your team revises a past decision and lands somewhere new,
          the old version moves here with the rationale for the change.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <Brain className="h-7 w-7 text-muted-foreground/60" />
      <p className="font-serif text-base font-medium">No memory yet</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Have a conversation with the AI — decisions, questions, and action
        items get pulled out automatically as you chat.
      </p>
    </div>
  );
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000)));
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1mo ago" : `${months}mo ago`;
}
