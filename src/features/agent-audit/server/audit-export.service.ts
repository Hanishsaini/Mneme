import "server-only";
import { createHash } from "crypto";
import type { AuditExportDTO, AgentDecisionEventDTO } from "@workspace/shared";
import { prisma } from "@/lib/db/prisma";
import {
  toAgentDecisionEventDTO,
  toAgentRunDTO,
  toPolicyRuleDTO,
  toPolicyViolationDTO,
} from "@/lib/db/mappers";

/**
 * Build the full audit export for a workspace.
 *
 * Output is machine-readable JSON that a compliance officer or external
 * auditor can verify standalone. The `exportHash` at the top is sha256
 * over the concatenated `contentHash` values of every decision in the
 * export, in chronological order — small enough to log, big enough to
 * fail loudly if any decision is removed or modified between download
 * and audit.
 *
 * Per-decision tamper evidence: each decision already carries
 * (contentHash, previousHash) — the auditor re-derives the chain from
 * (decisionContent, contextUsed, previousHash) and verifies every
 * contentHash. Any modification anywhere breaks the chain at that point.
 *
 * No streaming — exports are bounded by workspace size and complete
 * exports compress well. If a workspace ever has >100k decisions we'll
 * stream; until then, in-memory is simpler and correctness-trivial.
 */
export async function buildAuditExport(workspaceId: string): Promise<AuditExportDTO> {
  const [workspace, runs, policyRules] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    }),
    prisma.agentRun.findMany({
      where: { workspaceId },
      orderBy: { startedAt: "asc" },
      include: {
        decisions: {
          orderBy: { decidedAt: "asc" },
          include: {
            violations: {
              include: { policyRule: { select: { ruleText: true } } },
            },
          },
        },
        _count: { select: { decisions: true } },
      },
    }),
    prisma.policyRule.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { violations: true } } },
    }),
  ]);

  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  // Per-run unresolved violation counts (mirrors the runs endpoint).
  const violationCountsByRun = new Map<string, number>();
  for (const run of runs) {
    let count = 0;
    for (const d of run.decisions) {
      for (const v of d.violations) {
        if (v.resolvedAt === null) count++;
      }
    }
    violationCountsByRun.set(run.id, count);
  }

  const runDtos = runs.map((run) => {
    const decisions = run.decisions.map((d) => ({
      ...toAgentDecisionEventDTO(d),
      violations: d.violations.map(toPolicyViolationDTO),
    }));
    return {
      ...toAgentRunDTO(run, violationCountsByRun.get(run.id) ?? 0),
      decisions,
    };
  });

  // Collect every decision's contentHash in chronological order across
  // every run. This is the input the exportHash is computed over.
  const allDecisions: AgentDecisionEventDTO[] = runs.flatMap((r) =>
    r.decisions.map(toAgentDecisionEventDTO),
  );
  allDecisions.sort((a, b) =>
    a.decidedAt < b.decidedAt ? -1 : a.decidedAt > b.decidedAt ? 1 : 0,
  );
  const exportHash = createHash("sha256")
    .update(allDecisions.map((d) => d.contentHash).join("\n"))
    .digest("hex");

  return {
    workspace,
    generatedAt: new Date().toISOString(),
    exportHash,
    runs: runDtos,
    policyRules: policyRules.map(toPolicyRuleDTO),
  };
}
