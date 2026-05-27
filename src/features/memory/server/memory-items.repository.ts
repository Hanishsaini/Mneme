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
