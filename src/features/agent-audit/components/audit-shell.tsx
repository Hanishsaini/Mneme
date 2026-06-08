"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileCheck2,
  KeyRound,
  Loader2,
  Plus,
  ScrollText,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AgentRunDTO,
  ApiKeyDTO,
  AuditExportDTO,
  CreatedApiKeyDTO,
  PolicyViolationSeverity,
} from "@workspace/shared";
import {
  DecisionCard,
  type DecisionCardViolation,
  EmptyState,
  HashDisplay,
  StatPill,
  StatPillGroup,
  violationTone,
} from "@/components/design";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn, formatDuration, timeAgo } from "@/lib/utils";
import { PoliciesPanel } from "./policies-panel";

/**
 * Agent Audit — the core product surface, rendered inside the AppShell.
 *
 * One audit-export fetch hydrates Runs + Decisions + the slide-in run detail
 * (the export nests runs → decisions → violations). Policies and API Keys hit
 * their own endpoints; Export re-generates on demand.
 */

type Tab = "RUNS" | "DECISIONS" | "POLICIES" | "EXPORT" | "KEYS";
type ExportRun = AuditExportDTO["runs"][number];
type ExportDecision = ExportRun["decisions"][number];

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "RUNS", label: "Runs" },
  { key: "DECISIONS", label: "Decisions" },
  { key: "POLICIES", label: "Policies" },
  { key: "EXPORT", label: "Export" },
  { key: "KEYS", label: "API Keys" },
];

