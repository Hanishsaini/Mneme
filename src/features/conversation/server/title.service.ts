import "server-only";
import { prisma } from "@/lib/db/prisma";
import { generateText } from "@/features/ai/server/ai-service";
import { updateConversation } from "./conversation.repository";

/**
 * Auto-generate a short, descriptive title for a conversation from its
 * first user→assistant exchange. Mirrors what ChatGPT / Claude do — the
 * default "New conversation" looks like a prototype, real titles in the
 * sidebar make the product feel finished.
 *
 * Only runs once per thread: if the title is anything other than the
 * default placeholder we leave it alone (so a manual rename never gets
 * blown away by a late retry).
 *
 * Returns the new title when a generation happened, or null when we
 * decided not to (already named, too few messages, model returned junk).
 * Caller is expected to fire-and-forget — never block the user-facing
 * stream on this.
 */

const PLACEHOLDER_TITLE = "New conversation";
const MAX_TITLE_CHARS = 60;
const TITLE_MAX_TOKENS = 32;

const SYSTEM_PROMPT = `You generate short, descriptive titles for chat conversations.

Rules:
- 3 to 6 words.
- No quotes, no punctuation at the end, no leading "Re:" or "Chat about".
- Sentence case ("Auth migration plan", not "auth migration plan" or "Auth Migration Plan").
- Capture the topic, not the question shape.
- If the exchange is greetings/small-talk, return: New conversation

Output ONLY the title, nothing else.`;

export async function maybeGenerateTitle(
  conversationId: string,
): Promise<string | null> {
  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, title: true },
    });
    if (!conv) return null;
    // Don't overwrite a manual rename or a previously-generated title.
    if (conv.title !== PLACEHOLDER_TITLE) return null;

    // Pull just the first user + first assistant message; that's plenty
    // of signal for a topic title, and avoids feeding the model long
    // multi-turn context for what's essentially a labeling task.
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        OR: [{ role: "USER" }, { role: "ASSISTANT" }],
        status: "COMPLETE",
      },
      orderBy: { serverSeq: "asc" },
      take: 2,
      select: { role: true, content: true },
    });
    if (messages.length < 2) return null;

    const userMsg = messages.find((m) => m.role === "USER");
    const assistantMsg = messages.find((m) => m.role === "ASSISTANT");
    if (!userMsg || !assistantMsg) return null;

    const raw = await generateText({
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: `USER:\n${clip(userMsg.content, 600)}\n\nASSISTANT:\n${clip(
            assistantMsg.content,
            600,
          )}`,
        },
      ],
      maxTokens: TITLE_MAX_TOKENS,
    });

    const cleaned = cleanTitle(raw);
    if (!cleaned || cleaned === PLACEHOLDER_TITLE) return null;

    await updateConversation(conversationId, { title: cleaned });
    return cleaned;
  } catch (err) {
    console.error(
      `[title] auto-title failed for ${conversationId}:`,
      err,
    );
    return null;
  }
}

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * Models occasionally wrap the title in quotes, prefix with "Title:", or
 * dump multiple lines. Take the first non-empty line, strip surrounding
 * quotes and trailing punctuation, cap length.
 */
function cleanTitle(raw: string): string | null {
  const firstLine = raw
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return null;

  let t = firstLine.replace(/^title\s*[:\-]\s*/i, "");
  t = t.replace(/^["'`]+|["'`]+$/g, "");
  t = t.replace(/[.!?,;:]+$/g, "");
  t = t.trim();
  if (t.length === 0) return null;
  if (t.length > MAX_TITLE_CHARS) t = `${t.slice(0, MAX_TITLE_CHARS - 1)}…`;
  return t;
}
