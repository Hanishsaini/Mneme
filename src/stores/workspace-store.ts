"use client";

import { create } from "zustand";
import type {
  CanvasDocumentDTO,
  CanvasOp,
  CanvasOpApplied,
  ConversationDTO,
  CursorPosition,
  MessageDTO,
  PresenceUser,
  WorkspaceDTO,
  WorkspaceMemberDTO,
  WorkspaceSnapshot,
} from "@workspace/shared";

/**
 * The single client-side source of truth for a workspace session. It is the
 * MERGED view of three inputs:
 *   1. the server-rendered snapshot (hydration)
 *   2. realtime socket deltas (push)
 *   3. optimistic local edits (canvas)
 *
 * Components never touch the socket directly — they read selectors here and
 * call actions; the SocketProvider is the only writer of realtime deltas.
 */

export type ConnectionStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "offline";

interface ActiveRun {
  runId: string;
  messageId: string;
  buffer: string;
}

interface WorkspaceState {
  // ── identity / hydration ──────────────────────────────────────────────
  hydrated: boolean;
  workspace: WorkspaceDTO | null;
  /** All threads in the active workspace, newest first. Drives the thread
   *  switcher. The currently-rendered thread is `conversation`. */
  conversations: ConversationDTO[];
  conversation: ConversationDTO | null;

  // ── connection ────────────────────────────────────────────────────────
  connection: ConnectionStatus;

  // ── ordering watermark (gap detection → resync) ──────────────────────
  lastServerSeq: number;

  // ── presence ──────────────────────────────────────────────────────────
  presence: Map<string, PresenceUser>;
  cursors: Map<string, CursorPosition>;
  typingUserIds: Set<string>;

  // ── conversation ──────────────────────────────────────────────────────
  messages: MessageDTO[];
  activeRun: ActiveRun | null;

  // ── canvas ────────────────────────────────────────────────────────────
  canvas: CanvasDocumentDTO | null;
  pendingOps: Map<string, CanvasOp>;

  // ── actions: hydration ───────────────────────────────────────────────
  hydrate: (snapshot: WorkspaceSnapshot) => void;
  setConnection: (status: ConnectionStatus) => void;

  // ── actions: thread list ─────────────────────────────────────────────
  upsertConversation: (conversation: ConversationDTO) => void;
  removeConversation: (id: string) => void;

  // ── actions: membership ──────────────────────────────────────────────
  addWorkspaceMember: (member: WorkspaceMemberDTO) => void;

  // ── actions: presence ────────────────────────────────────────────────
  setPresenceState: (users: PresenceUser[]) => void;
  upsertPresence: (user: PresenceUser) => void;
  removePresence: (userId: string) => void;
  setCursor: (userId: string, pos: CursorPosition) => void;
  setTyping: (userId: string, isTyping: boolean) => void;

  // ── actions: conversation ────────────────────────────────────────────
  upsertMessage: (message: MessageDTO) => void;
  startRun: (runId: string, messageId: string) => void;
  appendDelta: (runId: string, token: string) => void;
  completeRun: (runId: string, message: MessageDTO) => void;
  failRun: (runId: string) => void;

  // ── actions: canvas ──────────────────────────────────────────────────
  addPendingOp: (op: CanvasOp) => void;
  applyCanvasOp: (applied: CanvasOpApplied) => void;

  // ── actions: resync ──────────────────────────────────────────────────
  applySyncDelta: (delta: {
    messages: MessageDTO[];
    canvasOps: CanvasOpApplied[];
    presence: PresenceUser[];
    serverSeq: number;
  }) => void;
}

/** Keep messages ordered by serverSeq and de-duplicated by id. */
function mergeMessage(list: MessageDTO[], incoming: MessageDTO): MessageDTO[] {
  const idx = list.findIndex((m) => m.id === incoming.id);
  const next = idx === -1 ? [...list, incoming] : list.map((m) => (m.id === incoming.id ? incoming : m));
  return next.sort((a, b) => a.serverSeq - b.serverSeq);
}

