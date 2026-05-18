import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { TxClient } from "@/lib/db/transaction";

/**
 * Data access for conversation rows. Repositories own Prisma calls;
 * services own orchestration. The default `db = prisma` lets callers opt
 * into a `$transaction` by passing the tx client through.
 */

export function findConversationById(id: string, db: TxClient = prisma) {
  return db.conversation.findUnique({ where: { id } });
}

/** All conversations in a workspace, newest first. Light shape — no
 *  messages, no AI runs. The thread switcher renders from this. */
export function listConversationsForWorkspace(
  workspaceId: string,
  db: TxClient = prisma,
) {
  return db.conversation.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
  });
}

export function createConversation(
  input: { workspaceId: string; title?: string },
  db: TxClient = prisma,
) {
  return db.conversation.create({
    data: {
      workspaceId: input.workspaceId,
      title: input.title ?? "New conversation",
    },
  });
}

export function updateConversation(
  id: string,
  data: { title?: string },
  db: TxClient = prisma,
) {
  return db.conversation.update({ where: { id }, data });
}

export function deleteConversation(id: string, db: TxClient = prisma) {
  // Cascade clears messages + AI runs (FK onDelete: Cascade in schema).
  return db.conversation.delete({ where: { id } });
}
