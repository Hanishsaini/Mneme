"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
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
 * The Memory panel — surfaces structured items extracted from past AI turns
 * (decisions, open questions, action items, ambient context). Items are
 * grouped by kind via the tab strip; clicking the source link jumps to the
 * originating thread.
 *
 * Lives in a Dialog so it overlays the main workspace without stealing
 * space from chat/canvas. Fetch happens on open and on tab change — cheap
 * enough not to need stale-while-revalidate yet.
 */

type FilterKind = "ALL" | MemoryItemKind;

const TABS: Array<{ key: FilterKind; label: string }> = [
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

export function MemoryPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const conversations = useWorkspaceStore((s) => s.conversations);
  const router = useRouter();

  const [filter, setFilter] = useState<FilterKind>("ALL");
  const [items, setItems] = useState<MemoryItemDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    setError(null);
    try {
      const url = new URL(
        `/api/workspaces/${workspace.id}/memory/items`,
        window.location.origin,
      );
      if (filter !== "ALL") url.searchParams.set("kind", filter);
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
      ALL: items.length,
      DECISION: 0,
      QUESTION: 0,
      ACTION_ITEM: 0,
      CONTEXT: 0,
    };
    for (const it of items) c[it.kind]++;
    return c;
  }, [items]);

  // When a filter is active the API already narrowed; counts only reflect
  // that slice. So we only display the per-tab badge on ALL.
  const showCount = filter === "ALL";

  async function toggleResolved(item: MemoryItemDTO) {
    const next = !item.resolvedAt;
    // Optimistic flip — revert on failure.
    setItems((prev) =>
      prev.map((p) =>
        p.id === item.id
          ? { ...p, resolvedAt: next ? new Date().toISOString() : null }
          : p,
      ),
    );
    try {
      const res = await fetch(`/api/memory/items/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolved: next }),
      });
      if (!res.ok) throw new Error("Could not update");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
      setItems((prev) =>
        prev.map((p) =>
          p.id === item.id ? { ...p, resolvedAt: item.resolvedAt } : p,
        ),
      );
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
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === tab.key
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50",
              )}
            >
              {tab.label}
              {showCount && counts[tab.key] > 0 && (
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-5 py-4">
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
                    onToggleResolved={toggleResolved}
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

function MemoryRow({
  item,
  onToggleResolved,
  onDelete,
  onOpenSource,
}: {
  item: MemoryItemDTO;
  onToggleResolved: (item: MemoryItemDTO) => void;
  onDelete: (item: MemoryItemDTO) => void;
  onOpenSource: (item: MemoryItemDTO) => void;
}) {
  const resolved = Boolean(item.resolvedAt);
  const isActionItem = item.kind === "ACTION_ITEM";

  return (
    <li
      className={cn(
        "group flex items-start gap-3 rounded-lg border bg-card/40 px-3 py-2.5 transition-colors hover:bg-card/70",
        resolved && "opacity-60",
      )}
    >
      {isActionItem ? (
        <button
          type="button"
          onClick={() => onToggleResolved(item)}
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
          className={cn("mt-0.5 shrink-0 px-1.5 py-0 text-[10px]", KIND_BADGE[item.kind])}
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
          {new Date(item.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
          {isActionItem && (
            <span className="ml-2">
              {KIND_LABEL[item.kind]}
            </span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
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

function EmptyState({ filter }: { filter: FilterKind }) {
  const label =
    filter === "ALL" ? "memory items" : TABS.find((t) => t.key === filter)?.label.toLowerCase();
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
