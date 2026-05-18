/**
 * Transport-safe domain types. Mirrors the Prisma models but with dates as
 * ISO strings so payloads survive JSON serialization across the wire.
 */

export type MemberRole = "OWNER" | "EDITOR" | "VIEWER";
export type MessageRole = "USER" | "ASSISTANT" | "SYSTEM";
export type MessageStatus = "PENDING" | "STREAMING" | "COMPLETE" | "ERROR";
export type AiRunStatus = "RUNNING" | "COMPLETE" | "ERROR";
export type CanvasType = "NOTES" | "CANVAS";
export type PresenceStatus = "online" | "away";

export interface UserPublic {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface WorkspaceMemberDTO {
  id: string;
  workspaceId: string;
  userId: string;
  role: MemberRole;
  cursorColor: string;
  user: UserPublic;
}

export interface WorkspaceDTO {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  members: WorkspaceMemberDTO[];
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  role: MessageRole;
  authorId: string | null;
  content: string;
  status: MessageStatus;
  clientMsgId: string | null;
  serverSeq: number;
  createdAt: string;
  completedAt: string | null;
}

export interface ConversationDTO {
  id: string;
  workspaceId: string;
  title: string;
  summary: string | null;
  createdAt: string;
}

export interface PresenceUser {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  cursorColor: string;
  status: PresenceStatus;
  lastSeen: number;
}

export interface CursorPosition {
  x: number;
  y: number;
}

/** A client-proposed canvas mutation, before the server orders it. */
export interface CanvasOp {
  opId: string;
  type: "insert" | "update" | "delete";
  payload: unknown;
}

/** A canvas op after the server has accepted and globally ordered it. */
export interface CanvasOpApplied extends CanvasOp {
  canvasId: string;
  actorId: string;
  serverSeq: number;
  createdAt: string;
}

export interface CanvasDocumentDTO {
  id: string;
  workspaceId: string;
  type: CanvasType;
  snapshot: Record<string, unknown>;
  version: number;
  updatedAt: string;
}

/** Initial server-rendered snapshot handed to the client store on load. */
export interface WorkspaceSnapshot {
  workspace: WorkspaceDTO;
  /** The full thread list in this workspace, newest first. Light metadata
   *  only — clients render the thread switcher from here. */
  conversations: ConversationDTO[];
  /** The currently-active thread (either picked by `?thread=` or the most
   *  recent one). Its messages are included; sibling threads' messages are
   *  fetched on demand. */
  conversation: ConversationDTO;
  messages: MessageDTO[];
  canvas: CanvasDocumentDTO;
  presence: PresenceUser[];
  serverSeq: number;
}

/** Response shape for the catch-up / resync endpoint. */
export interface SyncDelta {
  messages: MessageDTO[];
  canvasOps: CanvasOpApplied[];
  presence: PresenceUser[];
  serverSeq: number;
}
