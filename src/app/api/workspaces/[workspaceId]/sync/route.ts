import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import { getSyncDelta } from "@/features/conversation/server/conversation.service";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

/**
 * GET /api/workspaces/:workspaceId/sync?since=<serverSeq>
 * Catch-up endpoint. A client that detects a serverSeq gap or reconnects
 * pulls every missed message + canvas op plus a fresh presence snapshot.
 * This is what lets the realtime transport be best-effort.
 */
export const GET = withHandler(
  { paramsSchema },
  async ({ req, user, params }) => {
    await requireMembership(user.id, params.workspaceId);
    const url = new URL(req.url);
    const since = Number(url.searchParams.get("since") ?? "0");
    const conversationId = url.searchParams.get("conversation") ?? undefined;
    const delta = await getSyncDelta(
      params.workspaceId,
      Number.isFinite(since) ? since : 0,
      conversationId,
    );
    return delta;
  },
);
