import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import { generateApiKey } from "@/lib/auth/api-key";
import {
  createApiKey,
  listApiKeysForWorkspace,
} from "@/features/agent-audit/server/api-keys.repository";
import { toApiKeyDTO } from "@/lib/db/mappers";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const createBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
});

/**
 * POST /api/workspaces/:workspaceId/api-keys
 *
 * Mint a new workspace-scoped API key. This is the ONLY time the plaintext
 * secret is ever exposed — we store its SHA-256 and return the raw token
 * once. Owner-only: a key grants unattended write access to the audit log,
 * so minting one is an owner-level act.
 */
export const POST = withHandler(
  { paramsSchema, bodySchema: createBodySchema },
  async ({ user, params, body }) => {
    await requireMembership(user.id, params.workspaceId, "OWNER");

    const { plaintext, keyHash, keyPrefix } = generateApiKey();
    const row = await createApiKey({
      workspaceId: params.workspaceId,
      name: body.name,
      keyHash,
      keyPrefix,
      createdById: user.id,
    });

    // `plaintext` is returned here and never again — the client must copy it now.
    return { apiKey: toApiKeyDTO(row), plaintext };
  },
);

/**
 * GET /api/workspaces/:workspaceId/api-keys
 *
 * List the workspace's active keys for the management UI. Returns only the
 * non-secret prefix + metadata; the hash never leaves the server. EDITOR+
 * so developers connecting agents can see what's already provisioned.
 */
export const GET = withHandler({ paramsSchema }, async ({ user, params }) => {
  await requireMembership(user.id, params.workspaceId, "EDITOR");
  const keys = await listApiKeysForWorkspace(params.workspaceId);
  return { apiKeys: keys.map(toApiKeyDTO) };
});
