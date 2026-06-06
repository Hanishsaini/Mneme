import { redisKeys } from "@workspace/shared";
import { redis } from "./client";

/**
 * Monotonic per-conversation sequence numbers. `serverSeq` is the ordering
 * authority for message history, letting clients order and de-dup messages.
 * Redis INCR is atomic across instances.
 *
 * On cold start (Redis flushed) we reseed from the DB max — see callers.
 */

export async function nextMessageSeq(conversationId: string): Promise<number> {
  return redis.incr(redisKeys.messageSeq(conversationId));
}

/** Seed a counter to `value` only if it does not yet exist. */
export async function seedSeq(key: string, value: number): Promise<void> {
  await redis.set(key, value, "NX");
}
