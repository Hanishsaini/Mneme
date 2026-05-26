import { isCommonPassword, passwordContainsEmail } from "@/lib/auth/common-passwords";

/**
 * Client-friendly password strength scorer used by the registration UI.
 *
 * NOT a substitute for the server-side validator — `validatePasswordStrength`
 * in lib/auth/password.ts is authoritative and rejects the same dictionary
 * picks no matter what the meter says. This file's job is to give the user
 * fast visual feedback as they type.
 *
 * The scoring is a deliberately simple heuristic. zxcvbn is the gold
 * standard but it's a 400KB dep; the difference between zxcvbn's score
 * and ours is hand-wavy enough at the UI level that the trade isn't worth
 * it. If we ever need real entropy estimation, swap zxcvbn-ts in here.
 */

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export const STRENGTH_LABELS: Record<StrengthScore, string> = {
  0: "Very weak",
  1: "Weak",
  2: "Fair",
  3: "Strong",
  4: "Excellent",
};

/** Tailwind color class per score — feeds the meter bar fill + label. */
export const STRENGTH_COLOR: Record<StrengthScore, string> = {
  0: "bg-red-500",
  1: "bg-orange-500",
  2: "bg-amber-500",
  3: "bg-emerald-500",
  4: "bg-emerald-400",
};

export const STRENGTH_TEXT_COLOR: Record<StrengthScore, string> = {
  0: "text-red-400",
  1: "text-orange-400",
  2: "text-amber-400",
  3: "text-emerald-400",
  4: "text-emerald-300",
};

export interface StrengthResult {
  score: StrengthScore;
  label: string;
  /** Human-readable hint for moving up a level. Empty string at score 4. */
  hint: string;
  /** Hard fail — registration won't go through even if the user clicks. */
  blocked: boolean;
}

const MIN_LENGTH = 12;

export function scorePassword(password: string, email?: string): StrengthResult {
  if (!password) {
    return { score: 0, label: "Very weak", hint: "", blocked: true };
  }

  if (isCommonPassword(password)) {
    return {
      score: 0,
      label: "Breached",
      hint: "That exact password is in every leaked-credential dictionary.",
      blocked: true,
    };
  }
  if (email && passwordContainsEmail(password, email)) {
    return {
      score: 0,
      label: "Too predictable",
      hint: "Don't use your email address in the password.",
      blocked: true,
    };
  }

  const len = password.length;
  if (len < MIN_LENGTH) {
    return {
      score: 0,
      label: "Too short",
      hint: `At least ${MIN_LENGTH} characters required.`,
      blocked: true,
    };
  }

  // Variety: characters classes the password actually uses.
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^\w\s]/.test(password);
  const classes =
    Number(hasLower) + Number(hasUpper) + Number(hasDigit) + Number(hasSymbol);

  // Penalty for trivial repetition / sequential runs. A password of all
  // one character (12+ "a"s) reads as long but is single-class.
  const repetitive = /^(.)\1+$/.test(password);
  const sequentialRun =
    /(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|wert|erty|asdf|zxcv)/i.test(
      password,
    );

  // Compose the score. Tuned so 12+ chars with two classes → "Strong",
  // a passphrase (16+ chars with two classes) → "Excellent".
  let score: StrengthScore = 2; // baseline once minimum length is met
  if (len >= 16) score = (score + 1) as StrengthScore;
  if (classes >= 3) score = (score + 1) as StrengthScore;
  if (len >= 20 && classes >= 2) score = 4;
  if (repetitive || sequentialRun) score = 1;

  // Clamp.
  if (score > 4) score = 4;
  if (score < 0) score = 0;

  const label = STRENGTH_LABELS[score];
  let hint = "";
  if (score < 4) {
    if (repetitive) hint = "Avoid one-character passwords.";
    else if (sequentialRun) hint = "Avoid sequential runs like 1234 / qwerty.";
    else if (len < 16) hint = "Longer passphrases (16+ chars) are much stronger.";
    else if (classes < 3)
      hint = "Mix in another character type for extra strength.";
  }

  return { score, label, hint, blocked: false };
}
