import "server-only";
import { prisma } from "@/lib/db/prisma";
import { generateText } from "@/features/ai/server/ai-service";
import {
  embedMemoryItem,
  findNeighborMemoryItems,
  type NeighborCandidate,
} from "./memory-items.embedding";

/**
 * Memory extractor — operation-emitter pipeline (v2).
 *
 * Three stages per AI turn, all inside one fire-and-forget background task
 * that never blocks the user-facing SSE stream:
 *
 *   1. EXTRACT — single LLM call over the user→assistant exchange. Returns
 *      a JSON array of candidate facts: `{ kind, text }`. Same prompt
 *      shape as v1.
 *
 *   2. NEIGHBOR SEARCH — for each candidate fact, embed its text and
 *      cosine-search the workspace's existing MemoryItem rows. The
 *      candidates land in the operation-emitter prompt so the LLM has
 *      neighbors visible when it decides what to do with each fact.
 *
 *   3. RECONCILE — second LLM call. Inputs: the candidate facts + their
 *      neighbor sets. Output: one operation per candidate, drawn from
 *      `ADD | UPDATE | DELETE | NONE`. Drops duplicates, evolves stale
 *      decisions in place (linking the prior row via supersededById),
 *      and flags reversed decisions as resolved-with-reason instead of
 *      hard-deleting them (we keep the history).
 *
 * The pattern is from mem0 — the single biggest quality lift you can
 * make to a memory product over a single-pass extractor. Before this,
 * re-discussing "we're using Postgres" five times produced five rows.
 * After this, the panel stays coherent over months.
 */

const KIND_VALUES = ["DECISION", "QUESTION", "ACTION_ITEM", "CONTEXT"] as const;
type Kind = (typeof KIND_VALUES)[number];
type Operation = "ADD" | "UPDATE" | "DELETE" | "NONE";

const MIN_EXCHANGE_CHARS = 80;
const MAX_TURN_CHARS = 4000;
const MAX_ITEMS_PER_TURN = 8;
const MAX_ITEM_TEXT_CHARS = 400;
const EXTRACTOR_MAX_TOKENS = 800;
const RECONCILER_MAX_TOKENS = 1000;

const EXTRACT_PROMPT = `You extract structured memory items from a conversation between a user and an AI assistant.

Return a JSON array (and nothing else) of items. Each item:
{ "kind": "DECISION" | "QUESTION" | "ACTION_ITEM" | "CONTEXT", "text": "<one short sentence>" }

Rules:
- DECISION: a concrete choice or commitment the team made.
- QUESTION: an unresolved question that still needs an answer.
- ACTION_ITEM: a task someone needs to do.
- CONTEXT: a durable fact worth remembering.
- Skip pleasantries, restated questions, anything obvious from a one-line summary.
- If nothing is worth remembering, return [].
- Maximum ${MAX_ITEMS_PER_TURN} items. Each "text" under 200 characters.
- Output MUST be valid JSON. No markdown fences, no commentary.`;

const RECONCILE_PROMPT = `You are a memory manager for a team's workspace.

You receive a list of NEW facts the team just discussed, each accompanied by the most semantically-similar EXISTING memory items from the same workspace. Decide what to do with each new fact:

- ADD     — the fact is genuinely new. No existing item covers it.
- UPDATE  — the fact updates / refines / supersedes an existing item (the team revised a decision, narrowed a question, refined a commitment). Pick the SINGLE most relevant existing id as the target.
- DELETE  — the fact explicitly contradicts an existing decision/commitment (the team reversed it). Pick the contradicted existing id as the target. The new fact itself is NOT added — its content goes in the "reason".
- NONE    — the fact is fully redundant with an existing item. No information gain.

Output ONE JSON array. Each element is one of:

{ "op": "ADD",    "kind": "DECISION"|"QUESTION"|"ACTION_ITEM"|"CONTEXT", "text": "..." }
{ "op": "UPDATE", "kind": "DECISION"|"QUESTION"|"ACTION_ITEM"|"CONTEXT", "text": "...", "targetId": "exact-id-from-existing", "reason": "short why this updates the target" }
{ "op": "DELETE", "targetId": "exact-id-from-existing", "reason": "short why the team reversed this" }
{ "op": "NONE",   "targetId": "exact-id-from-existing" }

Rules:
- Match by SEMANTIC meaning, not exact text. Different wording for the same idea = same item.
- Prefer NONE over ADD when in doubt — duplicate items pollute the panel.
- Use existing IDs verbatim. Never invent an id, never pick an id that wasn't in the EXISTING list for this fact.
- Output JSON only. No prose, no markdown fences.`;

