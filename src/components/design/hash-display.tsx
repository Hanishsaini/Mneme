"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Monospace hash / id / key-prefix display. Shows `first8…last4`, copies the
 * FULL value on click (checkmark confirms for 1.5s), and reveals the full
 * value in a tooltip on hover. The green --hash-color reads as "machine
 * truth" — it's what makes the product feel tamper-evident without a word
 * of explanation.
 */
export function HashDisplay({
  value,
  label,
  className,
}: {
  value: string;
  /** Optional micro label rendered before the hash, e.g. "hash" / "key". */
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const display =
    value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // insecure context / old browser — icon just won't tick
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy full value"}
          className={cn(
            "group/hash inline-flex items-center gap-1.5 font-mono text-[13px] leading-none transition-opacity",
            className,
          )}
          style={{ color: "var(--hash-color)" }}
        >
          {label && (
            <span className="type-micro text-ink-tertiary">{label}</span>
          )}
          <span>{display}</span>
          {copied ? (
            <Check className="h-3 w-3 shrink-0" />
          ) : (
            <Copy className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/hash:opacity-60" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent className="border border-hairline bg-surface-overlay text-ink">
        <span className="font-mono text-[11px]">{value}</span>
      </TooltipContent>
    </Tooltip>
  );
}
