import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { Errors } from "@/lib/api/errors";
import { requireConversationAccess } from "@/lib/auth/authz";
import { setRunAborted } from "@/lib/redis/run-control";
import { prisma } from "@/lib/db/prisma";

const paramsSchema = z.object({ runId: z.string().min(1) });

/**
 * POST /api/ai/runs/:runId/stop
 *
 * User-initiated abort of an in-flight AI run. Sets a Redis flag the
 * orchestrator polls between token yields; the running stream breaks at
 * the next poll and the StreamBuffer's accumulated content gets persisted
 * via the normal completion path (interrupt-safe).
 *
 * No-op on already-finished runs — safe to spam the button.
 */
export const POST = withHandler({ paramsSchema }, async ({ user, params }) => {
  const run = await prisma.aiRun.findUnique({
    where: { id: params.runId },
    select: { conversationId: true, status: true },
  });
  if (!run) throw Errors.notFound("Run");

  await requireConversationAccess(user.id, run.conversationId, "EDITOR");

  if (run.status !== "RUNNING") {
    return { ok: true, alreadyDone: true };
  }

  await setRunAborted(params.runId);
  return { ok: true };
});
