"use client";

import { useState } from "react";
import { BrainCircuit, Check, Copy } from "lucide-react";
import { cn, formatTime, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Markdown } from "@/components/ui/markdown";
import type { MessageDTO } from "@workspace/shared";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { APP_NAME } from "@/config/constants";

/**
 * A single settled message. The streaming assistant bubble is a separate
 * component (`AiStreamRenderer`) so the high-frequency token updates don't
 * re-render the whole list.
 *
 * Assistant rows are tinted + carry the Mneme brand mark; user rows are
 * the page background. Hovering reveals a small Copy action — the action
 * group is on the right rail so it never displaces the message text.
 */
export function MessageBubble({ message }: { message: MessageDTO }) {
  const isAssistant = message.role === "ASSISTANT";
  const author = useWorkspaceStore((s) =>
    message.authorId
      ? s.workspace?.members.find((m) => m.userId === message.authorId)?.user
      : null,
  );
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Old browsers / insecure context — swallow.
    }
  }

  return (
    <div
      className={cn(
        "group/msg relative flex gap-3 px-4 py-4",
        isAssistant && "bg-secondary/20",
      )}
    >
      {isAssistant ? (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/30">
          <BrainCircuit className="h-3.5 w-3.5" />
        </div>
      ) : (
        <Avatar className="h-7 w-7 shrink-0">
          {author?.avatarUrl && (
            <AvatarImage src={author.avatarUrl} alt={author.name ?? ""} />
          )}
          <AvatarFallback className="text-[10px]">
            {initials(author?.name)}
          </AvatarFallback>
        </Avatar>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold">
            {isAssistant ? APP_NAME : (author?.name ?? "You")}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatTime(message.createdAt)}
          </span>
          {message.status === "ERROR" && (
            <span className="text-[10px] text-destructive">failed</span>
          )}
        </div>
        <Markdown content={message.content} />
      </div>

      {message.content && (
        <div className="pointer-events-none absolute right-3 top-3 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:pointer-events-auto group-hover/msg:opacity-100">
          <button
            type="button"
            onClick={copyMessage}
            className={cn(
              "flex items-center gap-1 rounded-md border border-border/60 bg-card/80 px-1.5 py-1 text-[10px] backdrop-blur transition-colors",
              copied
                ? "text-emerald-400"
                : "text-muted-foreground hover:bg-card hover:text-foreground",
            )}
            aria-label={copied ? "Copied" : "Copy message"}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
