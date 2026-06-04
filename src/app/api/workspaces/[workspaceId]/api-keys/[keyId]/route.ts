import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import { Errors } from "@/lib/api/errors";
import {
  findApiKey,
  revokeApiKey,
} from "@/features/agent-audit/server/api-keys.repository";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  keyId: z.string().min(1),
});

/**
 * DELETE /api/workspaces/:workspaceId/api-keys/:keyId
 *
 * Revoke a key. Soft delete — the row flips `isActive = false` so it stops
 * authenticating immediately while staying on record. Owner-only, and the
 * key must belong to the workspace in the URL (so a valid keyId from
 * another workspace can't be revoked by guessing).
 */
export const DELETE = withHandler(
  { paramsSchema },
  async ({ user, params }) => {
    await requireMembership(user.id, params.workspaceId, "OWNER");

    const key = await findApiKey(params.keyId);
    if (!key || key.workspaceId !== params.workspaceId) {
      throw Errors.notFound("API key");
    }
    if (key.isActive) await revokeApiKey(key.id);

    return { ok: true };
  },
);
