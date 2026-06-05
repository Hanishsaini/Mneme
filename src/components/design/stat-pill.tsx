import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Number + label, used in run lists and run detail headers.
 * "6 decisions" · "2 violations" · "1 supersession". Group them with
 * <StatPillGroup> for the thin-divider treatment.
 */

export type StatTone = "neutral" | "danger" | "success" | "amber";

const TONE_COLOR: Record<StatTone, string> = {
  neutral: "var(--text-primary)",
  danger: "var(--color-danger)",
  success: "var(--color-success)",
  amber: "var(--accent-amber)",
};

export function StatPill({
  value,
  label,
  tone = "neutral",
  className,
}: {
  value: React.ReactNode;
  label: string;
  tone?: StatTone;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span
        className="type-subheading tabular-nums"
        style={{ color: TONE_COLOR[tone] }}
      >
        {value}
      </span>
      <span className="type-small text-ink-secondary">{label}</span>
    </div>
  );
}

export function StatPillGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const items = React.Children.toArray(children);
  return (
    <div className={cn("inline-flex items-center", className)}>
      {items.map((child, i) => (
        <div
          key={i}
          className={cn(i > 0 && "ml-3 border-l border-hairline-subtle pl-3")}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

/** Violation count semantics: danger when any exist, success when clean. */
export function violationTone(count: number): StatTone {
  return count > 0 ? "danger" : "success";
}
