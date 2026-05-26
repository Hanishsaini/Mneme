import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import { searchRelatedToCompose } from "@/features/memory/server/memory.service";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const bodySchema = z.object({
  query: z.string().min(1).max(4000),
  /** Excluded so the composer's surface only ever shows OTHER threads. */
  excludeConversationId: z.string().min(1).optional(),
});

/**
 * POST /api/workspaces/:workspaceId/memory/related
 *
 * Context-triggered surfacing endpoint. Called by the prompt composer with
 * the user's in-progress text; returns up to 3 semantically-related past
 * messages from other threads in this workspace.
 *
 * POST (not GET) because the query payload can be large (multi-line prompt)
 * and POST avoids URL-length concerns + accidental caching by intermediates.
 * The work itself is read-only.
 *
 * Threshold filtering happens server-side — see `RELATED_DISTANCE_THRESHOLD`
 * in memory.service. The endpoint returns an empty array when nothing
 * clears the bar, and the UI just hides the panel.
 */
export const POST = withHandler(
  { paramsSchema, bodySchema },
  async ({ user, params, body }) => {
    await requireMembership(user.id, params.workspaceId);
    const hits = await searchRelatedToCompose(params.workspaceId, body.query, {
      excludeConversationId: body.excludeConversationId,
      k: 3,
    });
    return { hits };
  },
);
