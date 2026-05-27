import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveEmbeddingProvider } from "./embedding-provider";
import { describeHit, hybridSearchEmbeddings } from "./hybrid-search";

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

/** Hits below this similarity (post-hybrid-fusion, scaled to [0,1])
 *  aren't "related enough" to surface in the UI. Hand-tuned: ~0.4 is the
 *  knee where vector-only matches without a BM25 corroboration start
 *  feeling speculative. We err on the side of fewer-better hits — the
 *  proactive surface only earns trust if every suggestion lands. */
const RELATED_SIMILARITY_THRESHOLD = 0.4;
const RELATED_SNIPPET_CHARS = 220;

/**
 * Workspace memory search — now hybrid. Returns the top-K hits as ranked
 * by RRF fusion of pgvector cosine + Postgres BM25. The `distance` field
 * stays in the return shape for backwards compatibility (Ask service
 * downstream uses it), populated from the vector half of the fusion if
 * that channel contributed; null when only BM25 matched.
 */
export async function searchMemory(
  workspaceId: string,
  query: string,
  k = 5,
): Promise<MemorySearchHit[]> {
  if (!query.trim()) return [];

  const hits = await hybridSearchEmbeddings(workspaceId, query, { k });
  return hits.map((h) => ({
    messageId: h.messageId,
    conversationId: h.conversationId,
    content: h.content,
    // Down-stream callers expect a distance; provide one. When only
    // BM25 contributed we synthesize a "moderately close" distance from
    // the similarity so ranking stays meaningful.
    distance:
      h.distance ?? Math.max(0, 1 - describeHit(h).similarity),
    createdAt: h.createdAt,
  }));
}

interface RelatedSearchOptions {
  excludeConversationId?: string;
  k?: number;
}

/**
 * Context-triggered surfacing — given a query (typically the user's
 * in-progress prompt), return the top-K *related* messages from OTHER
 * conversations in the same workspace. Now hybrid: pgvector cosine +
 * Postgres BM25, fused via reciprocal rank fusion. Filters below the
 * similarity threshold so off-topic noise doesn't pollute the strip.
 *
 * Conversation titles get joined separately (post-fusion) since the
 * hybrid CTE returns embedding-row columns only.
 */
export async function searchRelatedToCompose(
  workspaceId: string,
  query: string,
  options: RelatedSearchOptions = {},
): Promise<RelatedMemoryHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const k = options.k ?? 3;
  // Overfetch from the fusion so the post-threshold filter has headroom
  // to drop weak hits without leaving the user with fewer than k results
  // when there ARE strong ones lower in the pool.
  const hits = await hybridSearchEmbeddings(workspaceId, trimmed, {
    k: Math.max(k * 2, 6),
    excludeConversationId: options.excludeConversationId,
  });
  if (hits.length === 0) return [];

  const ranked = hits
    .map((h) => ({ hit: h, ...describeHit(h) }))
    .filter((r) => r.similarity >= RELATED_SIMILARITY_THRESHOLD)
    .slice(0, k);
  if (ranked.length === 0) return [];

  // Conversation titles — one IN-clause lookup, joined client-side. Cheap
  // and keeps the fusion CTE generic across callers that don't need them.
  const convIds = Array.from(new Set(ranked.map((r) => r.hit.conversationId)));
  const titles = new Map(
    (
      await prisma.conversation.findMany({
        where: { id: { in: convIds } },
        select: { id: true, title: true },
      })
    ).map((c) => [c.id, c.title]),
  );

  return ranked.map(({ hit, similarity }) => ({
    messageId: hit.messageId,
    conversationId: hit.conversationId,
    conversationTitle: titles.get(hit.conversationId) ?? "Untitled",
    snippet:
      hit.content.length > RELATED_SNIPPET_CHARS
        ? `${hit.content.slice(0, RELATED_SNIPPET_CHARS - 1)}…`
        : hit.content,
    similarity,
    createdAt: hit.createdAt.toISOString(),
  }));
}
