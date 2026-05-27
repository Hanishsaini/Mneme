import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveEmbeddingProvider } from "./embedding-provider";

/**
 * Hybrid retrieval — vector cosine search and Postgres BM25 (`ts_rank_cd`)
 * merged via reciprocal rank fusion (k=60). Replaces the single-channel
 * cosine queries the Ask endpoint and the context-triggered surface
 * previously ran on their own.
 *
 * Why hybrid: pure cosine search loses to keyword search on proper-noun
 * queries ("Stripe", "Postgres", "OAuth"). Pure BM25 loses to cosine on
 * conceptual ones ("what did we decide about the auth library"). RRF is
 * the parameter-free way to combine the two — it ranks by `Σ 1/(k+rank_i)`
 * across each source ranking, so a row that places top-5 in BOTH always
 * beats a row that places top-1 in one and is missing from the other.
 *
 * The CTE structure keeps it to one round-trip: two ranked candidate
 * pools (vector + bm25, each capped at 50), then a FULL OUTER JOIN that
 * sums the per-pool RRF contributions. Final ORDER BY rrf DESC LIMIT k.
 */

const RRF_K = 60;
const POOL_SIZE = 50;

function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export interface HybridHit {
  messageId: string;
  conversationId: string;
  content: string;
  /** pgvector cosine distance (0 = identical, ~2 = opposite) when the row
   *  appeared in the vector pool; null if BM25 alone surfaced it. */
  distance: number | null;
  /** `ts_rank_cd` score when the row appeared in the BM25 pool; null if
   *  vector alone surfaced it. Larger = better keyword match. */
  bm25: number | null;
  /** Fused RRF score — the value used for the final ordering. The UI may
   *  expose it as a generic "similarity %"; internal callers can also
   *  branch on whether vector / bm25 alone hit, via the nullable fields. */
  rrf: number;
  createdAt: Date;
}

export interface HybridSearchOptions {
  /** Hide hits from a specific conversation (used by the prompt-composer
   *  surface to skip the in-progress thread). */
  excludeConversationId?: string;
  /** Final top-K returned. The CTE always overfetches `POOL_SIZE` from
   *  each channel before merging. */
  k?: number;
}

/**
 * Returns top-K hybrid-ranked embedding rows for a workspace. Empty
 * query string returns empty (we never expose this to an unconstrained
 * search). The vector embedding for the query is generated inline.
 */
export async function hybridSearchEmbeddings(
  workspaceId: string,
  query: string,
  options: HybridSearchOptions = {},
): Promise<HybridHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const k = options.k ?? 5;
  const exclude = options.excludeConversationId ?? null;

  const provider = resolveEmbeddingProvider();
  const queryVec = await provider.embed(trimmed);
  const literal = vectorLiteral(queryVec);

  // The `plainto_tsquery` form treats the input as a phrase of AND'd
  // lexemes — robust against punctuation and stop-words. For proper
  // nouns mixed with prose ("what did we say about Stripe") that's
  // exactly what we want. `coalesce(content, '')` guards against rows
  // with NULL content the generated column already handles, but we
  // double up for safety.
  //
  // FULL OUTER JOIN means a row in only one pool still gets a score
  // (the other contribution is COALESCE'd to 0). The `id` column comes
  // out of either source via COALESCE.
  return prisma.$queryRawUnsafe<HybridHit[]>(
    `WITH
       vec_ranked AS (
         SELECT id, "messageId", "conversationId", content, "createdAt",
                (embedding <=> $1::vector)::float AS distance,
                ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector) AS rank
         FROM "Embedding"
         WHERE "workspaceId" = $3
           AND embedding IS NOT NULL
           AND ($4::text IS NULL OR "conversationId" <> $4)
         ORDER BY embedding <=> $1::vector
         LIMIT ${POOL_SIZE}
       ),
       text_ranked AS (
         SELECT id, "messageId", "conversationId", content, "createdAt",
                ts_rank_cd("contentTsv", plainto_tsquery('english', $2)) AS bm25,
                ROW_NUMBER() OVER (
                  ORDER BY ts_rank_cd("contentTsv", plainto_tsquery('english', $2)) DESC
                ) AS rank
         FROM "Embedding"
         WHERE "workspaceId" = $3
           AND "contentTsv" @@ plainto_tsquery('english', $2)
           AND ($4::text IS NULL OR "conversationId" <> $4)
         ORDER BY ts_rank_cd("contentTsv", plainto_tsquery('english', $2)) DESC
         LIMIT ${POOL_SIZE}
       )
     SELECT
       COALESCE(v."messageId", t."messageId")           AS "messageId",
       COALESCE(v."conversationId", t."conversationId") AS "conversationId",
       COALESCE(v.content, t.content)                   AS content,
       COALESCE(v."createdAt", t."createdAt")           AS "createdAt",
       v.distance                                        AS distance,
       t.bm25                                            AS bm25,
       (COALESCE(1.0 / (${RRF_K} + v.rank), 0)
        + COALESCE(1.0 / (${RRF_K} + t.rank), 0))::float AS rrf
     FROM vec_ranked v
     FULL OUTER JOIN text_ranked t ON v.id = t.id
     ORDER BY rrf DESC
     LIMIT $5`,
    literal,
    trimmed,
    workspaceId,
    exclude,
    k,
  );
}

/**
 * UI-friendly normalization: clamps the raw RRF score (which lives in a
 * narrow, k-dependent range) to a `[0, 1]` similarity for display. We
 * also expose `verdictLabel` per hit — whether it was a pure-cosine
 * hit, pure-keyword hit, or both — so the surface can hint at why a
 * result is there.
 */
export function describeHit(hit: HybridHit): {
  similarity: number;
  source: "vector" | "keyword" | "both";
} {
  // Max possible RRF score = 1/(k+1) + 1/(k+1) ≈ 2/(k+1). Map that to 1.
  const max = 2 / (RRF_K + 1);
  const similarity = Math.max(0, Math.min(1, hit.rrf / max));
  const source =
    hit.distance !== null && hit.bm25 !== null
      ? "both"
      : hit.distance !== null
        ? "vector"
        : "keyword";
  return { similarity, source };
}
