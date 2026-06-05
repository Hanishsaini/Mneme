"use client";

import { useState } from "react";
import { ChevronDown, Terminal } from "lucide-react";
import type { PolicyViolationSeverity } from "@workspace/shared";
import { Badge } from "./badge";
import { HashDisplay } from "./hash-display";
import { SupersessionCallout } from "./supersession-callout";
import { ViolationCallout } from "./violation-callout";
import { cn, timeAgo } from "@/lib/utils";

/**
 * The atom of the entire product. Get this right everywhere.
 *
 * Left accent bar encodes state at a glance: subtle (normal), amber
 * (superseded), danger (violated), or a split amber/red gradient (both).
 * Collapsed it shows type + content (2-line clamp) + hash + indicator dots;
 * expanded it reveals the tool context and the supersession / violation
 * callouts via a smooth max-height transition (grid-rows, never a jump).
 */

export interface DecisionCardViolation {
  id: string;
  severity: PolicyViolationSeverity;
  policyName?: string;
  explanation?: string;
}

export interface DecisionCardProps {
  decisionType: string;
  content: string;
  timestamp: string;
  hash: string;
  toolCalled?: string | null;
  toolOutput?: Record<string, unknown> | null;
  superseded?: boolean;
  supersededAtIso?: string | null;
  onNavigateToOriginal?: () => void;
  violations?: DecisionCardViolation[];
  defaultExpanded?: boolean;
  /** Slide the supersession callout in (live feed only). */
  animateSupersession?: boolean;
  className?: string;
}

export function DecisionCard({
  decisionType,
  content,
  timestamp,
  hash,
  toolCalled,
  toolOutput,
  superseded = false,
  supersededAtIso,
  onNavigateToOriginal,
  violations = [],
  defaultExpanded = false,
  animateSupersession = false,
  className,
}: DecisionCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const violated = violations.length > 0;
  const both = superseded && violated;
  const hasToolContext =
    Boolean(toolCalled) ||
    (toolOutput != null && Object.keys(toolOutput).length > 0);
  const hasDetail = hasToolContext || superseded || violated;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-card border border-hairline-subtle bg-surface shadow-elev1",
        className,
      )}
    >
      {/* Left accent bar — state encoded in color. */}
      <span
        className={cn("absolute inset-y-0 left-0 w-0.5", both && "accent-split")}
        style={
          both
            ? undefined
            : {
                backgroundColor: superseded
                  ? "var(--accent-amber)"
                  : violated
                    ? "var(--color-danger)"
                    : "var(--border-subtle)",
              }
        }
      />

      <div className="py-3 pl-4 pr-3">
        {/* Top row */}
        <div className="flex items-center justify-between gap-3">
          <Badge variant="neutral" size="sm" appearance="solid">
            {decisionType}
          </Badge>
          <span className="type-small shrink-0 text-ink-tertiary">
            {timeAgo(timestamp)}
          </span>
        </div>

        {/* Content */}
        <button
          type="button"
          onClick={() => hasDetail && setExpanded((x) => !x)}
          disabled={!hasDetail}
          className="mt-2 flex w-full items-start gap-2 text-left"
        >
          <p
            className={cn(
              "type-body flex-1 text-ink",
              !expanded && "line-clamp-2",
            )}
          >
            {content}
          </p>
          {hasDetail && (
            <ChevronDown
              className={cn(
                "mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-tertiary transition-transform duration-150",
                expanded && "rotate-180",
              )}
            />
          )}
        </button>

        {/* Detail — smooth max-height transition, never a jump. */}
        <div
          className={cn(
            "grid transition-all duration-150 ease-out",
            expanded ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="space-y-2">
              {hasToolContext && (
                <div className="space-y-1.5">
                  {toolCalled && (
                    <span className="inline-flex items-center gap-1.5 rounded-field bg-surface-overlay px-2 py-1 font-mono text-[11px] text-ink-secondary">
                      <Terminal className="h-3 w-3" />
                      {toolCalled}
                    </span>
                  )}
                  {toolOutput != null &&
                    Object.keys(toolOutput).length > 0 && (
                      <pre className="overflow-x-auto rounded-field border border-hairline-subtle bg-surface-base p-2.5 font-mono text-[11px] leading-relaxed text-ink-secondary scrollbar-thin">
                        {JSON.stringify(toolOutput, null, 2)}
                      </pre>
                    )}
                </div>
              )}

              {superseded && supersededAtIso && (
                <SupersessionCallout
                  revisedAtIso={supersededAtIso}
                  onNavigate={onNavigateToOriginal}
                  animate={animateSupersession}
                />
              )}

              {violations.map((v) => (
                <ViolationCallout
                  key={v.id}
                  severity={v.severity}
                  policyName={v.policyName}
                  explanation={v.explanation}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Bottom row — hash + at-a-glance state dots. */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <HashDisplay value={hash} label="hash" />
          <div className="flex items-center gap-2">
            {superseded && (
              <span
                title="Revises a prior decision"
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "var(--accent-amber)" }}
              />
            )}
            {violated && (
              <span
                title="Policy violation"
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "var(--color-danger)" }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
