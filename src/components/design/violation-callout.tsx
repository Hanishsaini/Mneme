"use client";

import { useState } from "react";
import { AlertOctagon, ChevronDown } from "lucide-react";
import type { PolicyViolationSeverity } from "@workspace/shared";
import { Badge, severityBadgeVariant } from "./badge";
import { cn } from "@/lib/utils";

/**
 * Policy violation — an ERROR signal, kept visually separate from the
 * supersession callout. Left border is the severity color; the ground is
 * danger-subtle for critical/high, warning-subtle for medium, info-subtle
 * for low. Collapsed by default; clicking reveals the explanation.
 */

const SEV_COLOR: Record<PolicyViolationSeverity, string> = {
  CRITICAL: "var(--severity-critical)",
  HIGH: "var(--severity-high)",
  MEDIUM: "var(--severity-medium)",
  LOW: "var(--severity-low)",
};

const SEV_BG: Record<PolicyViolationSeverity, string> = {
  CRITICAL: "var(--color-danger-subtle)",
  HIGH: "var(--color-danger-subtle)",
  MEDIUM: "var(--color-warning-subtle)",
  LOW: "var(--color-info-subtle)",
};

export function ViolationCallout({
  severity,
  policyName,
  explanation,
  defaultExpanded = false,
  pulse = false,
  className,
}: {
  severity: PolicyViolationSeverity;
  policyName?: string;
  explanation?: string;
  defaultExpanded?: boolean;
  /** One-shot pulse when a violation arrives live. */
  pulse?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultExpanded);
  const expandable = Boolean(explanation);

  return (
    <div
      className={cn(
        "rounded-field border-l-2",
        pulse && "animate-pulse-once",
        className,
      )}
      style={{ borderColor: SEV_COLOR[severity], backgroundColor: SEV_BG[severity] }}
    >
      <button
        type="button"
        onClick={() => expandable && setOpen((o) => !o)}
        disabled={!expandable}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <AlertOctagon
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: SEV_COLOR[severity] }}
        />
        <span className="type-small flex flex-wrap items-center gap-1.5">
          <span style={{ color: SEV_COLOR[severity] }}>Policy violation</span>
          <span className="text-ink-tertiary">·</span>
          <Badge variant={severityBadgeVariant(severity)} size="sm">
            {severity}
          </Badge>
          {policyName && (
            <>
              <span className="text-ink-tertiary">·</span>
              <span className="text-ink-secondary">{policyName}</span>
            </>
          )}
        </span>
        {expandable && (
          <ChevronDown
            className={cn(
              "ml-auto h-3.5 w-3.5 shrink-0 text-ink-tertiary transition-transform duration-150",
              open && "rotate-180",
            )}
          />
        )}
      </button>
      {open && explanation && (
        <div className="px-3 pb-2.5 pl-[34px]">
          <p className="type-body text-ink-secondary">{explanation}</p>
        </div>
      )}
    </div>
  );
}
