import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Every empty list has a reason and a next step — never a blank div.
 * Outlined 24px icon + heading + body + optional CTA. No animation:
 * static is faster to read.
 */
export function EmptyState({
  icon: Icon,
  heading,
  body,
  action,
  className,
}: {
  icon: LucideIcon;
  heading: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-16 text-center",
        className,
      )}
    >
      <Icon className="h-6 w-6 text-ink-tertiary" strokeWidth={1.5} />
      <div className="space-y-1">
        <p className="type-subheading text-ink">{heading}</p>
        <p className="type-body mx-auto max-w-sm text-ink-secondary">{body}</p>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
