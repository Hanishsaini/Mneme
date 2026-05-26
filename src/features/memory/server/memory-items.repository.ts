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
): Promise<MemoryItem[]> {
  return prisma.memoryItem.findMany({
    where: {
      workspaceId,
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.resolved === true
        ? { resolvedAt: { not: null } }
        : filter.resolved === false
          ? { resolvedAt: null }
          : {}),
    },
    orderBy: [{ resolvedAt: "asc" }, { createdAt: "desc" }],
  });
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
  },
) {
  return prisma.memoryItem.update({ where: { id }, data });
}

export function deleteMemoryItem(id: string) {
  return prisma.memoryItem.delete({ where: { id } });
}
