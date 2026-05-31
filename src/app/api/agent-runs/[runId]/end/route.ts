import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import { Errors } from "@/lib/api/errors";
import {
  endAgentRun,
  findAgentRun,
} from "@/features/agent-audit/server/agent-runs.repository";

const paramsSchema = z.object({ runId: z.string().min(1) });

const endBodySchema = z.object({
  status: z.enum(["COMPLETED", "FAILED", "CANCELLED"]),
});

/**
 * POST /api/agent-runs/:runId/end
 *
 * Close an open run with a terminal status. After this call ingestion
 * into the same runId returns 409. Member-gated.
 */
export const POST = withHandler(
  { paramsSchema, bodySchema: endBodySchema },
  async ({ user, params, body }) => {
    const run = await findAgentRun(params.runId);
    if (!run) throw Errors.notFound("Agent run");
    await requireMembership(user.id, run.workspaceId, "EDITOR");
    if (run.status !== "RUNNING") {
      throw Errors.conflict("Run is already closed");
    }
    await endAgentRun(params.runId, body.status);
    return { ok: true };
  },
);
