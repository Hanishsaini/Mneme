"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RelatedMemoryStrip } from "@/features/memory/components/related-memory-strip";
import { useConversation } from "../hooks/use-conversation";

/**
 * Prompt input. Submitting emits `chat:submit` over the socket; the user
 * message round-trips through the server (no optimistic insert) so both
 * members see it with an authoritative order. Disabled while the AI runs —
 * the MVP allows one run per conversation at a time.
 */
export function PromptComposer() {
  const { sendPrompt, setTyping, isAiResponding } = useConversation();
  const [value, setValue] = useState("");
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    setTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => setTyping(false), 1500);
  }

  function submit() {
    if (!value.trim() || isAiResponding) return;
    sendPrompt(value);
    setValue("");
    setTyping(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t bg-card/40">
      <RelatedMemoryStrip query={value} enabled={!isAiResponding} />
      <div className="flex items-end gap-2 p-3">
        <Textarea
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            isAiResponding
              ? "The AI is responding…"
              : "Message the shared AI… (Enter to send)"
          }
          disabled={isAiResponding}
          rows={1}
          data-prompt-input
          className="max-h-40 min-h-[40px] resize-none"
        />
        <Button
          size="icon"
          onClick={submit}
          disabled={!value.trim() || isAiResponding}
        >
          <Send />
        </Button>
      </div>
    </div>
  );
}
