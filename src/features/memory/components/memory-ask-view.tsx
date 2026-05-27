"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { MemoryAskResponseDTO, MemoryAskSourceDTO } from "@workspace/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Ask your team's memory" surface. A single search box at the top, an
 * AI-synthesized answer with inline [N] citation markers, then a list of
 * the sources those markers reference (clickable to jump to the source
 * thread).
 *
 * This is the surface that makes the landing-page pitch real. Without
 * it the workspace embeds messages and the prompt composer hints at
 * related ones, but the user never gets to *ask* anything.
 */
export function MemoryAskView({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<MemoryAskResponseDTO | null>(null);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/memory/ask`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: trimmed }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Could not search memory");
      }
      const data = (await res.json()) as MemoryAskResponseDTO;
      setResult(data);
      setLastQuery(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search memory");
    } finally {
      setPending(false);
    }
  }

  function openSource(source: MemoryAskSourceDTO) {
    onClose();
    router.push(`/w/${workspaceId}?thread=${source.conversationId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={ask} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Ask your team's memory… (e.g. what did we decide about auth?)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={pending}
            autoFocus
            className="h-10 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
        </div>
        <Button type="submit" disabled={pending || !query.trim()} className="gap-1.5">
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {pending ? "Searching…" : "Ask"}
        </Button>
      </form>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!result && !error && (
        <EmptyPrompt
          onPick={(q) => {
            setQuery(q);
          }}
        />
      )}

      {result && lastQuery && (
        <div className="space-y-4">
          <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-4 py-3">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-violet-300">
              Question
            </p>
            <p className="text-sm">{lastQuery}</p>
          </div>

          <div className="rounded-lg border bg-card/40 px-4 py-3">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3 w-3 text-violet-400" />
              Answer
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {renderWithCitations(result.answer, result.sources, openSource)}
            </p>
          </div>

          {result.sources.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Sources
              </p>
              <ul className="flex flex-col gap-2">
                {result.sources.map((s) => (
                  <li key={s.messageId}>
                    <button
                      type="button"
                      onClick={() => openSource(s)}
                      className="group flex w-full items-start gap-2 rounded-lg border bg-card/30 px-3 py-2 text-left transition-colors hover:border-violet-500/30 hover:bg-card"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[10px] font-semibold text-violet-300">
                        {s.index}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium text-muted-foreground group-hover:text-foreground">
                            {s.conversationTitle}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-1.5 text-[9px] font-semibold uppercase tracking-wider",
                              s.similarity > 0.65
                                ? "bg-violet-500/15 text-violet-300"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {Math.round(s.similarity * 100)}%
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-foreground/80">
                          {s.snippet}
                        </p>
                      </div>
                      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Walks the answer string and replaces `[N]` markers with clickable
 * superscripts that jump to the matching source thread. Plain-text
 * segments are returned unchanged so paragraph wrapping behaves.
 */
function renderWithCitations(
  answer: string,
  sources: MemoryAskSourceDTO[],
  onPick: (s: MemoryAskSourceDTO) => void,
): ReactNode[] {
  const out: ReactNode[] = [];
  // Match runs of `[1]`, `[2][3]`, etc. We split greedily on consecutive
  // citation markers so a chain like `[1][3]` renders as two pills.
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(answer)) !== null) {
    if (match.index > lastIndex) {
      out.push(answer.slice(lastIndex, match.index));
    }
    const idx = Number(match[1]);
    const source = sources.find((s) => s.index === idx);
    if (source) {
      out.push(
        <button
          key={`cite-${key++}`}
          type="button"
          onClick={() => onPick(source)}
          className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-500/20 px-1 align-baseline text-[10px] font-semibold text-violet-300 transition-colors hover:bg-violet-500/30 hover:text-violet-200"
          title={source.conversationTitle}
        >
          {idx}
        </button>,
      );
    } else {
      // Model cited a number we don't have a source for — render the
      // marker as plain text rather than silently dropping it.
      out.push(match[0]);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < answer.length) {
    out.push(answer.slice(lastIndex));
  }
  return out;
}

function EmptyPrompt({ onPick }: { onPick: (q: string) => void }) {
  const examples = [
    "What did we decide about authentication?",
    "What's still open from last week?",
    "Why did we pick Postgres?",
  ];
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <Sparkles className="h-7 w-7 text-violet-400/60" />
      <div>
        <p className="text-sm font-medium">
          Ask anything your team has discussed.
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          Mneme searches every past conversation in this workspace and
          synthesizes an answer with citations.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5 pt-1">
        {examples.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="rounded-full border border-border/60 bg-card/30 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-violet-500/40 hover:bg-card/60 hover:text-foreground"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
