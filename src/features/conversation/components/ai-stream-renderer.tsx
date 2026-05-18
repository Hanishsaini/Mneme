"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Markdown } from "@/components/ui/markdown";
import { useAiStream } from "../hooks/use-ai-stream";

/**
 * Renders the in-flight assistant message. Subscribes ONLY to `activeRun`
 * via `useAiStream`, so the per-token `appendDelta` updates re-render this
 * bubble alone — never the settled message list.
 */
export function AiStreamRenderer() {
  const activeRun = useAiStream();
  if (!activeRun) return null;

  return (
    <div className="flex gap-3 bg-secondary/30 px-4 py-3">
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback className="bg-primary text-primary-foreground">
          AI
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold">AI Assistant</span>
          <span className="text-[10px] text-muted-foreground">streaming…</span>
        </div>
        <Markdown content={activeRun.buffer} />
        <span
          aria-hidden
          className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse-subtle bg-foreground align-middle"
        />
      </div>
    </div>
  );
}
