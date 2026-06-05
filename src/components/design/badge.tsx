import * as React from "react";
import type { PolicyViolationSeverity } from "@workspace/shared";
import { cn } from "@/lib/utils";

/**
 * Design-system Badge. Micro type scale, one of two shapes:
 *   - `dot`   a 6px colored circle + label on a transparent ground
 *   - `solid` label on a filled subtle ground
 *
 * Severity variants map 1:1 to PolicyViolation.severity and should be used
 * ONLY for that field — everything else uses the semantic variants.
 */

export type BadgeVariant =
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "neutral"
  | "severity-critical"
  | "severity-high"
  | "severity-medium"
  | "severity-low";

const COLOR: Record<BadgeVariant, { fg: string; bg: string }> = {
  success: { fg: "var(--color-success)", bg: "var(--color-success-subtle)" },
  danger: { fg: "var(--color-danger)", bg: "var(--color-danger-subtle)" },
  warning: { fg: "var(--color-warning)", bg: "var(--color-warning-subtle)" },
  info: { fg: "var(--color-info)", bg: "var(--color-info-subtle)" },
  neutral: { fg: "var(--text-secondary)", bg: "var(--bg-overlay)" },
  "severity-critical": { fg: "var(--severity-critical)", bg: "var(--color-danger-subtle)" },
  "severity-high": { fg: "var(--severity-high)", bg: "rgba(249,115,22,0.12)" },
  "severity-medium": { fg: "var(--severity-medium)", bg: "var(--color-warning-subtle)" },
  "severity-low": { fg: "var(--severity-low)", bg: "var(--color-info-subtle)" },
};

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: "sm" | "md";
  /** Shape. Named `appearance` to avoid clashing with the DOM `style` attr. */
  appearance?: "dot" | "solid";
  className?: string;
  children: React.ReactNode;
}

export function Badge({
  variant = "neutral",
  size = "md",
  appearance = "solid",
  className,
  children,
}: BadgeProps) {
  const c = COLOR[variant];
  const isDot = appearance === "dot";
  return (
    <span
      className={cn(
        "type-micro inline-flex items-center gap-1.5 rounded-pill whitespace-nowrap leading-none",
        size === "sm" ? "px-1.5 py-1" : "px-2 py-1",
        className,
      )}
      style={{ color: c.fg, backgroundColor: isDot ? "transparent" : c.bg }}
    >
      {isDot && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: c.fg }}
        />
      )}
      {children}
    </span>
  );
}

/** Map a PolicyViolation.severity to its Badge variant. */
export function severityBadgeVariant(
  severity: PolicyViolationSeverity,
): BadgeVariant {
  return `severity-${severity.toLowerCase()}` as BadgeVariant;
}
