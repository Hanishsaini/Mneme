import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import { Errors } from "@/lib/api/errors";
import {
  findPolicyRule,
  setPolicyRuleActive,
} from "@/features/agent-audit/server/policy-rules.repository";
import { toPolicyRuleDTO } from "@/lib/db/mappers";

const paramsSchema = z.object({ ruleId: z.string().min(1) });

const patchBodySchema = z.object({
  is_active: z.boolean(),
});

/**
 * PATCH /api/policy-rules/:ruleId
 * Toggle a rule active / inactive. Used by the Policies tab.
 */
export const PATCH = withHandler(
  { paramsSchema, bodySchema: patchBodySchema },
  async ({ user, params, body }) => {
    const rule = await findPolicyRule(params.ruleId);
    if (!rule) throw Errors.notFound("Policy rule");
    await requireMembership(user.id, rule.workspaceId, "EDITOR");
    const updated = await setPolicyRuleActive(params.ruleId, body.is_active);
    return { rule: toPolicyRuleDTO(updated) };
  },
);
