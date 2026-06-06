import { z } from "zod";
import { withAgentAuth, requireWorkspace } from "@/lib/api/agent-handler";
import { Errors } from "@/lib/api/errors";
import { checkDecisionIngestRateLimit } from "@/lib/redis/ratelimit";
import { findAgentRun } from "@/features/agent-audit/server/agent-runs.repository";
import { ingestDecision } from "@/features/agent-audit/server/decision-ingestion.service";
import { listDecisionsForRun } from "@/features/agent-audit/server/decision-events.repository";
import {
  toAgentDecisionEventDTO,
  toPolicyViolationDTO,
} from "@/lib/db/mappers";

const paramsSchema = z.object({ runId: z.string().min(1) });

const ingestBodySchema = z.object({
  decision_type: z.string().min(1).max(200),
  decision_content: z.string().min(1).max(10_000),
  context_used: z.record(z.unknown()).default({}),
  tool_called: z.string().max(300).optional(),
  tool_output: z.record(z.unknown()).optional(),
});

/**
 * POST /api/agent-runs/:runId/decisions
 *
 * The hot path — the endpoint agent frameworks call after every
 * decision. Runs the full ingestion pipeline: embed, hash-chain,
 * persist, supersession-detect, policy-check. Returns the decision row
 * plus the supersession and violation arrays so the agent can react
 * in-loop.
 *
 * Authenticated as an EDITOR+ session member or a workspace-scoped Bearer
 * API key — the latter is how an unattended agent ingests via the SDK.
 * The run's own `workspaceId` is the authorization scope, so a key can
 * only ever write into the workspace it was minted for.
 */
export const POST = withAgentAuth(
  { paramsSchema, bodySchema: ingestBodySchema },
  async ({ principal, params, body }) => {
    // Throttle before any DB/LLM work. Key on the API key when an unattended
    // agent is ingesting (the real cost/DoS vector), otherwise the member.
    const principalId =
      principal.kind === "apiKey" ? principal.apiKeyId : principal.user.id;
    const limit = await checkDecisionIngestRateLimit(principalId);
    if (!limit.allowed) throw Errors.rateLimited(limit.resetSeconds);

    const run = await findAgentRun(params.runId);
    if (!run) throw Errors.notFound("Agent run");
    await requireWorkspace(principal, run.workspaceId, "EDITOR");
    if (run.status !== "RUNNING") {
      throw Errors.conflict("Cannot ingest into a closed run");
    }

    const result = await ingestDecision({
      runId: params.runId,
      decisionType: body.decision_type,
      decisionContent: body.decision_content,
      contextUsed: (body.context_used ?? {}) as Record<string, unknown>,
      toolCalled: body.tool_called ?? null,
      toolOutput: (body.tool_output ?? null) as Record<string, unknown> | null,
    });
    return {
      decision_id: result.decision.id,
      content_hash: result.decision.contentHash,
      previous_hash: result.decision.previousHash,
      supersessions: result.supersessions,
      violations: result.violations,
    };
  },
);

/**
 * GET /api/agent-runs/:runId/decisions
 *
 * Full decision timeline for a run, oldest-first. Each row carries its
 * policy violations (with the matched rule's text denormalized for
 * display). Session member or workspace-scoped API key.
 */
export const GET = withAgentAuth({ paramsSchema }, async ({ principal, params }) => {
  const run = await findAgentRun(params.runId);
  if (!run) throw Errors.notFound("Agent run");
  await requireWorkspace(principal, run.workspaceId, "VIEWER");
  const rows = await listDecisionsForRun(params.runId);
  return {
    run: { id: run.id, workspaceId: run.workspaceId, agentName: run.agentName, agentVersion: run.agentVersion, status: run.status },
    decisions: rows.map((r) => ({
      ...toAgentDecisionEventDTO(r),
      violations: r.violations.map(toPolicyViolationDTO),
    })),
  };
});
