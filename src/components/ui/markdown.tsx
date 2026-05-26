"use client";

import { isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";

/**
 * Renders message content as GitHub-flavored markdown with syntax-highlighted
 * code blocks via highlight.js, then dresses every fenced block with a
 * language tag + copy button via the CodeBlock wrapper.
 *
 * Safe for the live streaming bubble too — react-markdown handles partial
 * input gracefully, so an unclosed code fence mid-stream just renders as
 * raw text until the closing fence arrives.
 */
export function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn("text-sm leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-2 mt-4 text-lg font-semibold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-3 text-base font-semibold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-3 text-sm font-semibold">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-1 mt-2 text-sm font-semibold">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="my-2 whitespace-pre-wrap break-words">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-5 list-decimal space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-violet-500/40 pl-3 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          hr: () => <hr className="my-3 border-border" />,
          code({ className, children, ...props }) {
            // rehype-highlight stamps `language-xxx` on fenced-block <code>;
            // inline <code> arrives with no className. That's how we split.
            const isBlock =
              typeof className === "string" && className.startsWith("language-");
            if (isBlock) {
              return (
                <code className={cn("font-mono text-xs", className)} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => {
            // The fenced-block <code> is the direct child here. Read its
            // language + raw text so the CodeBlock header can show the tag
            // and the copy button can dump the un-highlighted source.
            const inner = Array.isArray(children) ? children[0] : children;
            let language = "";
            let raw = "";
            if (isValidElement(inner)) {
              const props = inner.props as {
                className?: string;
                children?: ReactNode;
              };
              const match = props.className?.match(/language-(\S+)/);
              if (match) language = match[1];
              raw = nodeToText(props.children);
            }
            return (
              <CodeBlock language={language} code={raw}>
                {children}
              </CodeBlock>
            );
          },
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-md border border-border/60">
              <table className="w-full border-collapse text-left text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/60">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border-b border-border px-2.5 py-1.5 font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border/40 px-2.5 py-1.5">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Recursively pulls text out of a React subtree for clipboard copy. */
function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement(node)) {
    return nodeToText((node.props as { children?: ReactNode }).children);
  }
  return "";
}
