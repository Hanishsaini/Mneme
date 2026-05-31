import "server-only";
import { prisma } from "@/lib/db/prisma";
import { embedDecisionContent } from "./decision-embedding";

/**
 * Hybrid retrieval over AgentDecisionEvent — same RRF (k=60) shape as
 * the memory hybrid-search, repointed at the agent decision corpus.
 * Used by the supersession detector to find candidate prior decisions
 * that the new event might revise or contradict.
 *
 * Filters:
 *  - Same workspace as the new decision.
 *  - Excludes the run being ingested (a decision can't supersede
 *    another inside the same run — runs are linear by construction).
 *  - Excludes already-superseded rows (they're no longer "live").
 */

const RRF_K = 60;
const POOL_SIZE = 30;

function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export interface DecisionCandidate {
  id: string;
  runId: string;
  decisionType: string;
  decisionContent: string;
  distance: number | null;
  bm25: number | null;
  rrf: number;
  decidedAt: Date;
}

export async function findSupersessionCandidates(
  workspaceId: string,
  query: string,
  excludeRunId: string,
  k = 5,
): Promise<DecisionCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const vec = await embedDecisionContent(trimmed);
  if (!vec) return [];
  const literal = vectorLiteral(vec);

  return prisma.$queryRawUnsafe<DecisionCandidate[]>(
    `WITH
       vec_ranked AS (
         SELECT id, "runId", "decisionType", "decisionContent", "decidedAt",
                (embedding <=> $1::vector)::float AS distance,
                ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector) AS rank
         FROM "AgentDecisionEvent"
         WHERE "workspaceId" = $3
           AND embedding IS NOT NULL
           AND "supersededById" IS NULL
           AND "runId" <> $4
         ORDER BY embedding <=> $1::vector
         LIMIT ${POOL_SIZE}
       ),
       text_ranked AS (
         SELECT id, "runId", "decisionType", "decisionContent", "decidedAt",
                ts_rank_cd("contentTsv", plainto_tsquery('english', $2)) AS bm25,
                ROW_NUMBER() OVER (
                  ORDER BY ts_rank_cd("contentTsv", plainto_tsquery('english', $2)) DESC
                ) AS rank
         FROM "AgentDecisionEvent"
         WHERE "workspaceId" = $3
           AND "contentTsv" @@ plainto_tsquery('english', $2)
           AND "supersededById" IS NULL
           AND "runId" <> $4
         ORDER BY ts_rank_cd("contentTsv", plainto_tsquery('english', $2)) DESC
         LIMIT ${POOL_SIZE}
       )
     SELECT
       COALESCE(v.id, t.id)                                AS id,
       COALESCE(v."runId", t."runId")                      AS "runId",
       COALESCE(v."decisionType", t."decisionType")        AS "decisionType",
       COALESCE(v."decisionContent", t."decisionContent")  AS "decisionContent",
       COALESCE(v."decidedAt", t."decidedAt")              AS "decidedAt",
       v.distance                                          AS distance,
       t.bm25                                              AS bm25,
       (COALESCE(1.0 / (${RRF_K} + v.rank), 0)
        + COALESCE(1.0 / (${RRF_K} + t.rank), 0))::float   AS rrf
     FROM vec_ranked v
     FULL OUTER JOIN text_ranked t ON v.id = t.id
     ORDER BY rrf DESC
     LIMIT $5`,
    literal,
    trimmed,
    workspaceId,
    excludeRunId,
    k,
  );
}
