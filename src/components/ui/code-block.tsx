"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Code block with a header bar carrying the detected language tag and a
 * copy-to-clipboard button. Wraps the highlighted `<code>` element that
 * `rehype-highlight` already injected — we don't re-tokenize, we just
 * decorate.
 *
 * The header collapses when no language is known (raw fences without a
 * tag) so we don't show a blank pill — keeps the visual rhythm clean.
 */
export function CodeBlock({
  language,
  code,
  children,
}: {
  language: string;
  code: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Older browsers / insecure context — copy silently fails. Don't
      // toast: the user will notice the icon didn't tick and try again.
    }
  }

  return (
    <div className="group/code my-3 overflow-hidden rounded-lg border border-border/60 bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-border/40 bg-card/30 px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors",
            copied
              ? "text-emerald-400"
              : "text-muted-foreground opacity-0 hover:bg-secondary/40 hover:text-foreground group-hover/code:opacity-100",
          )}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed scrollbar-thin">
        {children}
      </pre>
    </div>
  );
}
