import "server-only";
import { generateText } from "@/features/ai/server/ai-service";
import {
  findSupersessionCandidates,
  type DecisionCandidate,
} from "./decision-hybrid-search";
import { setSupersession } from "./decision-events.repository";

/**
 * Detect whether a new agent decision supersedes (revises / contradicts)
 * any prior decision in the same workspace, and if so, link it.
 *
 * Pipeline:
 *   1. Hybrid retrieval — top-5 candidates by RRF.
 *   2. Operation-emitter LLM call — single response decides which (if any)
 *      candidate the new decision replaces. Same JSON contract as the
 *      MemoryItem extractor pipeline.
 *   3. Validate the LLM's targetId against the candidate set (drop
 *      hallucinated ids).
 *   4. Write the supersession FK (called repository helper handles the
 *      DB update).
 *
 * Returns the supersessions that fired so the SDK can surface them on
 * the ingestion response (the agent can react in-loop).
 */

const DETECTOR_PROMPT = `You are a decision-audit reviewer. A new agent decision has just been logged. You receive the new decision plus the most semantically-similar PRIOR decisions from the same workspace. Decide whether the NEW decision contradicts, revises, or replaces any prior decision.

Return ONE JSON object (no markdown fences, no prose):

{ "op": "SUPERSEDE" | "NONE", "supersededId": "exact-id-from-candidates" | null, "reason": "<one short sentence explaining what changed and why>" }

Rules:
- "SUPERSEDE" only when the new decision genuinely contradicts or replaces the prior one. Different topic = NONE. Same topic, same conclusion = NONE. Same topic, different conclusion = SUPERSEDE.
- Match by semantic meaning, not exact text.
- Use the exact id from the candidates list. Never invent an id.
- Prefer NONE over SUPERSEDE when in doubt — false-positive supersessions corrupt the audit trail.
- Output JSON only.`;

export interface SupersessionResult {
  supersededId: string;
  reason: string;
}

export async function detectSupersession(args: {
  workspaceId: string;
  runId: string;
  newDecisionId: string;
  newDecisionContent: string;
  newDecisionType: string;
}): Promise<SupersessionResult[]> {
  try {
    const candidates = await findSupersessionCandidates(
      args.workspaceId,
      args.newDecisionContent,
      args.runId,
      5,
    );
    if (candidates.length === 0) return [];

    const prompt = buildPrompt(args, candidates);
    const raw = await generateText({
      instructions: DETECTOR_PROMPT,
      input: [{ role: "user", content: prompt }],
      maxTokens: 400,
    });

    const op = parseOp(raw);
    if (!op || op.op !== "SUPERSEDE" || !op.supersededId) return [];

    // Drop hallucinated ids — guard the audit trail against LLM noise.
    const validIds = new Set(candidates.map((c) => c.id));
    if (!validIds.has(op.supersededId)) return [];

    await setSupersession(
      args.newDecisionId,
      op.supersededId,
      op.reason ?? "Agent decision revised an earlier choice.",
    );

    return [
      {
        supersededId: op.supersededId,
        reason: op.reason ?? "Agent decision revised an earlier choice.",
      },
    ];
  } catch (err) {
    console.error(`[agent-audit] supersession detector failed:`, err);
    return [];
  }
}

function buildPrompt(
  args: { newDecisionContent: string; newDecisionType: string },
  candidates: DecisionCandidate[],
): string {
  const cand = candidates
    .map(
      (c, i) =>
        `Candidate #${i + 1}\n  id: ${c.id}\n  type: ${c.decisionType}\n  decidedAt: ${c.decidedAt.toISOString()}\n  text: ${c.decisionContent}`,
    )
    .join("\n\n");
  return `NEW DECISION\n  type: ${args.newDecisionType}\n  text: ${args.newDecisionContent}\n\nCANDIDATES (prior decisions in this workspace, ranked by similarity):\n\n${cand}`;
}

interface ParsedOp {
  op: "SUPERSEDE" | "NONE";
  supersededId: string | null;
  reason: string | null;
}

function parseOp(raw: string): ParsedOp | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(raw.slice(start, end + 1)) as {
      op?: unknown;
      supersededId?: unknown;
      reason?: unknown;
    };
    const op = obj.op === "SUPERSEDE" ? "SUPERSEDE" : "NONE";
    return {
      op,
      supersededId:
        typeof obj.supersededId === "string" && obj.supersededId.length > 0
          ? obj.supersededId
          : null,
      reason:
        typeof obj.reason === "string" && obj.reason.trim().length > 0
          ? obj.reason.trim()
          : null,
    };
  } catch {
    return null;
  }
}
