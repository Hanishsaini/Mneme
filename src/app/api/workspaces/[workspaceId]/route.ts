import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import {
  deleteWorkspace,
  findWorkspaceById,
  renameWorkspace,
} from "@/features/workspace/server/workspace.repository";
import { toWorkspaceDTO } from "@/lib/db/mappers";
import { Errors } from "@/lib/api/errors";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

/** GET /api/workspaces/:workspaceId — workspace detail (members only). */
export const GET = withHandler({ paramsSchema }, async ({ user, params }) => {
  await requireMembership(user.id, params.workspaceId);
  const workspace = await findWorkspaceById(params.workspaceId);
  if (!workspace) throw Errors.notFound("Workspace");
  return { workspace: toWorkspaceDTO(workspace) };
});

const renameBodySchema = z.object({ name: z.string().trim().min(1).max(100) });

/** PATCH /api/workspaces/:workspaceId — rename. Owner only. */
export const PATCH = withHandler(
  { paramsSchema, bodySchema: renameBodySchema },
  async ({ user, params, body }) => {
    await requireMembership(user.id, params.workspaceId, "OWNER");
    const updated = await renameWorkspace(params.workspaceId, body.name);
    return { workspace: { id: updated.id, name: updated.name } };
  },
);

/** DELETE /api/workspaces/:workspaceId — hard delete. Owner only. Cascades. */
export const DELETE = withHandler({ paramsSchema }, async ({ user, params }) => {
  await requireMembership(user.id, params.workspaceId, "OWNER");
  await deleteWorkspace(params.workspaceId);
  return { ok: true };
});