export function AuditShell({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const [tab, setTab] = useState<Tab>("RUNS");
  const [runs, setRuns] = useState<ExportRun[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workspaces/${workspaceId}/audit-export`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: AuditExportDTO) => {
        if (!cancelled) setRuns(data.runs);
      })
      .catch(() => {
        if (!cancelled) setRuns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const onlyDemo = useMemo(
    () =>
      runs != null &&
      (runs.length === 0 ||
        runs.every((r) => r.agentName.startsWith("example-"))),
    [runs],
  );

  return (
    <div className="px-8 py-7">
      <OnboardingBanner
        workspaceId={workspaceId}
        show={onlyDemo}
        onGenerateKey={() => setTab("KEYS")}
      />

      {/* Secondary tab nav */}
      <nav className="mb-6 flex gap-1 border-b border-hairline-subtle">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "relative -mb-px px-3 py-2.5 type-subheading transition-colors",
                active ? "text-ink" : "text-ink-tertiary hover:text-ink-secondary",
              )}
            >
              {t.label}
              {active && (
                <span
                  className="absolute inset-x-0 bottom-[-1px] h-0.5"
                  style={{ backgroundColor: "var(--accent-amber)" }}
                />
              )}
            </button>
          );
        })}
      </nav>

      <div key={tab} className="animate-fade-in">
        {tab === "RUNS" && (
          <RunsTab
            runs={runs}
            onOpenRun={setSelectedRunId}
            onGoToKeys={() => setTab("KEYS")}
            onGoToExport={() => setTab("EXPORT")}
          />
        )}
        {tab === "DECISIONS" && <DecisionsTab runs={runs} />}
        {tab === "POLICIES" && <PoliciesPanel workspaceId={workspaceId} />}
        {tab === "EXPORT" && (
          <ExportTab workspaceId={workspaceId} workspaceName={workspaceName} />
        )}
        {tab === "KEYS" && <KeysTab workspaceId={workspaceId} />}
      </div>

      <RunDetailPanel
        run={runs?.find((r) => r.id === selectedRunId) ?? null}
        onClose={() => setSelectedRunId(null)}
      />
    </div>
  );
}

/* ── Page header ─────────────────────────────────────────────────── */

function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="type-display text-ink">{title}</h1>
        <p className="mt-1 type-body text-ink-secondary">{subtitle}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ── Onboarding banner ───────────────────────────────────────────── */

function OnboardingBanner({
  workspaceId,
  show,
  onGenerateKey,
}: {
  workspaceId: string;
  show: boolean;
  onGenerateKey: () => void;
}) {
  const storageKey = `mneme-onboarding-dismissed-${workspaceId}`;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  if (!show || dismissed) return null;

  function dismiss() {
    localStorage.setItem(storageKey, "1");
    setDismissed(true);
  }

  const steps = [
    { label: "Generate API key", onClick: onGenerateKey },
    { label: "Install SDK", href: "/#integrate" },
    { label: "Run your agent", href: "/#integrate" },
  ];

  return (
    <div
      className="mb-6 rounded-card border-l-2 p-4"
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
            Connect your first agent in 3 steps.
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
        {steps.map((step, i) =>
          step.href ? (
            <a
              key={step.label}
              href={step.href}
              className="inline-flex items-center gap-1.5 rounded-field border border-hairline px-2.5 py-1 type-small text-ink transition-colors hover:bg-surface-elevated"
            >
              <span className="type-micro text-ink-tertiary">{i + 1}</span>
              {step.label}
            </a>
          ) : (
            <button
              key={step.label}
              type="button"
              onClick={step.onClick}
              className="inline-flex items-center gap-1.5 rounded-field border border-hairline px-2.5 py-1 type-small text-ink transition-colors hover:bg-surface-elevated"
            >
              <span className="type-micro text-ink-tertiary">{i + 1}</span>
              {step.label}
            </button>
          ),
        )}
        <span className="ml-1 type-small text-ink-tertiary">0/3 complete</span>
      </div>
    </div>
  );
}

/* ── Runs tab ────────────────────────────────────────────────────── */

function runSupersessions(run: ExportRun): number {
  return run.decisions.filter((d) => d.supersededById !== null).length;
}
function runViolations(run: ExportRun): number {
  return run.decisions.reduce((n, d) => n + d.violations.length, 0);
}

function RunsTab({
  runs,
  onOpenRun,
  onGoToKeys,
  onGoToExport,
}: {
  runs: ExportRun[] | null;
  onOpenRun: (id: string) => void;
  onGoToKeys: () => void;
  onGoToExport: () => void;
}) {
  return (
    <div>
      <PageHeader
        title="Agent Runs"
        subtitle="Audit trail for all autonomous agent activity"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={onGoToKeys}>
              New API Key
            </Button>
            <Button variant="ghost" size="sm" onClick={onGoToExport}>
              Export all
            </Button>
          </>
        }
      />

      {runs === null ? (
        <LoadingRow label="Loading runs" />
      ) : runs.length === 0 ? (
        <EmptyState
          icon={Terminal}
          heading="No agent runs yet"
          body="Once your agents log decisions via the SDK, every run shows up here with its decision, supersession, and violation counts."
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-hairline-subtle">
          <table className="w-full">
            <thead>
              <tr className="border-b border-hairline-subtle bg-surface">
                <Th>Agent</Th>
                <Th>Started</Th>
                <Th>Duration</Th>
                <Th align="right">Decisions</Th>
                <Th align="right">Supersessions</Th>
                <Th align="right">Violations</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const sup = runSupersessions(run);
                const vio = runViolations(run);
                const duration = formatDuration(run.startedAt, run.endedAt);
                return (
                  <tr
                    key={run.id}
                    onClick={() => onOpenRun(run.id)}
                    className="cursor-pointer border-b border-hairline-subtle transition-colors last:border-b-0 hover:bg-surface-elevated"
                  >
                    <td className="px-4 py-3">
                      <span className="type-subheading text-ink">
                        {run.agentName}
                      </span>
                      {run.agentVersion && (
                        <span className="ml-2 type-small text-ink-tertiary">
                          {run.agentVersion}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 type-small text-ink-secondary">
                      {timeAgo(run.startedAt)}
                    </td>
                    <td className="px-4 py-3 type-small text-ink-secondary">
                      {duration ?? <RunningIndicator />}
                    </td>
                    <td className="px-4 py-3 text-right type-small tabular-nums text-ink">
                      {run.decisions.length}
                    </td>
                    <td className="px-4 py-3 text-right type-small tabular-nums">
                      {sup > 0 ? (
                        <span style={{ color: "var(--accent-amber)" }}>{sup}</span>
                      ) : (
                        <span className="text-ink-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {vio > 0 ? (
                        <span className="type-small tabular-nums" style={{ color: "var(--color-danger)" }}>
                          {vio}
                        </span>
                      ) : (
                        <Check className="ml-auto h-3.5 w-3.5" style={{ color: "var(--color-success)" }} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={run.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Run detail slide-in panel ───────────────────────────────────── */

function RunDetailPanel({
  run,
  onClose,
}: {
  run: ExportRun | null;
  onClose: () => void;
}) {
  const open = run !== null;
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-hairline-subtle bg-surface shadow-elev3 transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {run && (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-hairline-subtle px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="type-heading text-ink">{run.agentName}</h2>
                  <StatusChip status={run.status} />
                </div>
                <p className="mt-0.5 type-small text-ink-tertiary">
                  {run.agentVersion || "—"} · started {timeAgo(run.startedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-ink-tertiary transition-colors hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-hairline-subtle px-5 py-3">
              <StatPillGroup>
                <StatPill value={run.decisions.length} label="decisions" />
                <StatPill
                  value={runSupersessions(run)}
                  label="supersessions"
                  tone="amber"
                />
                <StatPill
                  value={runViolations(run)}
                  label="violations"
                  tone={violationTone(runViolations(run))}
                />
              </StatPillGroup>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 scrollbar-thin">
              {runViolations(run) > 0 && (
                <div
                  className="rounded-field border-l-2 px-3 py-2 type-small"
                  style={{
                    borderColor: "var(--color-danger)",
                    backgroundColor: "var(--color-danger-subtle)",
                    color: "var(--color-danger)",
                  }}
                >
                  {runViolations(run)} policy violation
                  {runViolations(run) === 1 ? "" : "s"} in this run
                </div>
              )}
              {run.decisions.map((d) => (
                <DecisionCardFromDTO key={d.id} decision={d} run={run} />
              ))}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

/* ── Decisions tab ───────────────────────────────────────────────── */

type DecisionFilter = "ALL" | "VIOLATED" | "SUPERSEDED" | "CLEAN";
type DateRange = "TODAY" | "7D" | "30D" | "ALL";

function withinRange(iso: string, range: DateRange): boolean {
  if (range === "ALL") return true;
  const age = Date.now() - new Date(iso).getTime();
  const DAY = 86_400_000;
  if (range === "TODAY") return age < DAY;
  if (range === "7D") return age < 7 * DAY;
  return age < 30 * DAY;
}

function DecisionsTab({ runs }: { runs: ExportRun[] | null }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DecisionFilter>("ALL");
  const [range, setRange] = useState<DateRange>("ALL");
  const [agents, setAgents] = useState<string[]>([]);

  const agentNames = useMemo(
    () => Array.from(new Set((runs ?? []).map((r) => r.agentName))),
    [runs],
  );

  const filteredRuns = useMemo(() => {
    if (!runs) return [];
    return runs
      .filter((r) => agents.length === 0 || agents.includes(r.agentName))
      .map((run) => ({
        run,
        decisions: run.decisions.filter((d) => {
          if (!withinRange(d.decidedAt, range)) return false;
          if (search && !d.decisionContent.toLowerCase().includes(search.toLowerCase()))
            return false;
          const violated = d.violations.length > 0;
          const superseded = d.supersededById !== null;
          if (filter === "VIOLATED") return violated;
          if (filter === "SUPERSEDED") return superseded;
          if (filter === "CLEAN") return !violated && !superseded;
          return true;
        }),
      }))
      .filter((g) => g.decisions.length > 0);
  }, [runs, agents, range, search, filter]);

  if (runs === null) return <LoadingRow label="Loading decisions" />;

  return (
    <div>
      <PageHeader
        title="Decisions"
        subtitle="Every agent decision across this workspace, newest last per run"
      />

      {/* Filter bar */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search decision content…"
            className="h-8 max-w-xs border-hairline-subtle bg-surface"
          />
          <FilterChips<DecisionFilter>
            options={[
              ["ALL", "All"],
              ["VIOLATED", "Violated"],
              ["SUPERSEDED", "Superseded"],
              ["CLEAN", "Clean"],
            ]}
            value={filter}
            onChange={setFilter}
          />
          <FilterChips<DateRange>
            options={[
              ["TODAY", "Today"],
              ["7D", "7d"],
              ["30D", "30d"],
              ["ALL", "All"],
            ]}
            value={range}
            onChange={setRange}
          />
        </div>
        {agentNames.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="type-micro text-ink-tertiary">Agents</span>
            {agentNames.map((name) => {
              const on = agents.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() =>
                    setAgents((a) =>
                      on ? a.filter((x) => x !== name) : [...a, name],
                    )
                  }
                  className={cn(
                    "rounded-pill border px-2.5 py-1 type-small transition-colors",
                    on
                      ? "border-amber-border text-ink"
                      : "border-hairline-subtle text-ink-tertiary hover:text-ink-secondary",
                  )}
                  style={on ? { backgroundColor: "var(--accent-amber-subtle)" } : undefined}
                >
                  {name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {filteredRuns.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          heading="No decisions match"
          body="Adjust the filters above, or log your first decision via the SDK to populate the timeline."
        />
      ) : (
        <div className="space-y-8">
          {filteredRuns.map(({ run, decisions }) => (
            <div key={run.id}>
              <div className="mb-3 flex items-center gap-2 type-small text-ink-tertiary">
                <span className="type-subheading text-ink-secondary">
                  {run.agentName}
                </span>
                <span>·</span>
                <span className="font-mono text-[12px]">run {run.id.slice(0, 8)}</span>
                <span>·</span>
                <span>{timeAgo(run.startedAt)}</span>
              </div>
              <div className="space-y-3">
                {decisions.map((d) => (
                  <DecisionCardFromDTO key={d.id} decision={d} run={run} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Adapt an export-shaped decision DTO into the design-system DecisionCard. */
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
    <div id={`decision-${decision.id}`}>
      <DecisionCard
        decisionType={decision.decisionType}
        content={decision.decisionContent}
        timestamp={decision.decidedAt}
        hash={decision.contentHash}
        toolCalled={decision.toolCalled}
        toolOutput={decision.toolOutput}
        superseded={decision.supersededById !== null}
        supersededAtIso={original?.decidedAt ?? decision.createdAt}
        onNavigateToOriginal={
          original
            ? () =>
                document
                  .getElementById(`decision-${original.id}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" })
            : undefined
        }
        violations={violations}
      />
    </div>
  );
}

