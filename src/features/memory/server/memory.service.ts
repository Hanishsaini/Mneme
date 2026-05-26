import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveEmbeddingProvider } from "./embedding-provider";

/**
 * Team Memory — store + search vector embeddings of messages, scoped to
 * a workspace.
 *
 * Prisma can't write to the `vector` column directly (it's an
 * `Unsupported` type), so we use a two-step pattern:
 *   1. `prisma.embedding.create(...)` writes everything else and grabs the
 *      auto-generated cuid;
 *   2. `$executeRaw` UPDATEs the row with the pgvector literal.
 *
 * Read path uses `$queryRawUnsafe` with the `<=>` (cosine distance)
 * operator against the HNSW index installed in the migration.
 */

const MIN_CONTENT_CHARS = 4;
const MAX_CONTENT_CHARS = 8000;

interface MessageContext {
  id: string;
  conversationId: string;
  workspaceId: string;
  content: string;
}

/** Build a pgvector array literal: `[0.123, 0.456, ...]`. */
function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

/**
 * Embed a single message and store the vector. Idempotent — if an
 * embedding already exists for this message, no-op. Skips empty / tiny /
 * pathologically-large content so we don't waste embedding-API quota.
 */
export async function embedMessage(messageId: string): Promise<void> {
  const existing = await prisma.embedding.findUnique({
    where: { messageId },
    select: { id: true },
  });
  if (existing) return;

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      conversationId: true,
      content: true,
      conversation: { select: { workspaceId: true } },
    },
  });
  if (!message) return;

  const content = message.content.trim();
  if (content.length < MIN_CONTENT_CHARS) return;
  const clipped = content.slice(0, MAX_CONTENT_CHARS);

  const ctx: MessageContext = {
    id: message.id,
    conversationId: message.conversationId,
    workspaceId: message.conversation.workspaceId,
    content: clipped,
  };

  const provider = resolveEmbeddingProvider();
  const values = await provider.embed(ctx.content);

  // Two-step write: Prisma creates the row (gets a cuid for `id`), then
  // raw UPDATE patches the vector. Wrapping in a single transaction
  // would be nicer but `$executeRaw` inside `$transaction` is supported
  // by Prisma and is the cleanest shape.
  await prisma.$transaction(async (tx) => {
    const row = await tx.embedding.create({
      data: {
        messageId: ctx.id,
        conversationId: ctx.conversationId,
        workspaceId: ctx.workspaceId,
        content: ctx.content,
      },
      select: { id: true },
    });
    await tx.$executeRawUnsafe(
      `UPDATE "Embedding" SET embedding = $1::vector WHERE id = $2`,
      vectorLiteral(values),
      row.id,
    );
  });
}

export interface MemorySearchHit {
  messageId: string;
  conversationId: string;
  content: string;
  distance: number;
  createdAt: Date;
}

export interface RelatedMemoryHit {
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  snippet: string;
  /** 0–1, higher = more semantically aligned with the query. */
  similarity: number;
  createdAt: string;
}

/** Cosine distances above this aren't "related enough" to surface in the UI.
 *  Empirically tuned for Gemini text-embedding-004: <0.3 is on-topic, ~0.55
 *  is loosely-related, >0.7 is noise. We err on the side of fewer-better
 *  hits — the proactive surface only earns trust if every suggestion lands. */
const RELATED_DISTANCE_THRESHOLD = 0.55;
const RELATED_SNIPPET_CHARS = 220;

/**
 * Cosine-similarity search across one workspace's embeddings. Returns the
 * top-K closest messages to `query` plus their distances (0 = identical,
 * 1 = orthogonal, 2 = opposite). Distance is computed via the `<=>`
 * pgvector operator, which uses the HNSW index when present.
 */
export async function searchMemory(
  workspaceId: string,
  query: string,
  k = 5,
): Promise<MemorySearchHit[]> {
  if (!query.trim()) return [];

  const provider = resolveEmbeddingProvider();
  const queryVec = await provider.embed(query);
  const literal = vectorLiteral(queryVec);

  return prisma.$queryRawUnsafe<MemorySearchHit[]>(
    `SELECT
       "messageId",
       "conversationId",
       content,
       (embedding <=> $1::vector)::float AS distance,
       "createdAt"
     FROM "Embedding"
     WHERE "workspaceId" = $2
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    literal,
    workspaceId,
    k,
  );
}

interface RelatedSearchOptions {
  excludeConversationId?: string;
  k?: number;
}

interface RawRelatedRow {
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  content: string;
  distance: number;
  createdAt: Date;
}

/**
 * Context-triggered surfacing — given a query (typically the user's
 * in-progress prompt), return the top-K *related* messages from OTHER
 * conversations in the same workspace. Filters by a similarity threshold
 * so off-topic noise doesn't pollute the sidebar; without that, every
 * keystroke would yield three vaguely-shaped suggestions and the user
 * would learn to ignore them.
 *
 * Returns conversation titles inline (joined in SQL) so the UI doesn't
 * need a second round-trip per hit.
 */
export async function searchRelatedToCompose(
  workspaceId: string,
  query: string,
  options: RelatedSearchOptions = {},
): Promise<RelatedMemoryHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const k = options.k ?? 3;
  const provider = resolveEmbeddingProvider();
  const queryVec = await provider.embed(trimmed);
  const literal = vectorLiteral(queryVec);

  // Fetch a few extra and filter by threshold client-side — keeps the SQL
  // simple and lets us return only the genuinely-related hits.
  const overfetch = Math.max(k * 2, 6);

  const rows = options.excludeConversationId
    ? await prisma.$queryRawUnsafe<RawRelatedRow[]>(
        `SELECT
           e."messageId",
           e."conversationId",
           c."title" AS "conversationTitle",
           e.content,
           (e.embedding <=> $1::vector)::float AS distance,
           e."createdAt"
         FROM "Embedding" e
         JOIN "Conversation" c ON c.id = e."conversationId"
         WHERE e."workspaceId" = $2
           AND e.embedding IS NOT NULL
           AND e."conversationId" <> $3
         ORDER BY e.embedding <=> $1::vector
         LIMIT $4`,
        literal,
        workspaceId,
        options.excludeConversationId,
        overfetch,
      )
    : await prisma.$queryRawUnsafe<RawRelatedRow[]>(
        `SELECT
           e."messageId",
           e."conversationId",
           c."title" AS "conversationTitle",
           e.content,
           (e.embedding <=> $1::vector)::float AS distance,
           e."createdAt"
         FROM "Embedding" e
         JOIN "Conversation" c ON c.id = e."conversationId"
         WHERE e."workspaceId" = $2
           AND e.embedding IS NOT NULL
         ORDER BY e.embedding <=> $1::vector
         LIMIT $3`,
        literal,
        workspaceId,
        overfetch,
      );

  return rows
    .filter((r) => r.distance < RELATED_DISTANCE_THRESHOLD)
    .slice(0, k)
    .map((r) => ({
      messageId: r.messageId,
      conversationId: r.conversationId,
      conversationTitle: r.conversationTitle,
      snippet: r.content.length > RELATED_SNIPPET_CHARS
        ? `${r.content.slice(0, RELATED_SNIPPET_CHARS - 1)}…`
        : r.content,
      similarity: Math.max(0, Math.min(1, 1 - r.distance)),
      createdAt: r.createdAt.toISOString(),
    }));
}
