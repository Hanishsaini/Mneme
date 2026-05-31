import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/** Data access for AgentDecisionEvent. Vector and tsvector writes
 *  bypass Prisma (Unsupported types) via raw SQL helpers below. */

function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export interface CreateDecisionInput {
  runId: string;
  workspaceId: string;
  decisionType: string;
  decisionContent: string;
  contextUsed: Record<string, unknown>;
  toolCalled: string | null;
  toolOutput: Record<string, unknown> | null;
  contentHash: string;
  previousHash: string | null;
}

export async function createDecisionEvent(
  input: CreateDecisionInput,
  embedding: number[] | null,
): Promise<string> {
  // Two-step write: Prisma create for the relational columns + cuid,
  // then a raw UPDATE for the pgvector column (Prisma can't type
  // Unsupported("vector(768)") directly). Wrapped in a transaction so a
  // crash between the two never leaves an embedding-less row queryable.
  return prisma.$transaction(async (tx) => {
    const row = await tx.agentDecisionEvent.create({
      data: {
        runId: input.runId,
        workspaceId: input.workspaceId,
        decisionType: input.decisionType,
        decisionContent: input.decisionContent,
        contextUsed: input.contextUsed as Prisma.InputJsonValue,
        toolCalled: input.toolCalled,
        toolOutput: (input.toolOutput ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        contentHash: input.contentHash,
        previousHash: input.previousHash,
      },
      select: { id: true },
    });
    if (embedding) {
      await tx.$executeRawUnsafe(
        `UPDATE "AgentDecisionEvent" SET embedding = $1::vector WHERE id = $2`,
        vectorLiteral(embedding),
        row.id,
      );
    }
    return row.id;
  });
}

export function findDecisionById(id: string) {
  return prisma.agentDecisionEvent.findUnique({ where: { id } });
}

/** Latest decision in a run by decidedAt — used to chain the next
 *  decision's previousHash. */
export function latestDecisionInRun(runId: string) {
  return prisma.agentDecisionEvent.findFirst({
    where: { runId },
    orderBy: { decidedAt: "desc" },
    select: { id: true, contentHash: true },
  });
}

export function listDecisionsForRun(runId: string) {
  return prisma.agentDecisionEvent.findMany({
    where: { runId },
    orderBy: { decidedAt: "asc" },
    include: {
      violations: {
        include: { policyRule: { select: { ruleText: true } } },
      },
    },
  });
}

/** Link a decision to the one it superseded (called by the supersession
 *  detector after a new decision lands). */
export function setSupersession(
  newDecisionId: string,
  supersededDecisionId: string,
  reason: string,
) {
  return prisma.agentDecisionEvent.update({
    where: { id: supersededDecisionId },
    data: {
      supersededById: newDecisionId,
      supersededReason: reason,
    },
  });
}
