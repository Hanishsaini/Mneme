"use client";

import { cn, formatTime, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Markdown } from "@/components/ui/markdown";
import type { MessageDTO } from "@workspace/shared";
import { useWorkspaceStore } from "@/stores/workspace-store";

/**
 * A single settled message. The streaming assistant bubble is a separate
 * component (`AiStreamRenderer`) so the high-frequency token updates don't
 * re-render the whole list.
 */
export function MessageBubble({ message }: { message: MessageDTO }) {
  const isAssistant = message.role === "ASSISTANT";
  const author = useWorkspaceStore((s) =>
    message.authorId
      ? s.workspace?.members.find((m) => m.userId === message.authorId)?.user
      : null,
  );

  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-3",
        isAssistant ? "bg-secondary/30" : "",
      )}
    >
      <Avatar className="h-7 w-7 shrink-0">
        {isAssistant ? (
          <AvatarFallback className="bg-primary text-primary-foreground">
            AI
          </AvatarFallback>
        ) : (
          <>
            {author?.avatarUrl && (
              <AvatarImage src={author.avatarUrl} alt={author.name ?? ""} />
            )}
            <AvatarFallback>{initials(author?.name)}</AvatarFallback>
          </>
        )}
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold">
            {isAssistant ? "AI Assistant" : (author?.name ?? "Unknown")}
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
    </div>
  );
}
