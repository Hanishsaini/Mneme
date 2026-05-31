/**
 * Realtime publish — NEUTRALIZED.
 *
 * The socket-server pivot retired the cross-process fan-out path. SSE
 * streams tokens to the browser directly from the request handler, so
 * there's no second consumer reading these Redis channels in production.
 *
 * The legacy `runAiTurn` path in ai-orchestrator.ts and the workspace
 * member-added broadcast in invite.service.ts still call these — they're
 * dead code that hasn't been excised yet. Rather than risk regressions
 * ripping the callsites in the same commit as the security pass, the
 * functions are kept as no-ops with the original signatures. A future
 * sweep can delete the callsites cleanly, then delete this file.
 */

export async function publishToWorkspace<E extends string>(
  _workspaceId: string,
  _event: E,
  _payload: unknown,
): Promise<void> {
  /* no-op */
}

export async function publishAiDelta(
  _workspaceId: string,
  _runId: string,
  _token: string,
): Promise<void> {
  /* no-op */
}
