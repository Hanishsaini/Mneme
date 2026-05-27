import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Staleness — the engine behind the "Needs review" tab and the red-dot
 * indicator on the Memory button. Different memory kinds decay at different
 * rates: a decision is durable, an action item rots fast, a question stays
 * open until someone closes it.
 *
 * A DECISION or CONTEXT is stale when the user hasn't confirmed it in
 * STALE_DECISION_DAYS / STALE_CONTEXT_DAYS — staleness measures from
 * `confirmedAt` if present, else `createdAt`. Confirming an item via PATCH
 * resets the clock.
 *
 * An ACTION_ITEM or QUESTION is stale purely by age while unresolved.
 *
 * Resolved items are never stale.
 */

export const STALE_DECISION_DAYS = 45;
export const STALE_CONTEXT_DAYS = 90;
export const STALE_QUESTION_DAYS = 14;
export const STALE_ACTION_ITEM_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function thresholdDate(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

/**
 * All stale memory items in a workspace, newest-stale first. A single
 * Prisma OR query covering all four kinds — keeps the round-trip count to
 * one and lets Postgres use the `(workspaceId, kind)` index.
 */
export function listStaleMemoryItems(workspaceId: string) {
  const decisionCutoff = thresholdDate(STALE_DECISION_DAYS);
  const contextCutoff = thresholdDate(STALE_CONTEXT_DAYS);
  const questionCutoff = thresholdDate(STALE_QUESTION_DAYS);
  const actionCutoff = thresholdDate(STALE_ACTION_ITEM_DAYS);

  return prisma.memoryItem.findMany({
    where: {
      workspaceId,
      resolvedAt: null,
      // Superseded items have been revised by a newer revision — staleness
      // alerts about the OLD version of a decision would be confusing, so
      // skip them. The newer head, if itself stale, still surfaces here.
      supersededById: null,
      OR: [
        // DECISION / CONTEXT: stale when the last confirmation (or creation
        // if never confirmed) is older than the threshold. Modeled with two
        // OR branches because Prisma can't `COALESCE` directly.
        {
          kind: "DECISION",
          OR: [
            { confirmedAt: { lt: decisionCutoff } },
            { AND: [{ confirmedAt: null }, { createdAt: { lt: decisionCutoff } }] },
          ],
        },
        {
          kind: "CONTEXT",
          OR: [
            { confirmedAt: { lt: contextCutoff } },
            { AND: [{ confirmedAt: null }, { createdAt: { lt: contextCutoff } }] },
          ],
        },
        { kind: "QUESTION", createdAt: { lt: questionCutoff } },
        { kind: "ACTION_ITEM", createdAt: { lt: actionCutoff } },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { supersedes: true } } },
  });
}

/** Cheap count for the red-dot indicator on the header. */
export async function countStaleMemoryItems(workspaceId: string): Promise<number> {
  const items = await listStaleMemoryItems(workspaceId);
  return items.length;
}
