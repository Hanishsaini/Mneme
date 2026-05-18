"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MessageSquarePlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";

/**
 * Thread switcher above the message list. Renders:
 *   - a dropdown of all threads in this workspace (newest first)
 *   - "+ New thread" creates a fresh conversation and navigates to it
 *   - each non-active row has a delete action (the active thread is locked
 *     while it's the rendered one — switch off first to delete)
 *
 * Switching is implemented as a router.push to `/w/[id]?thread=[id]` so the
 * RSC re-fetches a fresh snapshot scoped to the new thread. Simpler and less
 * race-prone than reusing the socket connection with a manual delta refetch.
 */
export function ThreadSwitcher() {
  const router = useRouter();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const conversations = useWorkspaceStore((s) => s.conversations);
  const active = useWorkspaceStore((s) => s.conversation);
  const upsertConversation = useWorkspaceStore((s) => s.upsertConversation);
  const removeConversation = useWorkspaceStore((s) => s.removeConversation);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  if (!workspace || !active) return null;

  async function createThread() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspace!.id}/conversations`,
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
        throw new Error(data?.error ?? "Could not create thread");
      }
      const { conversation } = (await res.json()) as {
        conversation: { id: string; title: string };
      };
      upsertConversation({
        id: conversation.id,
        workspaceId: workspace!.id,
        title: conversation.title,
        summary: null,
        createdAt: new Date().toISOString(),
      });
      setOpen(false);
      router.push(`/w/${workspace!.id}?thread=${conversation.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create");
    } finally {
      setPending(false);
    }
  }

  async function deleteThread(id: string) {
    if (pending) return;
    if (conversations.length <= 1) {
      toast.error("Can't delete the only thread");
      return;
    }
    if (id === active!.id) {
      toast.error("Switch to another thread first");
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
      toast.success("Thread deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setPending(false);
    }
  }

  function switchThread(id: string) {
    if (id === active!.id) {
      setOpen(false);
      return;
    }
    setOpen(false);
    router.push(`/w/${workspace!.id}?thread=${id}`);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 border-b bg-card/40 px-3 py-2">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="min-w-0 max-w-[60%] justify-start gap-1.5 truncate font-medium"
          >
            <span className="truncate">{active.title}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Threads
          </DropdownMenuLabel>
          <div className="max-h-72 overflow-y-auto">
            {conversations.map((c) => (
              <DropdownMenuItem
                key={c.id}
                onSelect={(e) => {
                  e.preventDefault();
                  switchThread(c.id);
                }}
                className={cn(
                  "group flex items-center gap-2",
                  c.id === active.id && "bg-secondary",
                )}
              >
                <span className="flex-1 truncate text-sm">{c.title}</span>
                {c.id !== active.id && conversations.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      void deleteThread(c.id);
                    }}
                    className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
                    aria-label={`Delete ${c.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </DropdownMenuItem>
            ))}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void createThread();
            }}
            disabled={pending}
            className="gap-2"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{pending ? "Creating…" : "New thread"}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={createThread}
        disabled={pending}
        aria-label="New thread"
        className="h-7 w-7"
      >
        <MessageSquarePlus className="h-4 w-4" />
      </Button>
    </div>
  );
}
