"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BrainCircuit } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversation } from "../hooks/use-conversation";
import { useAiStream } from "../hooks/use-ai-stream";
import { MessageBubble } from "./message-bubble";
import { AiStreamRenderer } from "./ai-stream-renderer";

/** Scrollable transcript: settled messages + the live streaming bubble. */
export function MessageList() {
  const { messages } = useConversation();
  const activeRun = useAiStream();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep pinned to the newest content as messages + tokens arrive.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeRun?.buffer]);

  const showEmpty = messages.length === 0 && !activeRun;

  return (
    <ScrollArea className="h-full scrollbar-thin">
      <div className="divide-y divide-border/40">
        {showEmpty && <EmptyState />}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              layout="position"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <MessageBubble message={m} />
            </motion.div>
          ))}
        </AnimatePresence>
        <AiStreamRenderer />
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

/**
 * First-paint surface in a fresh chat. Three suggested starter prompts
 * the user can click to populate the composer — same idea as Claude's
 * "Suggest a topic" chips, scoped to the kind of work this product is
 * actually for (decisions, async handoffs, design questions).
 */
function EmptyState() {
  const suggestions = [
    "Walk me through the trade-offs between Postgres and DynamoDB for our auth service.",
    "Draft a rollout plan for switching our auth provider — assume we have 50k users.",
    "Help me decide between argon2 and bcrypt for password hashing in a Node app.",
  ];

  return (
    <div className="flex flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/30">
        <BrainCircuit className="h-7 w-7" />
      </div>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          What's on your team's mind?
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
          Ask anything. Decisions, questions, and action items get pulled out
          automatically and surface in the Memory panel as you talk.
        </p>
      </div>
      <div className="grid w-full max-w-lg gap-2 sm:grid-cols-1">
        {suggestions.map((s) => (
          <SuggestionButton key={s} text={s} />
        ))}
      </div>
    </div>
  );
}

function SuggestionButton({ text }: { text: string }) {
  function fill() {
    // Drop the suggestion into the composer textarea. The composer is a
    // controlled input keyed by React state, so we dispatch a native
    // input event the React onChange will pick up via the synthetic
    // bridge — cheaper than hoisting state up just for this.
    const el = document.querySelector<HTMLTextAreaElement>("[data-prompt-input]");
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  }

  return (
    <button
      type="button"
      onClick={fill}
      className="rounded-lg border border-border/60 bg-card/30 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-violet-500/40 hover:bg-card/60 hover:text-foreground"
    >
      {text}
    </button>
  );
}
