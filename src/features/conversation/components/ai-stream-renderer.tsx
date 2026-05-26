"use client";

import { BrainCircuit } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { APP_NAME } from "@/config/constants";
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
    <div className="flex gap-3 bg-secondary/20 px-4 py-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/30">
        <BrainCircuit className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold">{APP_NAME}</span>
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="flex gap-0.5">
              <span className="h-1 w-1 animate-pulse-subtle rounded-full bg-violet-400" />
              <span className="h-1 w-1 animate-pulse-subtle rounded-full bg-violet-400 [animation-delay:200ms]" />
              <span className="h-1 w-1 animate-pulse-subtle rounded-full bg-violet-400 [animation-delay:400ms]" />
            </span>
            thinking
          </span>
        </div>
        <Markdown content={activeRun.buffer} />
        <span
          aria-hidden
          className="ml-0.5 inline-block h-3.5 w-[3px] animate-pulse-subtle bg-violet-400 align-middle"
        />
      </div>
    </div>
  );
}
