import "server-only";
import bcrypt from "bcryptjs";

/**
 * Password hashing — bcrypt with cost factor 12.
 *
 * Why bcrypt over argon2: pure JS, no native build pain on Vercel, has
 * existed for 25 years, every audit tool understands it. Cost 12 takes
 * ~250ms on a modern CPU — invisible to users, expensive enough that
 * GPU brute-forcing a stolen hash dump is genuinely hard.
 *
 * If the threat model ever justifies switching to argon2id, this module
 * is the only place that needs to change.
 */

const COST = 12;

export const PASSWORD_MIN_LENGTH = 12;

/**
 * NIST 2017 / SP 800-63B guidance: length beats complexity. We require 12
 * characters and accept anything from there. No mandatory mixed-case /
 * symbol / digit rules — those just push users toward predictable
 * substitutions ("Password1!"). Long passphrases are stronger.
 */
export function validatePasswordStrength(plain: string): string | null {
  if (plain.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (plain.length > 256) {
    return "Password is too long.";
  }
  return null;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