/* ── Export tab ──────────────────────────────────────────────────── */

const EXPORT_INCLUDES = [
  "All decisions",
  "Supersession links",
  "Policy violations",
  "Content hashes",
  "Agent metadata",
];

function ExportTab({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const [exporting, setExporting] = useState(false);
  const [hash, setHash] = useState<string | null>(null);

  async function generate() {
    setExporting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/audit-export`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = JSON.parse(text) as { exportHash?: string };
      setHash(parsed.exportHash ?? null);
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mneme-audit-${workspaceId}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Audit export downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Audit Export"
        subtitle="Generate a tamper-evident audit trail for regulatory compliance"
      />

      <div className="mx-auto max-w-[480px]">
        <div className="rounded-card border border-hairline-subtle bg-surface p-6">
          <div className="flex items-center justify-between">
            <span className="type-subheading text-ink">{workspaceName}</span>
            <span className="type-small text-ink-tertiary">All time</span>
          </div>

          <div className="mt-5 space-y-2.5">
            <p className="type-micro text-ink-tertiary">Include</p>
            {EXPORT_INCLUDES.map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-[4px]"
                  style={{ backgroundColor: "var(--accent-amber-subtle)" }}
                >
                  <Check className="h-3 w-3" style={{ color: "var(--accent-amber)" }} />
                </span>
                <span className="type-body text-ink">{item}</span>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <p className="type-micro text-ink-tertiary">Export format</p>
            <div className="mt-2 flex gap-2">
              <span
                className="rounded-field px-3 py-1.5 type-small"
                style={{ backgroundColor: "var(--accent-amber-subtle)", color: "var(--accent-amber)" }}
              >
                JSON
              </span>
              <span className="rounded-field border border-hairline-subtle px-3 py-1.5 type-small text-ink-tertiary">
                CSV (coming soon)
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={exporting}
            className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-field type-subheading transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: "var(--accent-amber)", color: "var(--bg-base)" }}
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Generate export
              </>
            )}
          </button>

          {hash && (
            <div className="mt-5 border-t border-hairline-subtle pt-4">
              <p className="type-micro text-ink-tertiary">Verification hash</p>
              <div className="mt-1.5">
                <HashDisplay value={hash} />
              </div>
              <p className="mt-2 type-small text-ink-tertiary">
                Share this hash with your auditor to verify integrity.
              </p>
            </div>
          )}
        </div>

        <p className="mt-4 type-small text-ink-tertiary">
          This export satisfies: Colorado AI Act documentation requirements ·
          HIPAA §164.312(b) audit controls · SOC2 Type II evidence collection
        </p>
      </div>
    </div>
  );
}

/* ── API Keys tab ────────────────────────────────────────────────── */

function KeysTab({ workspaceId }: { workspaceId: string }) {
  const [keys, setKeys] = useState<ApiKeyDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/api-keys`);
    if (!res.ok) {
      setError(
        res.status === 403
          ? "You don't have access to API keys for this workspace."
          : `HTTP ${res.status}`,
      );
      return;
    }
    const data = (await res.json()) as { apiKeys: ApiKeyDTO[] };
    setError(null);
    setKeys(data.apiKeys);
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function revoke(keyId: string, name: string) {
    if (!window.confirm(`Revoke "${name}"? Any agent using it stops authenticating immediately.`))
      return;
    const prev = keys;
    setKeys((ks) => (ks ? ks.filter((k) => k.id !== keyId) : ks));
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/api-keys/${keyId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Could not revoke");
      toast.success("Key revoked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke");
      setKeys(prev);
    }
  }

  return (
    <div>
      <PageHeader
        title="API Keys"
        subtitle="Authenticate your agents with bearer tokens"
        actions={
          <Button
            size="sm"
            onClick={() => setModalOpen(true)}
            className="gap-1.5"
            style={{ backgroundColor: "var(--accent-amber)", color: "var(--bg-base)" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Generate new key
          </Button>
        }
      />

      {error ? (
        <div
          className="rounded-card border-l-2 px-4 py-3 type-body"
          style={{ borderColor: "var(--color-danger)", backgroundColor: "var(--color-danger-subtle)", color: "var(--color-danger)" }}
        >
          {error}
        </div>
      ) : keys === null ? (
        <LoadingRow label="Loading keys" />
      ) : keys.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          heading="No API keys yet"
          body="Generate one to connect your first agent. Until then, the agent routes still accept a logged-in session."
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-hairline-subtle">
          <table className="w-full">
            <thead>
              <tr className="border-b border-hairline-subtle bg-surface">
                <Th>Name</Th>
                <Th>Prefix</Th>
                <Th>Last used</Th>
                <Th>Created</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-hairline-subtle last:border-b-0">
                  <td className="px-4 py-3 type-body text-ink">{k.name}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[13px]" style={{ color: "var(--hash-color)" }}>
                      {k.keyPrefix}…
                    </span>
                  </td>
                  <td className="px-4 py-3 type-small text-ink-secondary">
                    {k.lastUsedAt ? (
                      timeAgo(k.lastUsedAt)
                    ) : (
                      <span className="text-ink-tertiary">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-3 type-small text-ink-secondary">
                    {timeAgo(k.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => revoke(k.id, k.name)}
                      className="inline-flex items-center gap-1.5 rounded-field px-2 py-1 type-micro transition-colors hover:bg-danger-subtle"
                      style={{ color: "var(--color-danger)" }}
                    >
                      <Trash2 className="h-3 w-3" />
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <GenerateKeyModal
        workspaceId={workspaceId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={refresh}
      />
    </div>
  );
}

function GenerateKeyModal({
  workspaceId,
  open,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiKeyDTO | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setName("");
    setCreated(null);
    setCopied(false);
    onClose();
  }

  async function generate() {
    if (name.trim().length < 1) {
      toast.error("Give the key a name");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/api-keys`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.status === 403) throw new Error("Only a workspace owner can create API keys");
      if (!res.ok) throw new Error("Could not create key");
      setCreated((await res.json()) as CreatedApiKeyDTO);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create key");
    } finally {
      setCreating(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select the key and copy manually");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && reset()}>
      <DialogContent className="max-w-md rounded-modal border-hairline-subtle bg-surface">
        {!created ? (
          <>
            <DialogHeader>
              <DialogTitle className="type-heading text-ink">
                Generate API key
              </DialogTitle>
              <DialogDescription className="type-body text-ink-secondary">
                Scoped to this workspace. The secret is shown once.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !creating && generate()}
              placeholder="production-agent"
              autoFocus
              className="border-hairline-subtle bg-surface-base"
            />
            <button
              type="button"
              onClick={generate}
              disabled={creating || name.trim().length < 1}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-field type-subheading transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: "var(--accent-amber)", color: "var(--bg-base)" }}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate"}
            </button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="type-heading text-ink">
                {created.apiKey.name}
              </DialogTitle>
            </DialogHeader>
            <div
              className="rounded-field border-l-2 px-3 py-2 type-small"
              style={{
                borderColor: "var(--accent-amber)",
                backgroundColor: "var(--accent-amber-subtle)",
                color: "var(--accent-amber)",
              }}
            >
              This key will never be shown again. Copy it now.
            </div>
            <div className="flex items-center gap-2 rounded-field border border-hairline-subtle bg-surface-base p-3">
              <code
                className="flex-1 break-all font-mono text-[13px]"
                style={{ color: "var(--hash-color)" }}
              >
                {created.plaintext}
              </code>
              <button
                type="button"
                onClick={copy}
                className="shrink-0 rounded-field border border-hairline-subtle px-2 py-1 type-micro text-ink-secondary transition-colors hover:text-ink"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <button
              type="button"
              onClick={reset}
              className="h-9 w-full rounded-field type-subheading transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--accent-amber)", color: "var(--bg-base)" }}
            >
              I&apos;ve copied it
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Shared bits ─────────────────────────────────────────────────── */

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 type-micro text-ink-tertiary",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function StatusChip({ status }: { status: AgentRunDTO["status"] }) {
  if (status === "RUNNING") {
    return (
      <span className="inline-flex items-center gap-1.5 type-micro" style={{ color: "var(--color-success)" }}>
        <RunningIndicator />
        running
      </span>
    );
  }
  const tone: Record<string, string> = {
    COMPLETED: "var(--color-success)",
    FAILED: "var(--color-danger)",
    CANCELLED: "var(--text-tertiary)",
  };
  return (
    <span className="type-micro" style={{ color: tone[status] ?? "var(--text-secondary)" }}>
      {status.toLowerCase()}
    </span>
  );
}

function RunningIndicator() {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full animate-running-dot"
      style={{ backgroundColor: "var(--color-success)" }}
    />
  );
}

function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<[T, string]>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-field border border-hairline-subtle p-0.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "rounded-[5px] px-2.5 py-1 type-small transition-colors",
            value === key
              ? "bg-surface-elevated text-ink"
              : "text-ink-tertiary hover:text-ink-secondary",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-12 type-small text-ink-tertiary">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {label}
    </div>
  );
}
