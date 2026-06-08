"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  GitBranch,
  Loader2,
  MessageSquare,
  ScrollText,
  ShieldAlert,
  X,
} from "lucide-react";
import type {
  AuditExportDTO,
  MemoryItemDTO,
  MemoryItemKind,
  PolicyViolationSeverity,
} from "@workspace/shared";
import {
  Badge,
  DecisionCard,
  type DecisionCardViolation,
  EmptyState,
} from "@/components/design";
import { timeAgo } from "@/lib/utils";

/**
 * Workspace Overview — the unified entry point. Two systems, one glance:
 * the four stat cards count agent behavior (decisions, contradictions,
 * violations) alongside team memory, and the two columns below preview the
 * most recent of each. Everything here derives from endpoints that already
 * exist (audit-export + memory/items); no new backend surface.
 */

type ExportRun = AuditExportDTO["runs"][number];
type ExportDecision = ExportRun["decisions"][number];

const KIND_LABEL: Record<MemoryItemKind, string> = {
  DECISION: "Decision",
  QUESTION: "Question",
  ACTION_ITEM: "Action",
  CONTEXT: "Context",
};

export function WorkspaceOverview({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const [runs, setRuns] = useState<ExportRun[] | null>(null);
  const [memory, setMemory] = useState<MemoryItemDTO[] | null>(null);

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

  // Flatten every decision once, newest-first, carrying its run for context.
  const decisions = useMemo(() => {
    if (!runs) return [];
    const flat = runs.flatMap((run) =>
      run.decisions.map((d) => ({ decision: d, run })),
    );
    return flat.sort(
      (a, b) =>
        new Date(b.decision.decidedAt).getTime() -
        new Date(a.decision.decidedAt).getTime(),
    );
  }, [runs]);

  const stats = useMemo(() => {
    const allDecisions = (runs ?? []).flatMap((r) => r.decisions);
    return {
      decisions: allDecisions.length,
      contradictions: allDecisions.filter((d) => d.supersededById !== null).length,
      violations: allDecisions.reduce((n, d) => n + d.violations.length, 0),
      memory: memory?.length ?? 0,
    };
  }, [runs, memory]);

  const loading = runs === null || memory === null;
  const onlyDemo =
    runs != null &&
    (runs.length === 0 || runs.every((r) => r.agentName.startsWith("example-")));

  return (
    <div className="px-8 py-7">
      <div className="mb-6">
        <h1 className="type-display text-ink">{workspaceName}</h1>
        <p className="mt-1 type-body text-ink-secondary">
          Everything your agents have decided, learned, and connected — at a
          glance.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={ScrollText}
          label="Decisions logged"
          value={stats.decisions}
          loading={loading}
        />
        <StatCard
          icon={GitBranch}
          label="Contradictions caught"
          value={stats.contradictions}
          loading={loading}
          tone={stats.contradictions > 0 ? "amber" : undefined}
        />
        <StatCard
          icon={ShieldAlert}
          label="Policy violations"
          value={stats.violations}
          loading={loading}
          tone={stats.violations > 0 ? "danger" : undefined}
        />
        <StatCard
          icon={BrainCircuit}
          label="Memory items"
          value={stats.memory}
          loading={loading}
        />
      </div>

      {/* Two columns: recent decisions / recent memory */}
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <ColumnHeader
            title="Recent decisions"
            href={`/w/${workspaceId}/audit`}
            cta="All decisions"
          />
          {loading ? (
            <LoadingRow label="Loading decisions" />
          ) : decisions.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              heading="No decisions yet"
              body="Once your agent logs decisions via the SDK, the latest show up here."
            />
          ) : (
            <div className="space-y-3">
              {decisions.slice(0, 5).map(({ decision, run }) => (
                <DecisionCardFromDTO key={decision.id} decision={decision} run={run} />
              ))}
            </div>
          )}
        </section>

        <section>
          <ColumnHeader
            title="Recent memory"
            href={`/w/${workspaceId}/memory`}
            cta="All memory"
          />
          {loading ? (
            <LoadingRow label="Loading memory" />
          ) : (memory?.length ?? 0) === 0 ? (
            <EmptyState
              icon={BrainCircuit}
              heading="No memory yet"
              body="Decisions, questions, and action items captured from conversations land here."
            />
          ) : (
            <div className="space-y-2">
              {memory!.slice(0, 5).map((item) => (
                <MemoryRow key={item.id} item={item} workspaceId={workspaceId} />
              ))}
            </div>
          )}
        </section>
      </div>

      {onlyDemo && <OnboardingBanner workspaceId={workspaceId} />}
    </div>
  );
}

