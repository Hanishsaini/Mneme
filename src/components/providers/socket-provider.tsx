"use client";

import { type ReactNode, useEffect } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";

/**
 * Single-process mode — chat now streams over SSE directly from
 * /api/ai/stream, so the workspace no longer needs a long-lived socket
 * connection for the user-facing surface. The provider is kept as a
 * no-op boundary (rather than removed wholesale) so that:
 *
 *   - the workspace shell doesn't need a structural rewrite
 *   - a future re-introduction of multi-user / canvas-collab live ops
 *     plugs back in here without touching consumers
 *
 * For now it just stamps the connection status as "live" so the header
 * badge never lies, and skips presence / cursor / typing transports
 * (those were the multi-user features that needed a real socket).
 */
export function SocketProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  useEffect(() => {
    useWorkspaceStore.getState().setConnection("live");
  }, [workspaceId]);

  return <>{children}</>;
}

/** Compat shim — the old hook returned `{ socket: AppClientSocket | null }`.
 *  A couple of callers still import it; they now get an object with an
 *  always-null socket. The type widening to `unknown` is deliberate so
 *  existing `socket?.emit(...)` call sites keep type-checking without us
 *  shipping a full mock interface. */
interface CompatSocket {
  socket: { emit: (...args: unknown[]) => void } | null;
}

export function useSocket(): CompatSocket {
  return { socket: null };
}
