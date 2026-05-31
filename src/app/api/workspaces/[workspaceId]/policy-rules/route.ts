import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import {
  createPolicyRule,
  listPolicyRulesForWorkspace,
} from "@/features/agent-audit/server/policy-rules.repository";
import { embedPolicyRule } from "@/features/agent-audit/server/decision-embedding";
import { toPolicyRuleDTO } from "@/lib/db/mappers";
import { findPolicyRule } from "@/features/agent-audit/server/policy-rules.repository";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const createBodySchema = z.object({
  rule_text: z.string().min(8).max(2000),
});

/**
 * GET /api/workspaces/:workspaceId/policy-rules
 * List all rules (active + inactive) with violation counts.
 */
export const GET = withHandler({ paramsSchema }, async ({ user, params }) => {
  await requireMembership(user.id, params.workspaceId);
  const rules = await listPolicyRulesForWorkspace(params.workspaceId);
  return { rules: rules.map(toPolicyRuleDTO) };
});

/**
 * POST /api/workspaces/:workspaceId/policy-rules
 * Create a new rule. Rule embedding is computed inline so the next
 * incoming decision can already be matched against it via cosine.
 * Member-gated EDITOR — policies have real teeth.
 */
export const POST = withHandler(
  { paramsSchema, bodySchema: createBodySchema },
  async ({ user, params, body }) => {
    await requireMembership(user.id, params.workspaceId, "EDITOR");
    const embedding = await embedPolicyRule(body.rule_text).catch(() => null);
    const id = await createPolicyRule(
      {
        workspaceId: params.workspaceId,
        ruleText: body.rule_text,
        createdById: user.id,
      },
      embedding,
    );
    const fresh = await findPolicyRule(id);
    return { rule: fresh ? toPolicyRuleDTO(fresh) : null };
  },
);
