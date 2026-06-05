"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Static code block for the SDK quickstart + API-key display. Language label
 * top-left, copy button top-right, monospace body on an elevated ground.
 * Plain class-based — no syntax-highlighting dependency.
 */
export function CodeBlock({
  code,
  language = "text",
  className,
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // insecure context — icon just won't tick
    }
  }

  return (
    <div
      className={cn(
        "group/code overflow-hidden rounded-card border border-hairline-subtle bg-surface-overlay",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-hairline-subtle px-3 py-1.5">
        <span className="type-micro text-ink-tertiary">{language}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy code"}
          className={cn(
            "inline-flex items-center gap-1 rounded-field px-1.5 py-0.5 type-micro transition-colors",
            copied
              ? "text-success"
              : "text-ink-tertiary opacity-0 hover:bg-surface-subtle hover:text-ink group-hover/code:opacity-100",
          )}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 scrollbar-thin">
        <code className="font-mono text-[13px] leading-relaxed text-ink">
          {code}
        </code>
      </pre>
    </div>
  );
}
