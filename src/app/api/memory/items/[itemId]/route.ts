import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import {
  deleteMemoryItem,
  findMemoryItemById,
  updateMemoryItem,
} from "@/features/memory/server/memory-items.repository";
import { toMemoryItemDTO } from "@/lib/db/mappers";
import { Errors } from "@/lib/api/errors";

const paramsSchema = z.object({ itemId: z.string().min(1) });

const patchBodySchema = z
  .object({
    text: z.string().min(1).max(2000).optional(),
    resolved: z.boolean().optional(),
    ownerId: z.string().min(1).nullable().optional(),
    dueAt: z.string().datetime().nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field is required",
  });

/**
 * PATCH /api/memory/items/:itemId
 *
 * Edit an extracted memory item: rename text, (un)resolve, set/clear an
 * action-item owner or due date. Member of the owning workspace only.
 *
 * `resolved: true` stamps `resolvedAt = now()`; `false` clears it. We map
 * here rather than letting the client write the timestamp.
 */
export const PATCH = withHandler(
  { paramsSchema, bodySchema: patchBodySchema },
  async ({ user, params, body }) => {
    const existing = await findMemoryItemById(params.itemId);
    if (!existing) throw Errors.notFound("Memory item");
    await requireMembership(user.id, existing.workspaceId, "EDITOR");

    const updated = await updateMemoryItem(params.itemId, {
      ...(body.text !== undefined ? { text: body.text } : {}),
      ...(body.ownerId !== undefined ? { ownerId: body.ownerId } : {}),
      ...(body.dueAt !== undefined
        ? { dueAt: body.dueAt ? new Date(body.dueAt) : null }
        : {}),
      ...(body.resolved !== undefined
        ? { resolvedAt: body.resolved ? new Date() : null }
        : {}),
    });
    return { item: toMemoryItemDTO(updated) };
  },
);

/**
 * DELETE /api/memory/items/:itemId
 *
 * Permanently remove an extracted item — false positives happen, the
 * extractor is a best-effort heuristic. Member of the owning workspace only.
 */
export const DELETE = withHandler({ paramsSchema }, async ({ user, params }) => {
  const existing = await findMemoryItemById(params.itemId);
  if (!existing) throw Errors.notFound("Memory item");
  await requireMembership(user.id, existing.workspaceId, "EDITOR");

  await deleteMemoryItem(params.itemId);
  return { ok: true };
});
