"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BrainCircuit,
  MessageSquarePlus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { ConversationDTO } from "@workspace/shared";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/config/constants";
import { useWorkspaceStore } from "@/stores/workspace-store";

/**
 * Mneme's left rail — Claude/ChatGPT-style.
 *
 *   - Brand block at the top with the active workspace name
 *   - Prominent "New chat" CTA
 *   - Recency-bucketed conversation list (Today / Yesterday / Last 7 days /
 *     Older) with the active thread highlighted
 *   - Search hint at the bottom
 *
 * Static on desktop (lg+), animated slide-in drawer on smaller screens.
 * Replaced the prior thread-switcher dropdown that lived above the
 * message list — conversations are first-class navigation now.
 */
export function AppSidebar({
  open,
  onClose,
  onOpenPalette,
}: {
  open: boolean;
  onClose: () => void;
  onOpenPalette: () => void;
}) {
  const router = useRouter();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const conversations = useWorkspaceStore((s) => s.conversations);
  const active = useWorkspaceStore((s) => s.conversation);
  const upsertConversation = useWorkspaceStore((s) => s.upsertConversation);
  const removeConversation = useWorkspaceStore((s) => s.removeConversation);
  const [pending, setPending] = useState(false);

  async function createThread() {
    if (!workspace || pending) return;
    setPending(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspace.id}/conversations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Could not create chat");
      }
      const { conversation } = (await res.json()) as {
        conversation: { id: string; title: string };
      };
      upsertConversation({
        id: conversation.id,
        workspaceId: workspace.id,
        title: conversation.title,
        summary: null,
        createdAt: new Date().toISOString(),
      });
      onClose();
      router.push(`/w/${workspace.id}?thread=${conversation.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create");
    } finally {
      setPending(false);
    }
  }

  async function deleteThread(id: string) {
    if (!workspace || pending) return;
    if (conversations.length <= 1) {
      toast.error("Can't delete the only chat");
      return;
    }
    if (id === active?.id) {
      toast.error("Switch to another chat first");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Could not delete");
      }
      removeConversation(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setPending(false);
    }
  }

  function switchThread(id: string) {
    if (!workspace || id === active?.id) {
      onClose();
      return;
    }
    onClose();
    router.push(`/w/${workspace.id}?thread=${id}`);
    router.refresh();
  }

  const buckets = bucketByRecency(conversations);

  const body = (
    <div className="flex h-full flex-col">
      {/* Brand + workspace */}
      <div className="flex shrink-0 items-center gap-2.5 border-b px-3 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
          <BrainCircuit className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{APP_NAME}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {workspace?.name ?? "Workspace"}
          </p>
        </div>
      </div>

      {/* New chat CTA */}
      <div className="shrink-0 p-2">
        <button
          type="button"
          onClick={createThread}
          disabled={pending}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-input bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-card hover:text-foreground disabled:opacity-50"
        >
          <MessageSquarePlus className="h-4 w-4" />
          {pending ? "Creating…" : "New chat"}
        </button>
      </div>

      {/* Conversation list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
        {conversations.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            No chats yet. Start a new one above.
          </p>
        ) : (
          buckets.map((bucket) => (
            <div key={bucket.label} className="mb-2">
              <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {bucket.label}
              </p>
              <ul className="space-y-0.5">
                {bucket.items.map((c) => {
                  const isActive = c.id === active?.id;
                  return (
                    <li key={c.id}>
                      <div
                        className={cn(
                          "group flex items-center gap-1.5 rounded-md transition-colors",
                          isActive ? "bg-secondary" : "hover:bg-secondary/40",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => switchThread(c.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left"
                        >
                          <span
                            className={cn(
                              "truncate text-sm",
                              isActive
                                ? "font-medium text-foreground"
                                : "text-muted-foreground group-hover:text-foreground",
                            )}
                          >
                            {c.title}
                          </span>
                        </button>
                        {!isActive && conversations.length > 1 && (
                          <button
                            type="button"
                            onClick={() => deleteThread(c.id)}
                            disabled={pending}
                            aria-label={`Delete ${c.title}`}
                            className="mr-1.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      <Separator />

      <div className="shrink-0 p-2">
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenPalette();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search</span>
          <kbd className="ml-auto rounded border bg-muted px-1 py-0.5 text-[9px] font-medium">
            ⌘K
          </kbd>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden w-64 shrink-0 border-r bg-card/40 lg:block">
        {body}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 border-r bg-card lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
            >
              {body}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

interface Bucket {
  label: string;
  items: ConversationDTO[];
}

/**
 * Group conversations into Today / Yesterday / Last 7 days / Older, using
 * `createdAt` as the ordering key (we already sort newest-first upstream).
 * Same layout pattern as Claude / ChatGPT — gives the list shape and
 * makes "what did I work on this week" a one-glance answer.
 */
function bucketByRecency(conversations: ConversationDTO[]): Bucket[] {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const today = startOfDay(now);
  const yesterday = today - DAY;
  const weekAgo = today - 7 * DAY;

  const todayItems: ConversationDTO[] = [];
  const yesterdayItems: ConversationDTO[] = [];
  const weekItems: ConversationDTO[] = [];
  const olderItems: ConversationDTO[] = [];

  for (const c of conversations) {
    const t = new Date(c.createdAt).getTime();
    if (t >= today) todayItems.push(c);
    else if (t >= yesterday) yesterdayItems.push(c);
    else if (t >= weekAgo) weekItems.push(c);
    else olderItems.push(c);
  }

  const buckets: Bucket[] = [];
  if (todayItems.length) buckets.push({ label: "Today", items: todayItems });
  if (yesterdayItems.length)
    buckets.push({ label: "Yesterday", items: yesterdayItems });
  if (weekItems.length)
    buckets.push({ label: "Last 7 days", items: weekItems });
  if (olderItems.length) buckets.push({ label: "Older", items: olderItems });
  return buckets;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
