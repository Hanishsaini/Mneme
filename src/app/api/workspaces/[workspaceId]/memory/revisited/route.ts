import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import {
  countRevisedThisQuarter,
  listRevisitedDecisions,
} from "@/features/memory/server/memory-items.repository";
import { toRevisitedDecisionDTO } from "@/lib/db/mappers";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

/**
 * GET /api/workspaces/:workspaceId/memory/revisited
 *
 * Powers the "Decisions revisited recently" surface inside the Memory panel
 * — live memory items that replaced an earlier revision within the last 30
 * days, paired with their immediate predecessor for the
 * Originally / Now / Why preview. Also returns the 90-day count for the
 * header stats pill so the panel renders without a second round-trip.
 *
 * One query for items, one count query, both indexed on
 * (workspaceId, supersededById) via the self-relation index added in the
 * supersession migration.
 */
export const GET = withHandler({ paramsSchema }, async ({ user, params }) => {
  await requireMembership(user.id, params.workspaceId);
  const [rows, quarterCount] = await Promise.all([
    listRevisitedDecisions(params.workspaceId),
    countRevisedThisQuarter(params.workspaceId),
  ]);
  // toRevisitedDecisionDTO returns null if a race deleted the predecessor
  // between the WHERE filter and the include load. Filter those out rather
  // than show an empty card.
  const items = rows
    .map(toRevisitedDecisionDTO)
    .filter((x): x is NonNullable<typeof x> => x !== null);
  return { items, quarterCount };
});
