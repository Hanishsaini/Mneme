import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import {
  findMemoryItemById,
  getMemoryItemHistory,
} from "@/features/memory/server/memory-items.repository";
import { toMemoryItemDTO } from "@/lib/db/mappers";
import { Errors } from "@/lib/api/errors";

const paramsSchema = z.object({ itemId: z.string().min(1) });

/**
 * GET /api/memory/items/:itemId/history
 *
 * Walks the supersession chain rooted at `itemId`, newest-first. The
 * first element is the row itself (the current revision); each
 * subsequent element is the next-older revision the operation-emitter
 * pipeline replaced when the team revised the decision.
 *
 * Member-gated on the owning workspace. Used by the MemoryRow history
 * trail UI — clicking the "revised" pill expands the inline chain.
 */
export const GET = withHandler({ paramsSchema }, async ({ user, params }) => {
  const head = await findMemoryItemById(params.itemId);
  if (!head) throw Errors.notFound("Memory item");
  await requireMembership(user.id, head.workspaceId);

  const chain = await getMemoryItemHistory(params.itemId);
  return { items: chain.map(toMemoryItemDTO) };
});
