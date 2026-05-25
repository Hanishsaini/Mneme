import { redis } from "./client";

/**
 * Per-email login rate limit. Fixed window — 5 attempts per 15 minutes.
 * After the 5th failure inside the window every subsequent attempt is
 * rejected until the window expires (so worst-case lockout is ~15 min for
 * legitimate users who fat-fingered their password 5 times in a row).
 *
 * Email is normalized to lower-case before keying; the same address
 * regardless of capitalization shares the bucket.
 *
 * Successful login should call `clearLoginAttempts(email)` so a user
 * doesn't get locked out a few hours later for an old run-up of misses.
 */

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 5;

const key = (email: string) => `login:attempts:${email.toLowerCase()}`;

export interface LoginRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

export async function recordLoginAttempt(
  email: string,
): Promise<LoginRateLimitResult> {
  const k = key(email);
  const count = await redis.incr(k);
  if (count === 1) {
    await redis.expire(k, WINDOW_SECONDS);
  }
  const ttl = await redis.ttl(k);
  return {
    allowed: count <= MAX_ATTEMPTS,
    remaining: Math.max(0, MAX_ATTEMPTS - count),
    resetSeconds: ttl < 0 ? WINDOW_SECONDS : ttl,
  };
}

export async function clearLoginAttempts(email: string): Promise<void> {
  await redis.del(key(email));
}
