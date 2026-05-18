"use client";

import { MessageList } from "./message-list";
import { PromptComposer } from "./prompt-composer";
import { StopButton } from "./stop-button";
import { TypingIndicator } from "@/features/presence/components/typing-indicator";

/** The full chat column: transcript + typing indicator + composer. */
export function ConversationPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <MessageList />
      </div>
      <TypingIndicator />
      <StopButton />
      <PromptComposer />
    </div>
  );
}
