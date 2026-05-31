import "server-only";
import { createHash } from "crypto";
import type { DecisionIngestionResultDTO } from "@workspace/shared";
import { Errors } from "@/lib/api/errors";
import { toAgentDecisionEventDTO } from "@/lib/db/mappers";
import {
  createDecisionEvent,
  findDecisionById,
  latestDecisionInRun,
} from "./decision-events.repository";
import { findAgentRun } from "./agent-runs.repository";
import { embedDecisionContent } from "./decision-embedding";
import { detectSupersession } from "./supersession-detector.service";
import { checkPolicies } from "./policy-engine.service";

/**
 * The ingestion orchestrator — the single entry point the
 * POST /agent-runs/:runId/decisions route calls.
 *
 * Steps, in order:
 *   1. Resolve the run (404 if missing).
 *   2. Compute the embedding (Gemini 768d).
 *   3. Compute the chained content_hash: sha256(decisionContent +
 *      JSON.stringify(contextUsed) + previousHash). The previousHash
 *      is the latest decision's hash in the run, or NULL.
 *   4. Persist the decision atomically (relational + raw vector).
 *   5. Fire supersession detection (best-effort; failures don't break
 *      ingestion).
 *   6. Fire policy engine (same — best-effort).
 *   7. Return the full result so the SDK exposes supersessions +
 *      violations on the call response (agents can react in-loop).
 *
 * Steps 5 and 6 are intentionally awaited rather than fire-and-forget:
 * the SDK contract requires that the response carries the
 * supersession + violation arrays. Compliance buyers cannot accept "we
 * detected the violation eventually" — they need synchronous
 * detection at decision time. Latency budget per decision is currently
 * 1.5–3s (one LLM call each for supersession + policy).
 */

export interface IngestDecisionInput {
  runId: string;
  decisionType: string;
  decisionContent: string;
  contextUsed: Record<string, unknown>;
  toolCalled?: string | null;
  toolOutput?: Record<string, unknown> | null;
}

export async function ingestDecision(
  input: IngestDecisionInput,
): Promise<DecisionIngestionResultDTO> {
  const run = await findAgentRun(input.runId);
  if (!run) throw Errors.notFound("Agent run");

  const content = input.decisionContent.trim();
  if (!content) throw Errors.badRequest("decisionContent is required");

  // (2) Embedding — null on provider failure; ingestion still proceeds.
  const embedding = await embedDecisionContent(content).catch((err) => {
    console.error(`[agent-audit] embed failed:`, err);
    return null;
  });

  // (3) Chained content hash.
  const prior = await latestDecisionInRun(input.runId);
  const contentHash = chainedHash(
    content,
    input.contextUsed ?? {},
    prior?.contentHash ?? null,
  );

  // (4) Persist atomically.
  const decisionId = await createDecisionEvent(
    {
      runId: input.runId,
      workspaceId: run.workspaceId,
      decisionType: input.decisionType,
      decisionContent: content,
      contextUsed: input.contextUsed ?? {},
      toolCalled: input.toolCalled ?? null,
      toolOutput: input.toolOutput ?? null,
      contentHash,
      previousHash: prior?.contentHash ?? null,
    },
    embedding,
  );

  // (5) Supersession + (6) Policy checks. Run in parallel; both await
  // because the SDK response carries their results.
  const [supersessions, violations] = await Promise.all([
    detectSupersession({
      workspaceId: run.workspaceId,
      runId: input.runId,
      newDecisionId: decisionId,
      newDecisionContent: content,
      newDecisionType: input.decisionType,
    }),
    checkPolicies({
      workspaceId: run.workspaceId,
      decisionId,
      decisionType: input.decisionType,
      decisionContent: content,
      decisionEmbedding: embedding,
    }),
  ]);

  const fresh = await findDecisionById(decisionId);
  // Shouldn't happen — we just wrote inside the same connection — but
  // typecheck wants narrowing and a stale read is a real failure mode.
  if (!fresh) throw Errors.internal();

  return {
    decision: toAgentDecisionEventDTO(fresh),
    supersessions,
    violations,
  };
}

/**
 * sha256(decisionContent || canonical-JSON(contextUsed) || previousHash).
 *
 * The canonical JSON is sorted-key — without it, identical objects with
 * differently-ordered properties would produce different hashes, and
 * audit exports would fail to verify across re-serializations.
 */
function chainedHash(
  decisionContent: string,
  contextUsed: Record<string, unknown>,
  previousHash: string | null,
): string {
  const canonical = canonicalJSON(contextUsed);
  const input = `${decisionContent}\n${canonical}\n${previousHash ?? ""}`;
  return createHash("sha256").update(input).digest("hex");
}

function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJSON).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`)
    .join(",")}}`;
}
