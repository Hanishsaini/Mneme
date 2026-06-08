"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BrainCircuit, Loader2, Search } from "lucide-react";
import type {
  AuditExportDTO,
  MemoryItemDTO,
  MemoryItemKind,
} from "@workspace/shared";
import { Badge, EmptyState, HashDisplay } from "@/components/design";
import { Input } from "@/components/ui/input";
import { cn, timeAgo } from "@/lib/utils";

/**
 * Agent Memory — the unification moment. Agent decision events and the
 * conversation-memory items the team captures are genuinely different data,
 * but here they live in one chronological feed. Source is encoded by the
 * left accent bar (amber = agent decision, subtle = conversation memory)
 * plus a small source label, so a mixed feed reads as intentional, not
 * broken. The toggle narrows to one source; "All" is the default and the
 * point.
 *
 * Both halves come from endpoints that already exist (audit-export +
 * memory/items); the interleave + filter is entirely client-side.
 */

const KIND_LABEL: Record<MemoryItemKind, string> = {
  DECISION: "Decision",
  QUESTION: "Question",
  ACTION_ITEM: "Action",
  CONTEXT: "Context",
};

type ExportRun = AuditExportDTO["runs"][number];
type ExportDecision = ExportRun["decisions"][number];

type Source = "ALL" | "DECISIONS" | "MEMORY";

type TimelineEntry =
  | {
      source: "decision";
      id: string;
      at: string;
      text: string;
      decision: ExportDecision;
      runName: string;
    }
  | {
      source: "memory";
      id: string;
      at: string;
      text: string;
      item: MemoryItemDTO;
    };

const TOGGLE: Array<{ key: Source; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "DECISIONS", label: "Agent decisions" },
  { key: "MEMORY", label: "Conversation memory" },
];

export function UnifiedMemory({ workspaceId }: { workspaceId: string }) {
  const [runs, setRuns] = useState<ExportRun[] | null>(null);
  const [memory, setMemory] = useState<MemoryItemDTO[] | null>(null);
  const [source, setSource] = useState<Source>("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workspaces/${workspaceId}/audit-export`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: AuditExportDTO) => !cancelled && setRuns(data.runs))
      .catch(() => !cancelled && setRuns([]));
    fetch(`/api/workspaces/${workspaceId}/memory/items`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { items: MemoryItemDTO[] }) => !cancelled && setMemory(data.items))
      .catch(() => !cancelled && setMemory([]));
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const entries = useMemo<TimelineEntry[]>(() => {
    const out: TimelineEntry[] = [];
    for (const run of runs ?? []) {
      for (const d of run.decisions) {
        out.push({
          source: "decision",
          id: d.id,
          at: d.decidedAt,
          text: d.decisionContent,
          decision: d,
          runName: run.agentName,
        });
      }
    }
    for (const item of memory ?? []) {
      out.push({
        source: "memory",
        id: item.id,
        at: item.createdAt,
        text: item.text,
        item,
      });
    }
    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [runs, memory]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (source === "DECISIONS" && e.source !== "decision") return false;
      if (source === "MEMORY" && e.source !== "memory") return false;
      if (q && !e.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, source, search]);

  const loading = runs === null || memory === null;

  return (
    <div className="px-8 py-7">
      <div className="mb-6">
        <h1 className="type-display text-ink">Agent Memory</h1>
        <p className="mt-1 type-body text-ink-secondary">
          Everything your agent has learned, decided, and connected —
          searchable and evolving.
        </p>
      </div>

      {/* Controls */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-field border border-hairline-subtle p-0.5">
          {TOGGLE.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSource(t.key)}
              className={cn(
                "rounded-[5px] px-3 py-1 type-small transition-colors",
                source === t.key
                  ? "bg-surface-elevated text-ink"
                  : "text-ink-tertiary hover:text-ink-secondary",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memory…"
            className="h-8 w-56 border-hairline-subtle bg-surface pl-8"
          />
        </div>
      </div>

      {/* Legend — makes the two-source feed read as intentional. */}
      <div className="mb-4 flex items-center gap-4 type-small text-ink-tertiary">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 rounded-full" style={{ backgroundColor: "var(--accent-amber)" }} />
          Agent decision
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 rounded-full" style={{ backgroundColor: "var(--border-strong)" }} />
          Conversation memory
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 type-small text-ink-tertiary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading memory
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BrainCircuit}
          heading={search ? "Nothing matches" : "No memory yet"}
          body={
            search
              ? "Try a different search, or switch the source filter above."
              : "Log decisions via the SDK or have a conversation with the AI — both land here, in one timeline."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) =>
            entry.source === "decision" ? (
              <DecisionEntry
                key={`d-${entry.id}`}
                decision={entry.decision}
                runName={entry.runName}
              />
            ) : (
              <MemoryEntry
                key={`m-${entry.id}`}
                item={entry.item}
                workspaceId={workspaceId}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* ── Decision entry (amber rail) ─────────────────────────────────────── */

function DecisionEntry({
  decision,
  runName,
}: {
  decision: ExportDecision;
  runName: string;
}) {
  const superseded = decision.supersededById !== null;
  const violated = decision.violations.length > 0;
  return (
    <article className="relative overflow-hidden rounded-card border border-hairline-subtle bg-surface shadow-elev1">
      <span
        className="absolute inset-y-0 left-0 w-0.5"
        style={{ backgroundColor: "var(--accent-amber)" }}
      />
      <div className="py-3 pl-4 pr-3">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <span className="type-micro" style={{ color: "var(--accent-amber)" }}>
              Agent decision
            </span>
            <span className="type-small text-ink-tertiary">· {runName}</span>
          </span>
          <span className="type-small shrink-0 text-ink-tertiary">
            {timeAgo(decision.decidedAt)}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="neutral" size="sm" appearance="solid">
            {decision.decisionType}
          </Badge>
        </div>
        <p className="mt-2 type-body text-ink">{decision.decisionContent}</p>
        {violated && (
          <p
            className="mt-2 inline-flex items-center rounded-field px-2 py-0.5 type-micro"
            style={{ backgroundColor: "var(--color-danger-subtle)", color: "var(--color-danger)" }}
          >
            {decision.violations.length} policy violation
            {decision.violations.length === 1 ? "" : "s"}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          <HashDisplay value={decision.contentHash} label="hash" />
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
    </article>
  );
}

/* ── Memory entry (subtle rail) ──────────────────────────────────────── */

function MemoryEntry({
  item,
  workspaceId,
}: {
  item: MemoryItemDTO;
  workspaceId: string;
}) {
  return (
    <Link
      href={`/w/${workspaceId}/chat?thread=${item.conversationId}`}
      className="group relative block overflow-hidden rounded-card border border-hairline-subtle bg-surface shadow-elev1 transition-colors hover:border-amber-border"
    >
      <span
        className="absolute inset-y-0 left-0 w-0.5"
        style={{ backgroundColor: "var(--border-strong)" }}
      />
      <div className="py-3 pl-4 pr-3">
        <div className="flex items-center justify-between gap-3">
          <span className="type-micro text-ink-tertiary">Conversation memory</span>
          <span className="type-small shrink-0 text-ink-tertiary">
            {timeAgo(item.createdAt)}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="neutral" size="sm">
            {KIND_LABEL[item.kind]}
          </Badge>
          {item.revisionCount > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 type-micro"
              style={{ backgroundColor: "var(--accent-amber-subtle)", color: "var(--accent-amber)" }}
            >
              Revised {item.revisionCount}×
            </span>
          )}
        </div>
        <p className="mt-2 type-body text-ink">{item.text}</p>
      </div>
    </Link>
  );
}
