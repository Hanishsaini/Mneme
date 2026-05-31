"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  Download,
  FileCheck2,
  GitBranch,
  Loader2,
  Plus,
  ScrollText,
  Shield,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AgentDecisionEventDTO,
  AgentRunDTO,
  PolicyRuleDTO,
  PolicyViolationDTO,
  PolicyViolationSeverity,
} from "@workspace/shared";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/**
 * Agent Audit — the first-class surface for the pivot.
 *
 * Four tabs match the four user jobs:
 *   Runs       — survey what's running / what just ran
 *   Decisions  — drill into the timeline, see supersession + violations
 *                inline in the flow
 *   Policies   — define + manage the rules the engine enforces
 *   Export     — hand a compliance officer a verifiable JSON file
 *
 * Visual register matches the Memory dossier: serif headlines, mono
 * for ids / timestamps / system labels, amber as the only accent,
 * red strictly reserved for violations (the signal you can't miss).
 */

type Tab = "RUNS" | "DECISIONS" | "POLICIES" | "EXPORT";

const TABS: Array<{ key: Tab; label: string; sublabel: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "RUNS", label: "Runs", sublabel: "Agent executions", icon: Terminal },
  { key: "DECISIONS", label: "Decisions", sublabel: "Timeline + supersessions", icon: ScrollText },
  { key: "POLICIES", label: "Policies", sublabel: "Rules + violations", icon: Shield },
  { key: "EXPORT", label: "Export", sublabel: "Compliance JSON", icon: FileCheck2 },
];

