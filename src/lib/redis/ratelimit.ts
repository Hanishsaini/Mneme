import { redisKeys } from "@workspace/shared";
import {
  AI_RATE_LIMIT_MAX,
  AI_RATE_LIMIT_WINDOW_SECONDS,
  DECISION_INGEST_RATE_LIMIT_MAX,
  DECISION_INGEST_RATE_LIMIT_WINDOW_SECONDS,
} from "@/config/constants";
import { redis } from "./client";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

/**
 * Fixed-window counter against `key`, allowing `max` hits per `windowSeconds`.
 * The first hit sets the TTL; the key self-expires so the window rolls. Simple
 * and good enough here; swap for a sliding window if burst smoothing matters.
 */
async function fixedWindow(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  const ttl = await redis.ttl(key);
  return {
    allowed: count <= max,
    remaining: Math.max(0, max - count),
    resetSeconds: ttl < 0 ? windowSeconds : ttl,
  };
}

/** Per-user AI chat throttle. */
export async function checkAiRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  return fixedWindow(
    redisKeys.rateLimit(userId),
    AI_RATE_LIMIT_MAX,
    AI_RATE_LIMIT_WINDOW_SECONDS,
  );
}

/**
 * Per-principal throttle for agent decision ingestion. `principalId` is the
 * API key id (for an unattended agent) or the member's user id. Each ingest
 * runs two LLM calls + an embedding, so this caps the cost/DoS blast radius
 * of a leaked or runaway key.
 */
export async function checkDecisionIngestRateLimit(
  principalId: string,
): Promise<RateLimitResult> {
  return fixedWindow(
    redisKeys.decisionIngestLimit(principalId),
    DECISION_INGEST_RATE_LIMIT_MAX,
    DECISION_INGEST_RATE_LIMIT_WINDOW_SECONDS,
  );
}