/* ── Stat card ───────────────────────────────────────────────────────── */

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  tone,
}: {
  icon: typeof ScrollText;
  label: string;
  value: number;
  loading: boolean;
  tone?: "amber" | "danger";
}) {
  const color =
    tone === "amber"
      ? "var(--accent-amber)"
      : tone === "danger"
        ? "var(--color-danger)"
        : "var(--text-secondary)";
  return (
    <div className="rounded-card border border-hairline-subtle bg-surface p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} style={{ color }} />
        <span className="type-micro text-ink-tertiary">{label}</span>
      </div>
      <p className="mt-2 type-display tabular-nums text-ink">
        {loading ? <span className="text-ink-tertiary">—</span> : value}
      </p>
    </div>
  );
}

/* ── Column header ───────────────────────────────────────────────────── */

function ColumnHeader({
  title,
  href,
  cta,
}: {
  title: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="type-heading text-ink">{title}</h2>
      <Link
        href={href}
        className="inline-flex items-center gap-1 type-small text-ink-tertiary transition-colors hover:text-ink"
      >
        {cta}
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

/* ── Recent memory row ───────────────────────────────────────────────── */

function MemoryRow({
  item,
  workspaceId,
}: {
  item: MemoryItemDTO;
  workspaceId: string;
}) {
  return (
    <Link
      href={`/w/${workspaceId}/chat?thread=${item.conversationId}`}
      className="group flex items-start gap-3 rounded-card border border-hairline-subtle bg-surface px-4 py-3 transition-colors hover:border-amber-border"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="neutral" size="sm">
            {KIND_LABEL[item.kind]}
          </Badge>
          <span className="type-small shrink-0 text-ink-tertiary">
            {timeAgo(item.createdAt)}
          </span>
        </div>
        <p className="mt-2 type-body text-ink line-clamp-2">{item.text}</p>
        {item.revisionCount > 0 && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-pill px-2 py-0.5 type-micro" style={{ backgroundColor: "var(--accent-amber-subtle)", color: "var(--accent-amber)" }}>
            <GitBranch className="h-2.5 w-2.5" />
            Revised {item.revisionCount}×
          </span>
        )}
      </div>
    </Link>
  );
}

/* ── Decision adapter (mirrors the audit shell) ──────────────────────── */

function DecisionCardFromDTO({
  decision,
  run,
}: {
  decision: ExportDecision;
  run: ExportRun;
}) {
  const violations: DecisionCardViolation[] = decision.violations.map((v) => ({
    id: v.id,
    severity: v.severity as PolicyViolationSeverity,
    policyName: v.policyRuleText,
    explanation: v.violationExplanation,
  }));
  const original =
    decision.supersededById != null
      ? run.decisions.find((d) => d.id === decision.supersededById)
      : undefined;

  return (
    <DecisionCard
      decisionType={decision.decisionType}
      content={decision.decisionContent}
      timestamp={decision.decidedAt}
      hash={decision.contentHash}
      toolCalled={decision.toolCalled}
      toolOutput={decision.toolOutput}
      superseded={decision.supersededById !== null}
      supersededAtIso={original?.decidedAt ?? decision.createdAt}
      violations={violations}
    />
  );
}

/* ── Onboarding banner ───────────────────────────────────────────────── */

function OnboardingBanner({ workspaceId }: { workspaceId: string }) {
  const storageKey = `mneme-overview-onboarding-${workspaceId}`;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem(storageKey, "1");
    setDismissed(true);
  }

  return (
    <div
      className="mt-8 rounded-card border-l-2 p-4"
      style={{
        borderColor: "var(--accent-amber)",
        backgroundColor: "var(--accent-amber-subtle)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="type-subheading text-ink">
            You&apos;re looking at demo data.
          </p>
          <p className="mt-0.5 type-body text-ink-secondary">
            Connect your first agent in one SDK call — then every decision it
            makes shows up here.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-ink-tertiary transition-colors hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={`/w/${workspaceId}/audit`}
          className="inline-flex items-center gap-1.5 rounded-field border border-hairline px-2.5 py-1 type-small text-ink transition-colors hover:bg-surface-elevated"
        >
          <span className="type-micro text-ink-tertiary">1</span>
          Generate API key
        </Link>
        <a
          href="/#integrate"
          className="inline-flex items-center gap-1.5 rounded-field border border-hairline px-2.5 py-1 type-small text-ink transition-colors hover:bg-surface-elevated"
        >
          <span className="type-micro text-ink-tertiary">2</span>
          Install SDK
        </a>
        <Link
          href={`/w/${workspaceId}/chat`}
          className="inline-flex items-center gap-1.5 rounded-field border border-hairline px-2.5 py-1 type-small text-ink transition-colors hover:bg-surface-elevated"
        >
          <MessageSquare className="h-3 w-3 text-ink-tertiary" />
          Or just start chatting
        </Link>
      </div>
    </div>
  );
}

/* ── Shared ──────────────────────────────────────────────────────────── */

function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-12 type-small text-ink-tertiary">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {label}
    </div>
  );
}
