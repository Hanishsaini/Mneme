"use client";

import { GitBranch } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

/**
 * The amber "this revises X" signal. A decision EVOLUTION marker, never an
 * error — so the language is strictly "revises" / "from [time]", the icon is
 * a branching arrow (not a warning glyph), and nothing here says "warning"
 * or "alert". Clicking navigates to the superseded decision.
 *
 * Pass `animate` only when the callout appears for the first time in a live
 * feed (it slides in from the top). On initial page load, leave it off —
 * a wall of animating callouts is noise.
 */
export function SupersessionCallout({
  revisedAtIso,
  onNavigate,
  animate = false,
  className,
}: {
  revisedAtIso: string;
  onNavigate?: () => void;
  animate?: boolean;
  className?: string;
}) {
  const interactive = Boolean(onNavigate);
  return (
    <button
      type="button"
      onClick={onNavigate}
      disabled={!interactive}
      className={cn(
        "flex w-full items-center gap-2 rounded-field border-l-2 px-3 py-2 text-left transition-colors",
        animate && "animate-slide-in-top",
        interactive ? "cursor-pointer hover:brightness-125" : "cursor-default",
        className,
      )}
      style={{
        borderColor: "var(--accent-amber)",
        backgroundColor: "var(--accent-amber-subtle)",
      }}
    >
      <GitBranch
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: "var(--accent-amber)" }}
      />
      <span className="type-small" style={{ color: "var(--accent-amber)" }}>
        Revises decision from {timeAgo(revisedAtIso)}
      </span>
    </button>
  );
}