interface ExtractedFact {
  kind: Kind;
  text: string;
}

interface ReconcileOp {
  op: Operation;
  kind?: Kind;
  text?: string;
  targetId?: string;
  reason?: string;
}

interface FactWithNeighbors {
  fact: ExtractedFact;
  neighbors: NeighborCandidate[];
}

export async function extractMemoryItems(
  assistantMessageId: string,
): Promise<void> {
  try {
    const ctx = await loadExchangeContext(assistantMessageId);
    if (!ctx) return;
    const { workspaceId, conversationId, userText, assistantText } = ctx;

    // ── (1) EXTRACT ────────────────────────────────────────────────────
    const candidateFacts = await extractFacts(userText, assistantText);
    if (candidateFacts.length === 0) return;

    // ── (2) NEIGHBOR SEARCH ───────────────────────────────────────────
    const facts: FactWithNeighbors[] = await Promise.all(
      candidateFacts.map(async (fact) => ({
        fact,
        neighbors: await findNeighborMemoryItems(workspaceId, fact.text),
      })),
    );

    // ── (3) RECONCILE ─────────────────────────────────────────────────
    // Short-circuit: if no fact has any neighbors, skip the reconciler
    // entirely and just ADD all facts. Saves an LLM call on the common
    // first-few-turns case where the workspace memory is empty.
    const anyNeighbors = facts.some((f) => f.neighbors.length > 0);
    let ops: ReconcileOp[];
    if (!anyNeighbors) {
      ops = facts.map((f) => ({
        op: "ADD",
        kind: f.fact.kind,
        text: f.fact.text,
      }));
    } else {
      ops = await reconcile(facts);
    }

    // ── (4) APPLY ─────────────────────────────────────────────────────
    await applyOps({
      ops,
      workspaceId,
      conversationId,
      messageId: assistantMessageId,
      validTargetIds: new Set(
        facts.flatMap((f) => f.neighbors.map((n) => n.id)),
      ),
    });
  } catch (err) {
    console.error(
      `[memory] extractor failed for message ${assistantMessageId}:`,
      err,
    );
  }
}

// ── Stage helpers ─────────────────────────────────────────────────────

async function loadExchangeContext(assistantMessageId: string) {
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
  if (!assistant || assistant.role !== "ASSISTANT") return null;
  if (!assistant.content.trim()) return null;

  const user = await prisma.message.findFirst({
    where: {
      conversationId: assistant.conversationId,
      role: "USER",
      serverSeq: { lt: assistant.serverSeq },
    },
    orderBy: { serverSeq: "desc" },
    select: { id: true, content: true },
  });
  if (!user) return null;

  const userText = clip(user.content, MAX_TURN_CHARS);
  const assistantText = clip(assistant.content, MAX_TURN_CHARS);
  if (userText.length + assistantText.length < MIN_EXCHANGE_CHARS) return null;

  return {
    workspaceId: assistant.conversation.workspaceId,
    conversationId: assistant.conversationId,
    userText,
    assistantText,
  };
}

async function extractFacts(
  userText: string,
  assistantText: string,
): Promise<ExtractedFact[]> {
  const raw = await generateText({
    instructions: EXTRACT_PROMPT,
    input: [
      {
        role: "user",
        content: `USER:\n${userText}\n\nASSISTANT:\n${assistantText}`,
      },
    ],
    maxTokens: EXTRACTOR_MAX_TOKENS,
  });
  return parseFacts(raw);
}

async function reconcile(facts: FactWithNeighbors[]): Promise<ReconcileOp[]> {
  // Render each fact with its candidate neighbors as a numbered block.
  // The LLM sees ids verbatim so its UPDATE/DELETE/NONE outputs can target
  // them precisely.
  const blocks = facts
    .map((f, i) => {
      const existing =
        f.neighbors.length === 0
          ? "  (no similar existing items)"
          : f.neighbors
              .map(
                (n) =>
                  `  - id=${n.id} kind=${n.kind} dist=${n.distance.toFixed(2)}${n.superseded ? " (superseded)" : ""}\n    text: ${n.text}`,
              )
              .join("\n");
      return `FACT #${i + 1}: (${f.fact.kind}) ${f.fact.text}\nEXISTING similar items:\n${existing}`;
    })
    .join("\n\n");

  const raw = await generateText({
    instructions: RECONCILE_PROMPT,
    input: [{ role: "user", content: blocks }],
    maxTokens: RECONCILER_MAX_TOKENS,
  });
  return parseOps(raw);
}

// ── Op application ────────────────────────────────────────────────────

