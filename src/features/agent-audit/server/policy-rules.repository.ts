import "server-only";
import { prisma } from "@/lib/db/prisma";

function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export interface CreatePolicyRuleInput {
  workspaceId: string;
  ruleText: string;
  createdById: string;
}

/** Create a rule + write its embedding in one transaction. The policy
 *  engine reads `ruleEmbedding` to pre-filter rules by cosine similarity
 *  before the LLM violation check. */
export async function createPolicyRule(
  input: CreatePolicyRuleInput,
  embedding: number[] | null,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.policyRule.create({
      data: {
        workspaceId: input.workspaceId,
        ruleText: input.ruleText,
        createdById: input.createdById,
      },
      select: { id: true },
    });
    if (embedding) {
      await tx.$executeRawUnsafe(
        `UPDATE "PolicyRule" SET "ruleEmbedding" = $1::vector WHERE id = $2`,
        vectorLiteral(embedding),
        row.id,
      );
    }
    return row.id;
  });
}

export function listPolicyRulesForWorkspace(workspaceId: string) {
  return prisma.policyRule.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { violations: true } } },
  });
}

export function listActivePolicyRules(workspaceId: string) {
  return prisma.policyRule.findMany({
    where: { workspaceId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
}

export function setPolicyRuleActive(id: string, isActive: boolean) {
  return prisma.policyRule.update({ where: { id }, data: { isActive } });
}

export function findPolicyRule(id: string) {
  return prisma.policyRule.findUnique({ where: { id } });
}
