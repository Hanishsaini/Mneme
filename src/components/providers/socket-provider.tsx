"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type { SyncDelta } from "@workspace/shared";
import { createSocket, type AppClientSocket } from "@/lib/realtime/socket-client";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { PRESENCE_HEARTBEAT_MS } from "@/config/constants";

/**
 * The realtime boundary. Owns the single socket connection for a workspace
 * session and is the ONLY writer of realtime deltas into the store. It:
 *   - supplies a token-minting callback so every (re)connect authenticates
 *     with a fresh, short-lived token
 *   - maps every ServerToClientEvent onto a store action
 *   - heartbeats presence on an interval
 *   - on reconnect, pulls /sync?since=lastServerSeq to close any gap
 *
 * Components consume `useSocket()` for the typed emit surface — they never
 * import the socket directly.
 */

interface SocketContextValue {
  socket: AppClientSocket | null;
}

const SocketContext = createContext<SocketContextValue>({ socket: null });

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const socketRef = useRef<AppClientSocket | null>(null);
  const [socket, setSocket] = useState<AppClientSocket | null>(null);

  useEffect(() => {
    /**
     * Mints a realtime token for this workspace. Called by socket.io before
     * every connection attempt (initial + every reconnect), so an expired
     * token never permanently breaks the session.
     */
    async function fetchToken(): Promise<string> {
      const res = await fetch("/api/realtime/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) throw new Error(`realtime token fetch failed: ${res.status}`);
      const { token } = (await res.json()) as { token: string };
      return token;
    }

    const s = createSocket(fetchToken);
    socketRef.current = s;
    wireEvents(s, workspaceId);

    // Heartbeat keeps the Redis presence entry warm while connected.
    const heartbeat = setInterval(() => {
      if (s.connected) s.emit("presence:heartbeat");
    }, PRESENCE_HEARTBEAT_MS);

    s.connect();
    setSocket(s);

    return () => {
      clearInterval(heartbeat);
      s.removeAllListeners();
      s.io.removeAllListeners();
      s.disconnect();
      socketRef.current = null;
    };
  }, [workspaceId]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
}

/** Wires the socket's incoming events to store actions. */
function wireEvents(s: AppClientSocket, workspaceId: string) {
  const store = useWorkspaceStore.getState;

  // ── connection lifecycle ───────────────────────────────────────────────
  s.on("connect", () => {
    store().setConnection("live");
    s.emit("presence:join", { workspaceId });
  });

  s.io.on("reconnect_attempt", () => store().setConnection("reconnecting"));

  s.on("connect_error", (err) => {
    console.error("[socket] connect_error:", err.message);
    store().setConnection("reconnecting");
  });

  s.on("disconnect", (reason) => {
    store().setConnection(
      reason === "io client disconnect" ? "offline" : "reconnecting",
    );
  });

  // After a reconnect, close any gap via the catch-up endpoint.
  s.io.on("reconnect", () => {
    void resync(workspaceId);
  });

  // ── presence ───────────────────────────────────────────────────────────
  s.on("presence:state", ({ users }) => store().setPresenceState(users));
  s.on("presence:update", ({ user }) => store().upsertPresence(user));
  s.on("presence:leave", ({ userId }) => store().removePresence(userId));
  s.on("presence:cursor", ({ userId, x, y }) =>
    store().setCursor(userId, { x, y }),
  );
  s.on("chat:typing", ({ userId, isTyping }) =>
    store().setTyping(userId, isTyping),
  );

  // ── conversation / AI ──────────────────────────────────────────────────
  s.on("chat:message:created", ({ message }) =>
    store().upsertMessage(message),
  );
  s.on("ai:run:started", ({ runId, messageId }) =>
    store().startRun(runId, messageId),
  );
  s.on("ai:run:delta", ({ runId, token }) =>
    store().appendDelta(runId, token),
  );
  s.on("ai:run:completed", ({ runId, message }) =>
    store().completeRun(runId, message),
  );
  s.on("ai:run:error", ({ runId, error }) => {
    store().failRun(runId);
    toast.error(error);
  });

  // ── canvas ─────────────────────────────────────────────────────────────
  s.on("canvas:op:applied", (applied) => store().applyCanvasOp(applied));

  // ── membership ─────────────────────────────────────────────────────────
  // Fired by the invite-accept service after a new WorkspaceMember row is
  // written. Keeps the members list in lockstep with reality for everyone
  // already in the workspace — presence:update arrives separately when the
  // new user's socket connects.
  s.on("workspace:member:added", ({ member }) => {
    store().addWorkspaceMember(member);
    toast.success(`${member.user.name ?? "Someone"} joined the workspace`);
  });

  // ── system ─────────────────────────────────────────────────────────────
  s.on("system:error", ({ message }) => toast.error(message));
}

/** Pull every event missed while disconnected, then resume live. */
async function resync(workspaceId: string) {
  const state = useWorkspaceStore.getState();
  const since = state.lastServerSeq;
  // Scope the delta to the thread the user is actually rendering. Without
  // this, a reconnect on thread B could merge in messages from thread A
  // (the "primary" by createdAt) and pollute the list.
  const conversationId = state.conversation?.id;
  const params = new URLSearchParams({ since: String(since) });
  if (conversationId) params.set("conversation", conversationId);
  try {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/sync?${params.toString()}`,
    );
    if (!res.ok) return;
    const delta = (await res.json()) as SyncDelta;
    useWorkspaceStore.getState().applySyncDelta(delta);
  } catch (err) {
    console.error("[socket] resync failed:", err);
  }
}
