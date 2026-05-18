import "server-only";
import { redisKeys, type WorkspaceSnapshot } from "@workspace/shared";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
import { seedSeq } from "@/lib/redis/sequence";
import { getPresence } from "@/lib/redis/presence";
import {
  toCanvasDTO,
  toConversationDTO,
  toMessageDTO,
  toWorkspaceDTO,
} from "@/lib/db/mappers";
import { Errors } from "@/lib/api/errors";
import { CURSOR_COLORS, AI_CONTEXT_MESSAGE_WINDOW } from "@/config/constants";
import {
  createWorkspaceWithDefaults,
  findPrimaryCanvas,
  findPrimaryConversation,
  findWorkspaceById,
} from "./workspace.repository";
import {
  findConversationById,
  listConversationsForWorkspace,
} from "@/features/conversation/server/conversation.repository";

/**
 * Builds the server-rendered snapshot the client store hydrates from. This
 * is the single read that bootstraps a workspace session: workspace +
 * members, the active conversation with recent history, the full thread
 * list (light metadata), the canvas, live presence, and the current
 * serverSeq watermark for gap detection.
 *
 * `activeConversationId` selects which thread's messages to load. When
 * omitted or invalid, falls back to the most recently updated thread (which
 * matches the order in the thread switcher, so the user lands on what
 * they last touched).
 *
 * Side effect: reseeds the Redis sequence counters from the DB max so a
 * Redis cold start can't hand out a serverSeq that collides with history.
 */
export async function getWorkspaceSnapshot(
  workspaceId: string,
  activeConversationId?: string,
): Promise<WorkspaceSnapshot> {
  const workspace = await findWorkspaceById(workspaceId);
  if (!workspace) throw Errors.notFound("Workspace");

  const conversations = await listConversationsForWorkspace(workspaceId);
  if (conversations.length === 0) throw Errors.notFound("Conversation");

  // Pick the active conversation: explicit query param wins, but only if it
  // belongs to this workspace; otherwise fall back to the most recently
  // updated one (first in the list, since listed newest-first by updatedAt).
  let conversation = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId)
    : undefined;
  if (!conversation) conversation = conversations[0];

  const canvas = await findPrimaryCanvas(workspaceId);
  if (!canvas) throw Errors.notFound("Canvas");

  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { serverSeq: "desc" },
    take: AI_CONTEXT_MESSAGE_WINDOW,
  });
  messages.reverse();

  // Reseed sequence counters from durable state (no-op if already set).
  const maxMessageSeq = messages.at(-1)?.serverSeq ?? 0;
  await seedSeq(redisKeys.messageSeq(conversation.id), maxMessageSeq);
  await seedSeq(redisKeys.canvasSeq(canvas.id), canvas.version);

  const presence = await getPresence(workspaceId);

  const serverSeq = Math.max(
    maxMessageSeq,
    Number((await redis.get(redisKeys.canvasSeq(canvas.id))) ?? canvas.version),
  );

  return {
    workspace: toWorkspaceDTO(workspace),
    conversations: conversations.map(toConversationDTO),
    conversation: toConversationDTO(conversation),
    messages: messages.map(toMessageDTO),
    canvas: toCanvasDTO(canvas),
    presence,
    serverSeq,
  };
}

export async function createWorkspace(name: string, ownerId: string) {
  const color = CURSOR_COLORS[0];
  const ws = await createWorkspaceWithDefaults({
    name,
    ownerId,
    ownerCursorColor: color,
  });
  return toWorkspaceDTO(ws);
}

/** Adds a second member, assigning the next free cursor color. */
export async function addMember(workspaceId: string, userId: string) {
  const existing = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: { cursorColor: true },
  });
  const used = new Set(existing.map((m) => m.cursorColor));
  const color =
    CURSOR_COLORS.find((c) => !used.has(c)) ?? CURSOR_COLORS[0];

  return prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId, userId } },
    update: {},
    create: { workspaceId, userId, role: "EDITOR", cursorColor: color },
    include: { user: true },
  });
}
