import "server-only";
import type { MemoryItem, MemoryItemKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/** Data access for MemoryItem rows. Services own orchestration; this just
 *  exposes the queries we actually use. */

export interface ListItemsFilter {
  kind?: MemoryItemKind;
  /** true = only resolved, false = only open, undefined = both. */
  resolved?: boolean;
}

export function listMemoryItems(
  workspaceId: string,
  filter: ListItemsFilter = {},
) {
  return prisma.memoryItem.findMany({
    where: {
      workspaceId,
      // Hide chain heads' ancestors — only the most recent revision of a
      // decision should show in list views. Superseded items remain
      // queryable via the per-item history endpoint.
      supersededById: null,
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.resolved === true
        ? { resolvedAt: { not: null } }
        : filter.resolved === false
          ? { resolvedAt: null }
          : {}),
    },
    orderBy: [{ resolvedAt: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { supersedes: true } } },
  });
}

/** Walks the supersession chain rooted at `id`, returning the item plus
 *  every ancestor revision newest-first. Powers the history-trail UI. */
export async function getMemoryItemHistory(id: string): Promise<MemoryItem[]> {
  const head = await prisma.memoryItem.findUnique({ where: { id } });
  if (!head) return [];
  const chain: MemoryItem[] = [head];
  // Walk ancestors. Each older revision has supersededById pointing at
  // the next-newer revision; we step backwards until we hit a row that
  // nothing else supersedes (the original).
  let cursor = head.id;
  while (chain.length < 50) {
    const prev = await prisma.memoryItem.findFirst({
      where: { supersededById: cursor },
    });
    if (!prev) break;
    chain.push(prev);
    cursor = prev.id;
  }
  return chain;
}

export function findMemoryItemById(id: string) {
  return prisma.memoryItem.findUnique({ where: { id } });
}

/** Lookback window for the "Decisions revisited recently" panel surface.
 *  30 days picks up the meaningful churn without flooding the section
 *  with months-old revisions the team has long since internalized. */
const REVISITED_LOOKBACK_DAYS = 30;
/** Lookback for the header stats pill — "N decisions revised this quarter". */
const QUARTER_LOOKBACK_DAYS = 90;
const REVISITED_LIMIT = 10;

/** Live memory items that replaced an earlier revision inside the lookback
 *  window. Each result carries the immediate predecessor so the panel can
 *  render the "Originally / Now / Why" preview without a second round-trip.
 *
 *  The `supersedes` self-relation is the predecessor edge — a head row may
 *  have multiple predecessors over time, but the panel only cares about
 *  the most recent one (the row the *latest* revision displaced). We take
 *  `take: 1, orderBy: createdAt desc` on the include to pick that one. */
export async function listRevisitedDecisions(workspaceId: string) {
  const since = new Date(
    Date.now() - REVISITED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  return prisma.memoryItem.findMany({
    where: {
      workspaceId,
      supersededById: null,
      updatedAt: { gte: since },
      supersedes: { some: {} },
    },
    orderBy: { updatedAt: "desc" },
    take: REVISITED_LIMIT,
    include: {
      _count: { select: { supersedes: true } },
      supersedes: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          text: true,
          supersededReason: true,
          createdAt: true,
        },
      },
    },
  });
}

/** Count of distinct live memory items that have ANY supersession activity
 *  inside the last 90 days. Used by the header pill. Counts heads, not edges,
 *  so a decision revised three times in the window counts as one. */
export function countRevisedThisQuarter(workspaceId: string): Promise<number> {
  const since = new Date(
    Date.now() - QUARTER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  return prisma.memoryItem.count({
    where: {
      workspaceId,
      supersededById: null,
      updatedAt: { gte: since },
      supersedes: { some: {} },
    },
  });
}

export function updateMemoryItem(
  id: string,
  data: {
    text?: string;
    ownerId?: string | null;
    dueAt?: Date | null;
    resolvedAt?: Date | null;
    confirmedAt?: Date | null;
  },
) {
  return prisma.memoryItem.update({ where: { id }, data });
}

export function deleteMemoryItem(id: string) {
  return prisma.memoryItem.delete({ where: { id } });
}
