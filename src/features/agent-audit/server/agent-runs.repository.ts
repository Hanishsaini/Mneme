import "server-only";
import { Prisma, type AgentRunStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/** Data access for AgentRun. */

export function createAgentRun(input: {
  workspaceId: string;
  agentName: string;
  agentVersion?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.agentRun.create({
    data: {
      workspaceId: input.workspaceId,
      agentName: input.agentName,
      agentVersion: input.agentVersion ?? "",
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export function findAgentRun(id: string) {
  return prisma.agentRun.findUnique({ where: { id } });
}

export function listAgentRunsForWorkspace(workspaceId: string, limit = 50) {
  return prisma.agentRun.findMany({
    where: { workspaceId },
    orderBy: { startedAt: "desc" },
    take: limit,
    include: { _count: { select: { decisions: true } } },
  });
}

export function endAgentRun(id: string, status: AgentRunStatus) {
  return prisma.agentRun.update({
    where: { id },
    data: { status, endedAt: new Date() },
  });
}

/** Count of unresolved policy violations across every decision in a run. */
export async function countViolationsForRun(runId: string): Promise<number> {
  return prisma.policyViolation.count({
    where: {
      decisionEvent: { runId },
      resolvedAt: null,
    },
  });
}