export function AuditShell({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const [tab, setTab] = useState<Tab>("RUNS");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background paper-grain">
      <header className="border-b border-border/60 bg-card/30 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/w/${workspaceId}`}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to chat
            </Link>
            <div className="h-4 w-px bg-border" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
                Agent audit
              </p>
              <h1 className="font-serif text-xl font-medium leading-tight tracking-tight">
                {workspaceName}
              </h1>
            </div>
          </div>
          <span className="hidden font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:inline-flex">
            workspace · {workspaceId}
          </span>
        </div>
      </header>

      <nav className="shrink-0 border-b border-border/60 bg-card/20 px-6">
        <div className="flex gap-6 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative flex flex-col items-start py-3 text-left whitespace-nowrap transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-2 font-serif text-base font-medium tracking-tight">
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </span>
                <span className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
                  {t.sublabel}
                </span>
                {active && (
                  <span className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-6 py-6">
          {tab === "RUNS" && (
            <RunsTab
              workspaceId={workspaceId}
              onPickRun={(id) => {
                setSelectedRunId(id);
                setTab("DECISIONS");
              }}
            />
          )}
          {tab === "DECISIONS" && (
            <DecisionsTab workspaceId={workspaceId} initialRunId={selectedRunId} />
          )}
          {tab === "POLICIES" && <PoliciesTab workspaceId={workspaceId} />}
          {tab === "EXPORT" && <ExportTab workspaceId={workspaceId} />}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ── Runs tab ────────────────────────────────────────────────────── */

function RunsTab({
  workspaceId,
  onPickRun,
}: {
  workspaceId: string;
  onPickRun: (id: string) => void;
}) {
  const [runs, setRuns] = useState<AgentRunDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workspaces/${workspaceId}/agent-runs`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { runs: AgentRunDTO[] }) => {
        if (!cancelled) setRuns(data.runs);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  if (error) return <ErrorBlock message={error} />;
  if (!runs) return <LoadingBlock label="Loading runs" />;
  if (runs.length === 0) return <EmptyBlock kind="RUNS" />;

  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-card/30">
            <Th>Agent</Th>
            <Th>Started</Th>
            <Th align="right">Decisions</Th>
            <Th align="right">Violations</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              className="cursor-pointer border-b border-border/40 transition-colors last:border-b-0 hover:bg-card/40"
              onClick={() => onPickRun(run.id)}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="font-serif text-[15px] leading-tight">{run.agentName}</p>
                    {run.agentVersion && (
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        {run.agentVersion}
                      </p>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {timeAgo(run.startedAt)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-[12px]">
                {run.decisionCount ?? 0}
              </td>
              <td className="px-4 py-3 text-right">
                {run.violationCount && run.violationCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-destructive">
                    <AlertOctagon className="h-2.5 w-2.5" />
                    {run.violationCount}
                  </span>
                ) : (
                  <span className="font-mono text-[10px] text-muted-foreground/60">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <StatusPill status={run.status} />
              </td>
              <td className="px-4 py-3 text-right">
                <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status: AgentRunDTO["status"] }) {
  const map: Record<AgentRunDTO["status"], string> = {
    RUNNING: "bg-primary/15 text-primary",
    COMPLETED: "bg-emerald-500/15 text-emerald-300",
    FAILED: "bg-destructive/15 text-destructive",
    CANCELLED: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider", map[status])}>
      {status.toLowerCase()}
    </span>
  );
}

/* ── Decisions tab ───────────────────────────────────────────────── */

interface DecisionWithViolations extends AgentDecisionEventDTO {
  violations: PolicyViolationDTO[];
}

function DecisionsTab({
  workspaceId,
  initialRunId,
}: {
  workspaceId: string;
  initialRunId: string | null;
}) {
  const [runs, setRuns] = useState<AgentRunDTO[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRunId);
  const [decisions, setDecisions] = useState<DecisionWithViolations[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workspaces/${workspaceId}/agent-runs`)
      .then((r) => r.json() as Promise<{ runs: AgentRunDTO[] }>)
      .then((data) => {
        if (cancelled) return;
        setRuns(data.runs);
        if (!selectedRunId && data.runs.length > 0) {
          setSelectedRunId(data.runs[0].id);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workspaceId, selectedRunId]);

  useEffect(() => {
    if (!selectedRunId) return;
    let cancelled = false;
    setDecisions(null);
    fetch(`/api/agent-runs/${selectedRunId}/decisions`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { decisions: DecisionWithViolations[] }) => {
        if (!cancelled) setDecisions(data.decisions);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  if (!runs) return <LoadingBlock label="Loading" />;
  if (runs.length === 0) return <EmptyBlock kind="RUNS" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Filter by run
        </span>
        {runs.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setSelectedRunId(r.id)}
            className={cn(
              "rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
              selectedRunId === r.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {r.agentName}
          </button>
        ))}
      </div>

      {error && <ErrorBlock message={error} />}
      {!decisions && !error && <LoadingBlock label="Loading decisions" />}
      {decisions && decisions.length === 0 && <EmptyBlock kind="DECISIONS" />}
      {decisions && decisions.length > 0 && (
        <ol className="relative space-y-4 border-l-2 border-border/60 pl-6">
          {decisions.map((d) => (
            <DecisionCard key={d.id} decision={d} />
          ))}
        </ol>
      )}
    </div>
  );
}

function DecisionCard({ decision }: { decision: DecisionWithViolations }) {
  const [contextOpen, setContextOpen] = useState(false);
  const hasViolations = decision.violations.length > 0;
  const isSupersession = decision.supersededById !== null;

  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2",
          hasViolations
            ? "border-destructive bg-destructive/20"
            : isSupersession
              ? "border-primary bg-primary/20"
              : "border-border bg-card",
        )}
      />
      <div
        className={cn(
          "rounded-lg border bg-card/40 p-4",
          hasViolations
            ? "border-destructive/40"
            : isSupersession
              ? "border-primary/30"
              : "border-border/60",
        )}
      >
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
              {decision.decisionType}
            </span>
            {isSupersession && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0 font-mono text-[9px] uppercase tracking-wider text-primary">
                <GitBranch className="h-2.5 w-2.5" />
                Supersedes prior
              </span>
            )}
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {timeAgo(decision.decidedAt)}
          </span>
        </div>
        <p className="font-serif text-[15px] leading-snug">{decision.decisionContent}</p>

        {decision.toolCalled && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-secondary/40 px-2 py-1 font-mono text-[10px] text-muted-foreground">
            <Terminal className="h-3 w-3" />
            tool: {decision.toolCalled}
          </p>
        )}

        {hasViolations &&
          decision.violations.map((v) => <ViolationCard key={v.id} v={v} />)}

        <button
          type="button"
          onClick={() => setContextOpen((x) => !x)}
          className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", contextOpen && "rotate-180")}
          />
          {contextOpen ? "Hide" : "Show"} context · hash {decision.contentHash.slice(0, 12)}…
        </button>
        {contextOpen && (
          <pre className="mt-2 overflow-auto rounded-md border border-border/60 bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {JSON.stringify(decision.contextUsed, null, 2)}
          </pre>
        )}
      </div>
    </li>
  );
}

function ViolationCard({ v }: { v: PolicyViolationDTO }) {
  const severityClass: Record<PolicyViolationSeverity, string> = {
    LOW: "border-amber-400/30 bg-amber-400/[0.04]",
    MEDIUM: "border-amber-500/40 bg-amber-500/[0.05]",
    HIGH: "border-destructive/40 bg-destructive/[0.05]",
    CRITICAL: "border-destructive bg-destructive/10",
  };
  return (
    <div className={cn("mt-3 rounded-md border p-3", severityClass[v.severity])}>
      <div className="mb-1 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-destructive">
          <AlertOctagon className="h-3 w-3" />
          Policy violation · {v.severity.toLowerCase()}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {timeAgo(v.detectedAt)}
        </span>
      </div>
      {v.policyRuleText && (
        <p className="mb-1 font-serif text-[13px] italic text-muted-foreground">
          “{v.policyRuleText}”
        </p>
      )}
      <p className="text-[13px] leading-snug">{v.violationExplanation}</p>
    </div>
  );
}

/* ── Policies tab ────────────────────────────────────────────────── */

