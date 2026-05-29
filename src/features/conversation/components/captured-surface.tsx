"use client";

import { useEffect, useState } from "react";
import { ArrowDown, Bookmark, ChevronDown, GitBranch } from "lucide-react";
import type {
  MessageCapturedDTO,
  MemoryItemDTO,
  RevisitedDecisionDTO,
} from "@workspace/shared";
import { cn } from "@/lib/utils";

/**
 * Renders directly under a completed assistant message:
 *
 *   • An amber "Revises X" callout for every memory item this turn updated
 *     in place (with Originally → Now → Why right there in the chat).
 *   • A quiet "Captured" pill summarizing what brand-new items this turn
 *     added. Collapses by default; expands inline to show kind + text.
 *
 * The point is to make the memory layer *visible in the moment of use* — not
 * something the user has to open a panel to find. This is the felt wedge that
 * separates Mneme from "ChatGPT + a memory button."
 *
 * Polling cadence: the extractor runs fire-and-forget AFTER the SSE
 * generator finishes ai_completed, so the first poll is almost always empty.
 * We attempt at 1.5s, 4s, and 8s — covering fast extractor runs without
 * spamming the endpoint. As soon as we get a non-empty result we stop.
 */
export function CapturedSurface({ messageId }: { messageId: string }) {
  const [data, setData] = useState<MessageCapturedDTO | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    async function poll(): Promise<boolean> {
      try {
        const res = await fetch(`/api/messages/${messageId}/captured`);
        if (!res.ok) return false;
        const fresh = (await res.json()) as MessageCapturedDTO;
        if (cancelled) return true;
        if (fresh.added.length === 0 && fresh.revised.length === 0) return false;
        setData(fresh);
        return true; // got something — stop polling
      } catch {
        return false;
      }
    }

    // Three attempts: covers fast (Groq, ~1s extraction) and slow (Gemini
    // fallback chain) without becoming a busy loop.
    const schedule = [1500, 4000, 8000];
    let stopped = false;
    schedule.forEach((delay) => {
      timers.push(
        setTimeout(async () => {
          if (stopped || cancelled) return;
          const done = await poll();
          if (done) stopped = true;
        }, delay),
      );
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [messageId]);

  if (!data) return null;
  const hasRevised = data.revised.length > 0;
  const hasAdded = data.added.length > 0;
  if (!hasRevised && !hasAdded) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {data.revised.map((r) => (
        <RevisesCallout key={r.current.id} hit={r} />
      ))}
      {hasAdded && <CapturedPill items={data.added} />}
    </div>
  );
}

/* ── Revises callout ───────────────────────────────────────────────── */

/**
 * Amber-bordered card shown directly in the chat when this AI turn
 * replaced a prior decision. The moat made visible at the exact moment
 * it fires — not hidden in a panel the user has to remember to open.
 */
function RevisesCallout({ hit }: { hit: RevisitedDecisionDTO }) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.05] p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
          <GitBranch className="h-2.5 w-2.5" />
          Heads up — this revises an earlier decision
        </span>
      </div>
      <div className="grid grid-cols-[64px_1fr] gap-x-2.5 gap-y-1 text-[13px]">
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          Originally
        </span>
        <span className="font-serif italic leading-snug text-muted-foreground line-through decoration-muted-foreground/40">
          {hit.prior.text}
        </span>
        <span className="col-span-2 my-1 flex items-center gap-1.5 text-muted-foreground/50">
          <span className="h-px flex-1 bg-border" />
          <ArrowDown className="h-3 w-3" />
          <span className="h-px flex-1 bg-border" />
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-primary/80">
          Now
        </span>
        <span className="font-serif leading-snug text-foreground">
          {hit.current.text}
        </span>
        {hit.prior.reason && (
          <>
            <span className="font-mono text-[9px] uppercase tracking-wider text-primary/80">
              Why
            </span>
            <span className="text-[12px] leading-snug text-muted-foreground">
              {hit.prior.reason}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Captured pill ─────────────────────────────────────────────────── */

const KIND_LABEL: Record<MemoryItemDTO["kind"], string> = {
  DECISION: "decision",
  QUESTION: "question",
  ACTION_ITEM: "action",
  CONTEXT: "context",
};

function summarize(items: MemoryItemDTO[]): string {
  const counts: Partial<Record<MemoryItemDTO["kind"], number>> = {};
  for (const it of items) counts[it.kind] = (counts[it.kind] ?? 0) + 1;
  const parts: string[] = [];
  for (const kind of ["DECISION", "QUESTION", "ACTION_ITEM", "CONTEXT"] as const) {
    const n = counts[kind];
    if (!n) continue;
    parts.push(`${n} ${KIND_LABEL[kind]}${n === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

/**
 * Collapsed-by-default pill that summarizes what brand-new items this
 * turn captured. Clicking expands an inline list showing each item's
 * kind + text. Quiet on purpose — when the team's chatting, the pill
 * confirms the layer is alive without stealing focus.
 */
function CapturedPill({ items }: { items: MemoryItemDTO[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        <Bookmark className="h-3 w-3 text-primary" />
        Captured · {summarize(items)}
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5 rounded-md border border-border/60 bg-card/40 px-3 py-2.5">
          {items.map((it) => (
            <li
              key={it.id}
              className="grid grid-cols-[72px_1fr] gap-x-3 text-[13px] leading-snug"
            >
              <span className="font-mono text-[9px] uppercase tracking-wider text-primary">
                {KIND_LABEL[it.kind]}
              </span>
              <span className="font-serif text-foreground/90">{it.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
