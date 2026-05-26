"use client";

import { cn } from "@/lib/utils";
import {
  scorePassword,
  STRENGTH_COLOR,
  STRENGTH_TEXT_COLOR,
} from "../lib/password-strength";

/**
 * Four-segment bar + a label + a single hint. Renders nothing until the
 * user has typed something, so an empty new form doesn't look noisy.
 */
export function PasswordStrengthMeter({
  password,
  email,
}: {
  password: string;
  email?: string;
}) {
  if (!password) return null;

  const { score, label, hint } = scorePassword(password, email);
  // Score 0 fills the first bar; score 4 fills all four.
  const filled = Math.max(1, Math.min(4, score === 0 ? 1 : score));

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < filled ? STRENGTH_COLOR[score] : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="flex items-center justify-between gap-2 text-[10px]">
        <span className={cn("font-medium", STRENGTH_TEXT_COLOR[score])}>
          {label}
        </span>
        {hint && (
          <span className="truncate text-right text-muted-foreground">
            {hint}
          </span>
        )}
      </p>
    </div>
  );
}
