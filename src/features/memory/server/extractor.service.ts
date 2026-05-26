import "server-only";
import { prisma } from "@/lib/db/prisma";
import { generateText } from "@/features/ai/server/ai-service";

/**
 * Memory extractor — second half of Team Memory v1.
 *
 * After an AI run completes, we feed the last user→assistant exchange to a
 * second cheap model call that returns a JSON array of structured nuggets:
 * decisions made, questions still open, action items, ambient context. Those
 * rows land in `MemoryItem` and surface in the Memory panel.
 *
 * Strict invariants:
 *   - Fire-and-forget. Caller MUST NOT await blockingly — a slow/failed
 *     extraction can never delay the user-facing stream.
 *   - Tolerant parser. Models prepend prose, wrap in ```json fences, or emit
 *     stray fields. We extract the first balanced `[...]` and reject items
 *     that don't validate.
 *   - Idempotent-ish. Re-running for the same assistant message just adds
 *     duplicate rows — the caller is responsible for calling once per run.
 *     (The orchestrator's finally block runs once per completed turn, so in
 *     practice this is fine.)
 */

const KIND_VALUES = ["DECISION", "QUESTION", "ACTION_ITEM", "CONTEXT"] as const;
type Kind = (typeof KIND_VALUES)[number];

const MIN_EXCHANGE_CHARS = 80;
const MAX_TURN_CHARS = 4000;
const MAX_ITEMS_PER_TURN = 8;
const MAX_ITEM_TEXT_CHARS = 400;
const EXTRACTOR_MAX_TOKENS = 800;

const SYSTEM_PROMPT = `You extract structured memory items from a conversation between a user and an AI assistant.

Return a JSON array (and nothing else) of items. Each item:
{ "kind": "DECISION" | "QUESTION" | "ACTION_ITEM" | "CONTEXT", "text": "<one short sentence>" }

Rules:
- DECISION: a concrete choice or commitment the user/team made (e.g. "Use Postgres for the auth DB").
- QUESTION: an unresolved question raised that still needs an answer (e.g. "How will we handle rate limits?").
- ACTION_ITEM: a task someone needs to do (e.g. "Write the migration for the embeddings table").
- CONTEXT: a durable fact worth remembering (e.g. "The mobile team cuts release branches on Thursdays").
- Skip pleasantries, restated questions, and anything obvious from a one-line summary.
- If nothing is worth remembering, return [].
- Maximum ${MAX_ITEMS_PER_TURN} items. Keep each "text" under 200 characters.
- Output MUST be valid JSON. No markdown fences, no commentary.`;

interface ExtractedItem {
  kind: Kind;
  text: string;
}

/**
 * Extract memory items from the most recent user→assistant exchange in a
 * conversation and persist them. Safe to call fire-and-forget; never throws.
 */
export async function extractMemoryItems(
  assistantMessageId: string,
): Promise<void> {
  try {
    const assistant = await prisma.message.findUnique({
      where: { id: assistantMessageId },
      select: {
        id: true,
        role: true,
        content: true,
        conversationId: true,
        serverSeq: true,
        conversation: { select: { workspaceId: true } },
      },
    });
    if (!assistant || assistant.role !== "ASSISTANT") return;
    if (!assistant.content.trim()) return;

    // Most recent user message in the same thread, ordered just before this
    // assistant message. There usually is one — if not, skip (system msg or
    // an assistant-first thread).
    const user = await prisma.message.findFirst({
      where: {
        conversationId: assistant.conversationId,
        role: "USER",
        serverSeq: { lt: assistant.serverSeq },
      },
      orderBy: { serverSeq: "desc" },
      select: { id: true, content: true },
    });
    if (!user) return;

    const userText = clip(user.content, MAX_TURN_CHARS);
    const assistantText = clip(assistant.content, MAX_TURN_CHARS);
    if (userText.length + assistantText.length < MIN_EXCHANGE_CHARS) return;

    const raw = await generateText({
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: `USER:\n${userText}\n\nASSISTANT:\n${assistantText}`,
        },
      ],
      maxTokens: EXTRACTOR_MAX_TOKENS,
    });

    const items = parseExtractedItems(raw);
    if (items.length === 0) return;

    await prisma.memoryItem.createMany({
      data: items.map((it) => ({
        workspaceId: assistant.conversation.workspaceId,
        conversationId: assistant.conversationId,
        messageId: assistant.id,
        kind: it.kind,
        text: it.text,
      })),
    });
  } catch (err) {
    console.error(
      `[memory] extractor failed for message ${assistantMessageId}:`,
      err,
    );
  }
}

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * Tolerant JSON extractor. Models tend to wrap arrays in ```json fences or
 * prepend "Here are the items:" — we slice the first `[` to the matching
 * `]` and parse that. Per-item validation drops anything that doesn't match
 * the schema, so a single bad row doesn't poison the batch.
 */
function parseExtractedItems(raw: string): ExtractedItem[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const items: ExtractedItem[] = [];
  for (const entry of parsed) {
    if (items.length >= MAX_ITEMS_PER_TURN) break;
    if (typeof entry !== "object" || entry === null) continue;
    const kind = (entry as { kind?: unknown }).kind;
    const text = (entry as { text?: unknown }).text;
    if (typeof kind !== "string" || typeof text !== "string") continue;
    if (!KIND_VALUES.includes(kind as Kind)) continue;
    const trimmed = text.trim();
    if (trimmed.length < 4) continue;
    items.push({
      kind: kind as Kind,
      text: clip(trimmed, MAX_ITEM_TEXT_CHARS),
    });
  }
  return items;
}
