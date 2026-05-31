import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import {
  countViolationsForRun,
  createAgentRun,
  listAgentRunsForWorkspace,
} from "@/features/agent-audit/server/agent-runs.repository";
import { toAgentRunDTO } from "@/lib/db/mappers";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const createBodySchema = z.object({
  agent_name: z.string().min(1).max(200),
  agent_version: z.string().max(100).default(""),
  metadata: z.record(z.unknown()).default({}),
});

/**
 * POST /api/workspaces/:workspaceId/agent-runs
 *
 * Opens a new agent run. The returned `run.id` is the handle the SDK uses
 * for subsequent decision-ingestion + endRun calls. Member-gated on the
 * owning workspace.
 */
export const POST = withHandler(
  { paramsSchema, bodySchema: createBodySchema },
  async ({ user, params, body }) => {
    await requireMembership(user.id, params.workspaceId, "EDITOR");
    const run = await createAgentRun({
      workspaceId: params.workspaceId,
      agentName: body.agent_name,
      agentVersion: body.agent_version,
      metadata: body.metadata,
    });
    return { run: toAgentRunDTO(run) };
  },
);

/**
 * GET /api/workspaces/:workspaceId/agent-runs
 *
 * List runs (newest first, 50 max). Each row carries `decisionCount` and
 * unresolved-`violationCount` for the table row badges.
 */
export const GET = withHandler({ paramsSchema }, async ({ user, params }) => {
  await requireMembership(user.id, params.workspaceId);
  const runs = await listAgentRunsForWorkspace(params.workspaceId);
  // Per-run violation counts. Done after the listing query — Prisma can't
  // express "count of related grand-children where condition" in a single
  // include, so we do n+1 here. At 50 runs/page this is cheap; if it
  // ever gets hot we'll fold it into a single raw query.
  const withCounts = await Promise.all(
    runs.map(async (r) => toAgentRunDTO(r, await countViolationsForRun(r.id))),
  );
  return { runs: withCounts };
});
