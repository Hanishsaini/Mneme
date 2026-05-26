import { redis } from "./client";

/**
 * Per-email login rate limit + lockout.
 *
 * Two tunables that together define the security/UX tradeoff:
 *   - MAX_ATTEMPTS (8): how many failures inside the counting window are
 *     tolerated before the account is locked. Generous enough to absorb
 *     legitimate typo runs (passwords with 12+ chars get mistyped often);
 *     tight enough that credential-stuffing at sustained rates gets
 *     shut down inside seconds.
 *   - LOCKOUT_SECONDS (30 min): how long the email stays locked once the
 *     8th failure trips the limit. We EXTEND the key TTL at trip time so
 *     the lockout window is fixed regardless of when in the original
 *     counting window the trip happened — otherwise an attacker times
 *     the 8th attempt at the end of the window and gets only a few
 *     seconds of "lockout".
 *
 * The client UI is deliberately NOT told whether a given rejection was
 * "wrong password" vs "locked out" — that's an enumeration leak. Both
 * surface as "Invalid email or password." The user has to wait it out.
 *
 * Successful login calls `clearLoginAttempts(email)` so an old run-up of
 * misses doesn't haunt the user hours later.
 */

const WINDOW_SECONDS = 15 * 60;
const LOCKOUT_SECONDS = 30 * 60;
const MAX_ATTEMPTS = 8;

const key = (email: string) => `login:attempts:${email.toLowerCase()}`;

export interface LoginRateLimitResult {
  allowed: boolean;
  /** Attempts remaining in the current window. Zero once locked. */
  remaining: number;
  /** Seconds until the bucket clears. Useful for client display IF we
   *  ever decide to surface lockouts (we currently don't — see header). */
  resetSeconds: number;
}

export async function recordLoginAttempt(
  email: string,
): Promise<LoginRateLimitResult> {
  const k = key(email);
  const count = await redis.incr(k);
  if (count === 1) {
    await redis.expire(k, WINDOW_SECONDS);
  } else if (count === MAX_ATTEMPTS + 1) {
    // Lockout trip — extend the TTL to the full lockout duration so the
    // user can't game timing by burning attempts late in the window.
    await redis.expire(k, LOCKOUT_SECONDS);
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