function foldCanvas(
  canvas: CanvasDocumentDTO | null,
  applied: CanvasOpApplied,
): CanvasDocumentDTO | null {
  if (!canvas) return canvas;
  const blocks = [
    ...((canvas.snapshot.blocks as Array<{ id: string; text: string }>) ?? []),
  ];
  const payload = applied.payload as { id: string; text?: string };
  let nextBlocks = blocks;
  if (applied.type === "insert") {
    nextBlocks = [...blocks, { id: payload.id, text: payload.text ?? "" }];
  } else if (applied.type === "update") {
    nextBlocks = blocks.map((b) =>
      b.id === payload.id ? { ...b, text: payload.text ?? "" } : b,
    );
  } else if (applied.type === "delete") {
    nextBlocks = blocks.filter((b) => b.id !== payload.id);
  }
  return {
    ...canvas,
    snapshot: { ...canvas.snapshot, blocks: nextBlocks },
    version: applied.serverSeq,
  };
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  hydrated: false,
  workspace: null,
  conversations: [],
  conversation: null,
  connection: "connecting",
  lastServerSeq: 0,
  presence: new Map(),
  cursors: new Map(),
  typingUserIds: new Set(),
  messages: [],
  activeRun: null,
  canvas: null,
  pendingOps: new Map(),

  hydrate: (snapshot) =>
    set({
      hydrated: true,
      workspace: snapshot.workspace,
      conversations: snapshot.conversations,
      conversation: snapshot.conversation,
      messages: [...snapshot.messages].sort(
        (a, b) => a.serverSeq - b.serverSeq,
      ),
      canvas: snapshot.canvas,
      presence: new Map(snapshot.presence.map((p) => [p.userId, p])),
      lastServerSeq: snapshot.serverSeq,
    }),

  setConnection: (connection) => set({ connection }),

  upsertConversation: (conversation) =>
    set((s) => {
      const others = s.conversations.filter((c) => c.id !== conversation.id);
      // Move the touched thread to the top — matches the backend's
      // newest-by-updatedAt ordering, so the switcher stays consistent.
      return { conversations: [conversation, ...others] };
    }),

  removeConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
    })),

  addWorkspaceMember: (member) =>
    set((s) => {
      if (!s.workspace) return s;
      // Idempotent — the invite flow guarantees one publish per accept, but
      // a reconnect-resync could replay it.
      if (s.workspace.members.some((m) => m.userId === member.userId)) return s;
      return {
        workspace: {
          ...s.workspace,
          members: [...s.workspace.members, member],
        },
      };
    }),

  setPresenceState: (users) =>
    set({ presence: new Map(users.map((u) => [u.userId, u])) }),

  upsertPresence: (user) =>
    set((s) => {
      const presence = new Map(s.presence);
      presence.set(user.userId, user);
      return { presence };
    }),

  removePresence: (userId) =>
    set((s) => {
      const presence = new Map(s.presence);
      presence.delete(userId);
      const cursors = new Map(s.cursors);
      cursors.delete(userId);
      return { presence, cursors };
    }),

  setCursor: (userId, pos) =>
    set((s) => {
      const cursors = new Map(s.cursors);
      cursors.set(userId, pos);
      return { cursors };
    }),

  setTyping: (userId, isTyping) =>
    set((s) => {
      const typingUserIds = new Set(s.typingUserIds);
      if (isTyping) typingUserIds.add(userId);
      else typingUserIds.delete(userId);
      return { typingUserIds };
    }),

  upsertMessage: (message) =>
    set((s) => ({
      messages: mergeMessage(s.messages, message),
      lastServerSeq: Math.max(s.lastServerSeq, message.serverSeq),
    })),

  startRun: (runId, messageId) =>
    set({ activeRun: { runId, messageId, buffer: "" } }),

  appendDelta: (runId, token) =>
    set((s) => {
      if (!s.activeRun || s.activeRun.runId !== runId) return s;
      return {
        activeRun: { ...s.activeRun, buffer: s.activeRun.buffer + token },
      };
    }),

  completeRun: (runId, message) =>
    set((s) => {
      if (s.activeRun?.runId !== runId) {
        return { messages: mergeMessage(s.messages, message) };
      }
      return {
        activeRun: null,
        messages: mergeMessage(s.messages, message),
        lastServerSeq: Math.max(s.lastServerSeq, message.serverSeq),
      };
    }),

  failRun: (runId) =>
    set((s) => (s.activeRun?.runId === runId ? { activeRun: null } : s)),

  addPendingOp: (op) =>
    set((s) => {
      const pendingOps = new Map(s.pendingOps);
      pendingOps.set(op.opId, op);
      return { pendingOps };
    }),

  applyCanvasOp: (applied) =>
    set((s) => {
      const pendingOps = new Map(s.pendingOps);
      pendingOps.delete(applied.opId); // reconcile our own optimistic op
      return {
        canvas: foldCanvas(s.canvas, applied),
        pendingOps,
        lastServerSeq: Math.max(s.lastServerSeq, applied.serverSeq),
      };
    }),

  applySyncDelta: (delta) =>
    set((s) => {
      let messages = s.messages;
      for (const m of delta.messages) messages = mergeMessage(messages, m);
      let canvas = s.canvas;
      for (const op of delta.canvasOps) canvas = foldCanvas(canvas, op);
      return {
        messages,
        canvas,
        presence: new Map(delta.presence.map((p) => [p.userId, p])),
        lastServerSeq: Math.max(s.lastServerSeq, delta.serverSeq),
        connection: "live",
      };
    }),
}));
