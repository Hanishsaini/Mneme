import "server-only";
import type { Message } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { listRecentMessages } from "@/features/conversation/server/message.repository";
import {
  AI_CONTEXT_MESSAGE_WINDOW,
  AI_MAX_MESSAGE_CHARS,
  AI_MAX_OUTPUT_TOKENS,
} from "@/config/constants";
import type { AiStreamInput } from "./ai-service";

const SYSTEM_PROMPT = `You are the shared AI assistant inside a team workspace.
Treat the conversation as a single shared thread the whole team can see, not
separate DMs. Be concise, concrete, and helpful.`;

/**
 * Builds the model input for one conversation turn under a tight free-tier
 * budget:
 *
 *  - System prompt + the conversation's rolling summary (older history,
 *    bounded by the summarizer)
 *  - The last `AI_CONTEXT_MESSAGE_WINDOW` completed messages, each
 *    truncated to `AI_MAX_MESSAGE_CHARS` so a single huge paste can't
 *    blow the context window
 *  - `maxTokens` baked in so completions can't burn quota unbounded
 *
 * Nothing older than the verbatim window is sent — `memory.ts` rolls older
 * turns into `Conversation.summary` instead.
 */
export async function buildContext(
  conversationId: string,
): Promise<AiStreamInput> {
  const [conversation, recent] = await Promise.all([
    prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { summary: true },
    }),
    listRecentMessages(conversationId, AI_CONTEXT_MESSAGE_WINDOW),
  ]);

  const summary = conversation?.summary
    ? `\n\nConversation so far (summary of earlier turns):\n${truncate(
        conversation.summary,
        AI_MAX_MESSAGE_CHARS,
      )}`
    : "";

  return {
    instructions: `${SYSTEM_PROMPT}${summary}`,
    input: recent
      .filter((m): m is Message => m.role === "USER" || m.role === "ASSISTANT")
      .map((m) => ({
        role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: truncate(m.content, AI_MAX_MESSAGE_CHARS),
      })),
    maxTokens: AI_MAX_OUTPUT_TOKENS,
  };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
