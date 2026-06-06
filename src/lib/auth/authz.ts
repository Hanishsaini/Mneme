import type { MemberRole } from "@workspace/shared";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/api/errors";

/**
 * Workspace membership is the authorization boundary for every data
 * operation. These helpers throw ApiError so the route wrapper maps them to
 * the right status automatically.
 */

const ROLE_RANK: Record<MemberRole, number> = {
  VIEWER: 0,
  EDITOR: 1,
  OWNER: 2,
};

export async function requireMembership(
  userId: string,
  workspaceId: string,
  minRole: MemberRole = "VIEWER",
) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw Errors.forbidden();
  if (ROLE_RANK[member.role] < ROLE_RANK[minRole]) throw Errors.forbidden();
  return member;
}

/** Resolve the workspace that owns a conversation, then assert membership. */
export async function requireConversationAccess(
  userId: string,
  conversationId: string,
  minRole: MemberRole = "VIEWER",
) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, workspaceId: true },
  });
  if (!conversation) throw Errors.notFound("Conversation");
  await requireMembership(userId, conversation.workspaceId, minRole);
  return conversation;
}
