import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveEmbeddingProvider } from "./embedding-provider";

/**
 * MemoryItem embedding helpers — separate from the message embedding
 * service because the semantics differ: message embeddings are over raw
 * conversational text and feed retrieval / Q&A; MemoryItem embeddings are
 * over the short structured fact ("Use Postgres for the auth DB") and
 * feed the operation-emitter dedup pipeline.
 *
 * Same Gemini model + 768-dim shape as the message embeddings, so a
 * single pgvector column type works for both tables.
 */

function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

/**
 * Generate + persist the embedding for a memory item that was created
 * without one. Used both by the create path (write the fresh item, then
 * embed) and by a one-off backfill pass for rows that pre-date this
 * column.
 */
export async function embedMemoryItem(itemId: string): Promise<void> {
  const item = await prisma.memoryItem.findUnique({
    where: { id: itemId },
    select: { id: true, text: true },
  });
  if (!item) return;
  if (!item.text.trim()) return;

  const provider = resolveEmbeddingProvider();
  const values = await provider.embed(item.text);

  await prisma.$executeRawUnsafe(
    `UPDATE "MemoryItem" SET embedding = $1::vector WHERE id = $2`,
    vectorLiteral(values),
    item.id,
  );
}

export interface NeighborCandidate {
  id: string;
  kind: string;
  text: string;
  /** Cosine distance — lower = closer. We pass this to the LLM so it has
   *  numerical context when deciding ADD vs UPDATE vs NONE. */
  distance: number;
  /** True when this item has been superseded by something newer; we
   *  still consider it for matching but the LLM should prefer to UPDATE
   *  the chain head rather than re-supersede a dead item. */
  superseded: boolean;
}

const NEIGHBOR_DISTANCE_CEILING = 0.45;
const NEIGHBOR_TOP_K = 6;

/**
 * Cosine-search the workspace's live memory items for near-duplicates of
 * a candidate fact. Returns up to `NEIGHBOR_TOP_K` rows under the
 * distance ceiling — anything past the ceiling is treated as semantically
 * unrelated and skipped.
 *
 * We deliberately INCLUDE superseded items so the LLM can spot a
 * regression ("the team is re-proposing a decision we already reversed").
 */
export async function findNeighborMemoryItems(
  workspaceId: string,
  candidateText: string,
): Promise<NeighborCandidate[]> {
  const trimmed = candidateText.trim();
  if (!trimmed) return [];

  const provider = resolveEmbeddingProvider();
  const vec = await provider.embed(trimmed);
  const literal = vectorLiteral(vec);

  interface Row {
    id: string;
    kind: string;
    text: string;
    distance: number;
    supersededById: string | null;
  }

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT
       id,
       kind::text AS kind,
       text,
       (embedding <=> $1::vector)::float AS distance,
       "supersededById"
     FROM "MemoryItem"
     WHERE "workspaceId" = $2
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    literal,
    workspaceId,
    NEIGHBOR_TOP_K * 2,
  );

  return rows
    .filter((r) => r.distance < NEIGHBOR_DISTANCE_CEILING)
    .slice(0, NEIGHBOR_TOP_K)
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      text: r.text,
      distance: r.distance,
      superseded: r.supersededById !== null,
    }));
}
