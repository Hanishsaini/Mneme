import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import { listStaleMemoryItems } from "@/features/memory/server/staleness";
import { toMemoryItemDTO } from "@/lib/db/mappers";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

/**
 * GET /api/workspaces/:workspaceId/memory/stale
 *
 * Returns memory items that have rotted past their per-kind freshness
 * threshold. Drives the red-dot indicator on the Memory header button and
 * the "Needs review" tab inside the panel. Members only.
 *
 * Cheap to call repeatedly — the per-(workspaceId, kind) index handles the
 * scan and the resultset is bounded by the workspace's own backlog. We
 * return both items and count so the indicator can render before the panel
 * opens.
 */
export const GET = withHandler({ paramsSchema }, async ({ user, params }) => {
  await requireMembership(user.id, params.workspaceId);
  const items = await listStaleMemoryItems(params.workspaceId);
  return { items: items.map(toMemoryItemDTO), count: items.length };
});
