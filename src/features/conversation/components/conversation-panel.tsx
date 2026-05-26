"use client";

import { MessageList } from "./message-list";
import { PromptComposer } from "./prompt-composer";
import { StopButton } from "./stop-button";

/**
 * The full chat column — transcript + composer. Thread switching used to
 * live here as a dropdown above the messages; it's now in the left
 * sidebar (Claude-style), so this component is just the conversation.
 */
export function ConversationPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <MessageList />
      </div>
      <StopButton />
      <PromptComposer />
    </div>
  );
}
