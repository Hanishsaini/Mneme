import { redis } from "./client";

/**
 * Per-run abort signaling via Redis.
 *
 * The orchestrator polls this flag between token yields. We can't cancel the
 * in-flight upstream HTTP request to the model provider from a different
 * lambda, so a Redis flag is the simplest cross-instance signal:
 *
 *   - POST /api/ai/runs/[runId]/stop  → setRunAborted(runId)
 *   - orchestrator streamAndPersist loop → reads isRunAborted(runId) every
 *     ~250ms and breaks; the finally block then persists whatever the
 *     StreamBuffer captured so far (interrupt-safe by design).
 *
 * TTL is generous; the orchestrator's `finally` clears the key explicitly so
 * stale signals don't linger.
 */
const KEY = (runId: string) => `ai:run:${runId}:abort`;
const TTL_SECONDS = 600;

export async function setRunAborted(runId: string): Promise<void> {
  await redis.set(KEY(runId), "1", "EX", TTL_SECONDS);
}

export async function isRunAborted(runId: string): Promise<boolean> {
  const v = await redis.get(KEY(runId));
  return v === "1";
}

export async function clearRunAbort(runId: string): Promise<void> {
  await redis.del(KEY(runId));
}
