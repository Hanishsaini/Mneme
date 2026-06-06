"use client";

import { create } from "zustand";
import type {
  ConversationDTO,
  MessageDTO,
  WorkspaceDTO,
  WorkspaceMemberDTO,
  WorkspaceSnapshot,
} from "@workspace/shared";

/**
 * The single client-side source of truth for a workspace session. It is the
 * MERGED view of two inputs:
 *   1. the server-rendered snapshot (hydration)
 *   2. AI stream events dispatched from the SSE consumer
 *
 * Components read selectors here and call actions; the SSE consumer in
 * `use-conversation` is the only writer of streaming deltas.
 */

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

  // ── ordering watermark ────────────────────────────────────────────────
  lastServerSeq: number;

  // ── conversation ──────────────────────────────────────────────────────
  messages: MessageDTO[];
  activeRun: ActiveRun | null;

  // ── actions: hydration ───────────────────────────────────────────────
  hydrate: (snapshot: WorkspaceSnapshot) => void;

  // ── actions: thread list ─────────────────────────────────────────────
  upsertConversation: (conversation: ConversationDTO) => void;
  removeConversation: (id: string) => void;
  /** Patch just the title of an existing conversation. Used by the
   *  post-first-turn auto-title pipeline; keeps the active-conversation
   *  reference in sync so the active row's title also updates. */
  renameConversation: (id: string, title: string) => void;

  // ── actions: membership ──────────────────────────────────────────────
  addWorkspaceMember: (member: WorkspaceMemberDTO) => void;

  // ── actions: conversation ────────────────────────────────────────────
  upsertMessage: (message: MessageDTO) => void;
  startRun: (runId: string, messageId: string) => void;
  appendDelta: (runId: string, token: string) => void;
  completeRun: (runId: string, message: MessageDTO) => void;
  failRun: (runId: string) => void;
}

/** Keep messages ordered by serverSeq and de-duplicated by id. */
function mergeMessage(list: MessageDTO[], incoming: MessageDTO): MessageDTO[] {
  const idx = list.findIndex((m) => m.id === incoming.id);
  const next = idx === -1 ? [...list, incoming] : list.map((m) => (m.id === incoming.id ? incoming : m));
  return next.sort((a, b) => a.serverSeq - b.serverSeq);
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  hydrated: false,
  workspace: null,
  conversations: [],
  conversation: null,
  lastServerSeq: 0,
  messages: [],
  activeRun: null,

  hydrate: (snapshot) =>
    set({
      hydrated: true,
      workspace: snapshot.workspace,
      conversations: snapshot.conversations,
      conversation: snapshot.conversation,
      messages: [...snapshot.messages].sort(
        (a, b) => a.serverSeq - b.serverSeq,
      ),
      lastServerSeq: snapshot.serverSeq,
    }),

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

  renameConversation: (id, title) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, title } : c,
      ),
      conversation:
        s.conversation?.id === id
          ? { ...s.conversation, title }
          : s.conversation,
    })),

  addWorkspaceMember: (member) =>
    set((s) => {
      if (!s.workspace) return s;
      // Idempotent — guards against a duplicate add.
      if (s.workspace.members.some((m) => m.userId === member.userId)) return s;
      return {
        workspace: {
          ...s.workspace,
          members: [...s.workspace.members, member],
        },
      };
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
}));