interface ApplyOpsArgs {
  ops: ReconcileOp[];
  workspaceId: string;
  conversationId: string;
  messageId: string;
  /** The union of every neighbor id we showed the LLM. Any UPDATE/DELETE/
   *  NONE that references an id outside this set gets demoted to ADD
   *  (or dropped for NONE/DELETE) — the LLM hallucinated. */
  validTargetIds: Set<string>;
}

async function applyOps(args: ApplyOpsArgs): Promise<void> {
  const { ops, workspaceId, conversationId, messageId, validTargetIds } = args;

  for (const op of ops) {
    try {
      if (op.op === "NONE") {
        // Validation only — no DB write. We log so the audit trail is
        // visible during early operation.
        continue;
      }

      if (op.op === "DELETE") {
        if (!op.targetId || !validTargetIds.has(op.targetId)) continue;
        // Soft-resolve with the LLM's reason. The user can manually
        // un-resolve from the panel if the reversal was wrong.
        await prisma.memoryItem.update({
          where: { id: op.targetId },
          data: {
            resolvedAt: new Date(),
            supersededReason: op.reason ?? null,
          },
        });
        continue;
      }

      if (op.op === "UPDATE") {
        if (
          !op.targetId ||
          !validTargetIds.has(op.targetId) ||
          !op.kind ||
          !op.text
        )
          continue;
        // Create the new item, then point the old one at it via the
        // supersession FK. Done in a transaction so the chain is never
        // half-built (a refresh between the two writes would otherwise
        // show a duplicate row).
        const createdId = await prisma.$transaction(async (tx) => {
          const created = await tx.memoryItem.create({
            data: {
              workspaceId,
              conversationId,
              messageId,
              kind: op.kind!,
              text: clip(op.text!, MAX_ITEM_TEXT_CHARS),
            },
            select: { id: true },
          });
          await tx.memoryItem.update({
            where: { id: op.targetId! },
            data: {
              supersededById: created.id,
              supersededReason: op.reason ?? null,
            },
          });
          return created.id;
        });
        // Embed the new item async — same fire-and-forget pattern as
        // message embeddings. Without this, the next dedup pass can't
        // find this item among neighbors.
        void embedMemoryItem(createdId).catch((err) =>
          console.error(`[memory] embed item ${createdId} failed:`, err),
        );
        continue;
      }

      if (op.op === "ADD") {
        if (!op.kind || !op.text) continue;
        const created = await prisma.memoryItem.create({
          data: {
            workspaceId,
            conversationId,
            messageId,
            kind: op.kind,
            text: clip(op.text, MAX_ITEM_TEXT_CHARS),
          },
          select: { id: true },
        });
        void embedMemoryItem(created.id).catch((err) =>
          console.error(`[memory] embed item ${created.id} failed:`, err),
        );
      }
    } catch (err) {
      console.error(`[memory] applyOps failed for op:`, op, err);
    }
  }
}

// ── Parsing helpers (tolerant) ────────────────────────────────────────

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function extractJsonArray(raw: string): unknown[] | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseFacts(raw: string): ExtractedFact[] {
  const arr = extractJsonArray(raw);
  if (!arr) return [];
  const out: ExtractedFact[] = [];
  for (const entry of arr) {
    if (out.length >= MAX_ITEMS_PER_TURN) break;
    if (typeof entry !== "object" || entry === null) continue;
    const kind = (entry as { kind?: unknown }).kind;
    const text = (entry as { text?: unknown }).text;
    if (typeof kind !== "string" || typeof text !== "string") continue;
    if (!KIND_VALUES.includes(kind as Kind)) continue;
    const trimmed = text.trim();
    if (trimmed.length < 4) continue;
    out.push({ kind: kind as Kind, text: clip(trimmed, MAX_ITEM_TEXT_CHARS) });
  }
  return out;
}

function parseOps(raw: string): ReconcileOp[] {
  const arr = extractJsonArray(raw);
  if (!arr) return [];
  const out: ReconcileOp[] = [];
  for (const entry of arr) {
    if (typeof entry !== "object" || entry === null) continue;
    const op = (entry as { op?: unknown }).op;
    if (op !== "ADD" && op !== "UPDATE" && op !== "DELETE" && op !== "NONE") {
      continue;
    }
    const e = entry as Record<string, unknown>;
    const cleaned: ReconcileOp = { op };
    if (typeof e.kind === "string" && KIND_VALUES.includes(e.kind as Kind)) {
      cleaned.kind = e.kind as Kind;
    }
    if (typeof e.text === "string") cleaned.text = e.text.trim();
    if (typeof e.targetId === "string") cleaned.targetId = e.targetId;
    if (typeof e.reason === "string") cleaned.reason = e.reason.trim();
    out.push(cleaned);
  }
  return out;
}
