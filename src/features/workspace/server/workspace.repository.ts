import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Data access for workspaces. Repositories own Prisma queries; services own
 * orchestration + business rules. Keeping them split makes the query surface
 * easy to audit and swap.
 */

const memberInclude = {
  members: { include: { user: true } },
} as const;

export function findWorkspaceById(workspaceId: string) {
  return prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: memberInclude,
  });
}

export function listWorkspacesForUser(userId: string) {
  return prisma.workspace.findMany({
    where: { members: { some: { userId } } },
    include: memberInclude,
    orderBy: { createdAt: "desc" },
  });
}

export function findPrimaryConversation(workspaceId: string) {
  return prisma.conversation.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
  });
}

export function renameWorkspace(workspaceId: string, name: string) {
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: { name },
  });
}

/** Hard delete. Every workspace-owned row cascades via the schema's
 *  onDelete: Cascade FKs (members, conversations, runs, keys, …). */
export function deleteWorkspace(workspaceId: string) {
  return prisma.workspace.delete({ where: { id: workspaceId } });
}

export function createWorkspaceWithDefaults(input: {
  name: string;
  ownerId: string;
  ownerCursorColor: string;
}) {
  return prisma.workspace.create({
    data: {
      name: input.name,
      ownerId: input.ownerId,
      members: {
        create: {
          userId: input.ownerId,
          role: "OWNER",
          cursorColor: input.ownerCursorColor,
        },
      },
      conversations: { create: { title: "New conversation" } },
    },
    include: memberInclude,
  });
}
