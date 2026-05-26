import type {
  CanvasDocument,
  Conversation,
  MemoryItem,
  Message,
  Workspace,
  WorkspaceMember,
  User,
} from "@prisma/client";
import type {
  CanvasDocumentDTO,
  ConversationDTO,
  MemoryItemDTO,
  MessageDTO,
  WorkspaceDTO,
  WorkspaceMemberDTO,
} from "@workspace/shared";

/**
 * Prisma models → transport-safe DTOs. Dates become ISO strings; nothing
 * server-only (relations we didn't ask for, internal columns) leaks out.
 */

export function toMessageDTO(m: Message): MessageDTO {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    authorId: m.authorId,
    content: m.content,
    status: m.status,
    clientMsgId: m.clientMsgId,
    serverSeq: m.serverSeq,
    createdAt: m.createdAt.toISOString(),
    completedAt: m.completedAt?.toISOString() ?? null,
  };
}

export function toConversationDTO(c: Conversation): ConversationDTO {
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    title: c.title,
    summary: c.summary,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toCanvasDTO(d: CanvasDocument): CanvasDocumentDTO {
  return {
    id: d.id,
    workspaceId: d.workspaceId,
    type: d.type,
    snapshot: (d.snapshot as Record<string, unknown>) ?? {},
    version: d.version,
    updatedAt: d.updatedAt.toISOString(),
  };
}

export function toMemberDTO(
  m: WorkspaceMember & { user: User },
): WorkspaceMemberDTO {
  return {
    id: m.id,
    workspaceId: m.workspaceId,
    userId: m.userId,
    role: m.role,
    cursorColor: m.cursorColor,
    user: {
      id: m.user.id,
      name: m.user.name,
      // DB column is `image` (NextAuth convention); the wire/DTO keeps the
      // semantic `avatarUrl` name. Mapping happens only here.
      avatarUrl: m.user.image,
    },
  };
}

export function toMemoryItemDTO(m: MemoryItem): MemoryItemDTO {
  return {
    id: m.id,
    workspaceId: m.workspaceId,
    conversationId: m.conversationId,
    messageId: m.messageId,
    kind: m.kind,
    text: m.text,
    ownerId: m.ownerId,
    dueAt: m.dueAt?.toISOString() ?? null,
    resolvedAt: m.resolvedAt?.toISOString() ?? null,
    confirmedAt: m.confirmedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export function toWorkspaceDTO(
  w: Workspace & { members: (WorkspaceMember & { user: User })[] },
): WorkspaceDTO {
  return {
    id: w.id,
    name: w.name,
    ownerId: w.ownerId,
    createdAt: w.createdAt.toISOString(),
    members: w.members.map(toMemberDTO),
  };
}
