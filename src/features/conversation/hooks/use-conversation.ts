"use client";

import { useCallback } from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import type { MessageDTO } from "@workspace/shared";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { consumeSSE } from "@/lib/realtime/sse-client";

/**
 * Conversation surface: the ordered message list + the `sendPrompt` intent.
 *
 * The user message is NOT added optimistically — we wait for the
 * `user_message` SSE frame from the server so we get the authoritative
 * `serverSeq` and id. Visually that adds a few hundred ms of latency
 * before the user sees their own message; that latency disappears as soon
 * as the first AI delta lands because the assistant message renders
 * immediately.
 */
export function useConversation() {
  const messages = useWorkspaceStore((s) => s.messages);
  const conversation = useWorkspaceStore((s) => s.conversation);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const activeRun = useWorkspaceStore((s) => s.activeRun);

  const sendPrompt = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !conversation || !workspace) return null;
      const clientMsgId = nanoid();
      void streamPromptToStore({
        clientMsgId,
        conversationId: conversation.id,
        workspaceId: workspace.id,
        text: trimmed,
      });
      return clientMsgId;
    },
    [conversation, workspace],
  );

  // Typing indicator is multi-user; no transport without the socket.
  // Accept-and-ignore so existing composer code (`setTyping(true)` /
  // `setTyping(false)`) keeps type-checking without branching.
  const setTyping = useCallback((_isTyping?: boolean) => {}, []);

  return {
    conversation,
    messages,
    isAiResponding: activeRun !== null,
    sendPrompt,
    setTyping,
  };
}

interface StreamArgs {
  clientMsgId: string;
  conversationId: string;
  workspaceId: string;
  text: string;
}

/**
 * Opens the SSE stream and dispatches each event onto the zustand store.
 * The store mutation surface (`upsertMessage`, `startRun`, `appendDelta`,
 * `completeRun`, `failRun`) is exactly what the old socket listeners
 * called — so downstream UI code keeps working without changes.
 */
async function streamPromptToStore(args: StreamArgs): Promise<void> {
  const store = useWorkspaceStore.getState;

  try {
    const res = await fetch("/api/ai/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok || !res.body) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(data?.error ?? `Stream failed (${res.status})`);
    }

    await consumeSSE(res.body, (frame) => {
      // Type narrowing per event — payloads from the server are trusted
      // (same-origin, validated route handler), so a runtime check would
      // be ceremony.
      const data = frame.data as Record<string, unknown>;
      switch (frame.event) {
        case "user_message": {
          store().upsertMessage(data.message as MessageDTO);
          break;
        }
        case "ai_started": {
          store().startRun(data.runId as string, data.messageId as string);
          break;
        }
        case "ai_delta": {
          store().appendDelta(data.runId as string, data.token as string);
          break;
        }
        case "ai_completed": {
          store().completeRun(data.runId as string, data.message as MessageDTO);
          break;
        }
        case "conversation_titled": {
          store().renameConversation(
            data.conversationId as string,
            data.title as string,
          );
          break;
        }
        case "ai_error": {
          const runId = (data.runId as string | null) ?? "";
          if (runId) store().failRun(runId);
          toast.error(
            (data.error as string) ?? "The AI response failed.",
          );
          break;
        }
      }
    });

    // Stream ended without an explicit completion (e.g. server crashed
    // mid-frame). Clear the active-run flag so the UI doesn't stay
    // disabled — the message itself was checkpointed server-side.
    const active = store().activeRun;
    if (active) store().failRun(active.runId);
  } catch (err) {
    console.error("[chat] stream failed:", err);
    toast.error(
      err instanceof Error ? err.message : "Could not send message",
    );
    const active = store().activeRun;
    if (active) store().failRun(active.runId);
  }
}