function PoliciesTab({ workspaceId }: { workspaceId: string }) {
  const [rules, setRules] = useState<PolicyRuleDTO[] | null>(null);
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/policy-rules`);
    if (!res.ok) return;
    const data = (await res.json()) as { rules: PolicyRuleDTO[] };
    setRules(data.rules);
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create() {
    if (draft.trim().length < 8) {
      toast.error("Rule needs to be at least 8 characters");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/policy-rules`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rule_text: draft.trim() }),
      });
      if (!res.ok) throw new Error("Could not create");
      setDraft("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create");
    } finally {
      setCreating(false);
    }
  }

  async function toggle(ruleId: string, next: boolean) {
    const prev = rules;
    setRules((rs) =>
      rs ? rs.map((r) => (r.id === ruleId ? { ...r, isActive: next } : r)) : rs,
    );
    try {
      const res = await fetch(`/api/policy-rules/${ruleId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      });
      if (!res.ok) throw new Error("Could not update");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
      setRules(prev);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
          Add a new policy rule
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="e.g. Never approve a transaction over $10,000 without human review."
          className="w-full resize-none rounded-md border border-border/60 bg-background/60 px-3 py-2 font-serif text-[14px] leading-snug placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
            The engine matches every incoming decision against every active rule.
          </p>
          <Button
            size="sm"
            onClick={create}
            disabled={creating || draft.trim().length < 8}
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Add rule
          </Button>
        </div>
      </section>

      {!rules && <LoadingBlock label="Loading rules" />}
      {rules && rules.length === 0 && <EmptyBlock kind="POLICIES" />}
      {rules && rules.length > 0 && (
        <ul className="flex flex-col">
          {rules.map((r) => (
            <li
              key={r.id}
              className="grid grid-cols-[1fr_auto_auto] items-start gap-4 border-b border-border/60 py-4 last:border-b-0"
            >
              <div>
                <p className={cn("font-serif text-[15px] leading-snug", !r.isActive && "text-muted-foreground line-through")}>
                  {r.ruleText}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  Created {timeAgo(r.createdAt)}
                </p>
              </div>
              {r.violationCount !== undefined && r.violationCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-destructive">
                  <AlertOctagon className="h-2.5 w-2.5" />
                  {r.violationCount} caught
                </span>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  0 caught
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 font-mono text-[10px] uppercase tracking-wider"
                onClick={() => toggle(r.id, !r.isActive)}
              >
                {r.isActive ? <CheckCircle2 className="h-3 w-3 text-primary" /> : null}
                {r.isActive ? "Active" : "Inactive"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Export tab ──────────────────────────────────────────────────── */

function ExportTab({ workspaceId }: { workspaceId: string }) {
  const [exporting, setExporting] = useState(false);
  const [lastHash, setLastHash] = useState<string | null>(null);

  async function download() {
    setExporting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/audit-export`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = JSON.parse(text) as { exportHash?: string };
      setLastHash(parsed.exportHash ?? null);

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
    <div className="max-w-2xl">
      <p className="mb-3 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
        <span className="h-px w-5 bg-primary/60" />
        Compliance export
      </p>
      <h2 className="mb-3 font-serif text-2xl font-medium tracking-tight">
        Hand this file to a compliance officer or regulator.
      </h2>
      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
        The export is a single JSON file containing every agent run, every
        decision, every supersession link, and every policy violation in
        this workspace. Each decision carries a chained <code className="font-mono text-[12px]">content_hash</code> so
        an external auditor can verify that nothing was altered after the
        fact — modifying or removing any row breaks every subsequent hash
        in the chain.
      </p>

      <Button
        size="lg"
        onClick={download}
        disabled={exporting}
        className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {exporting ? "Building export…" : "Export full audit trail"}
      </Button>

      {lastHash && (
        <div className="mt-6 rounded-md border border-border/60 bg-card/50 p-4">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-primary">
            Last export hash · verify this matches the file
          </p>
          <p className="break-all font-mono text-[12px] text-foreground/85">
            {lastHash}
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Shared parts ────────────────────────────────────────────────── */

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
        "px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70",
        align === "right" && "text-right",
      )}
    >
      {children}
    </th>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-10 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      {label}
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/[0.05] px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

function EmptyBlock({ kind }: { kind: "RUNS" | "DECISIONS" | "POLICIES" }) {
  const copy: Record<typeof kind, { title: string; body: string; icon: React.ComponentType<{ className?: string }> }> = {
    RUNS: {
      title: "No agent runs yet",
      body: "Once your agents start logging decisions via the SDK, every run shows up here with its decision count and violation badges.",
      icon: Terminal,
    },
    DECISIONS: {
      title: "No decisions in this run",
      body: "Open the SDK quickstart in the README to log your first agent decision.",
      icon: ScrollText,
    },
    POLICIES: {
      title: "No policy rules yet",
      body: "Add your first rule above. Plain English works — the engine handles semantic matching against every incoming decision.",
      icon: Shield,
    },
  };
  const { title, body, icon: Icon } = copy[kind];
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <Icon className="h-7 w-7 text-muted-foreground/60" />
      <p className="font-serif text-base font-medium">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
