import { z } from "zod";
import type { MemoryItemKind } from "@prisma/client";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import { listMemoryItems } from "@/features/memory/server/memory-items.repository";
import { toMemoryItemDTO } from "@/lib/db/mappers";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const KIND_VALUES = ["DECISION", "QUESTION", "ACTION_ITEM", "CONTEXT"] as const;

/**
 * GET /api/workspaces/:workspaceId/memory/items
 *
 * Lists structured memory items extracted from past AI turns in this
 * workspace. Members only.
 *
 * Query params (all optional):
 *   - `kind`     — filter by DECISION | QUESTION | ACTION_ITEM | CONTEXT
 *   - `resolved` — "true" / "false" to filter by resolution state
 */
export const GET = withHandler({ paramsSchema }, async ({ req, user, params }) => {
  await requireMembership(user.id, params.workspaceId);

  const url = new URL(req.url);
  const rawKind = url.searchParams.get("kind");
  const rawResolved = url.searchParams.get("resolved");

  const kind = rawKind && (KIND_VALUES as readonly string[]).includes(rawKind)
    ? (rawKind as MemoryItemKind)
    : undefined;
  const resolved = rawResolved === "true" ? true : rawResolved === "false" ? false : undefined;

  const items = await listMemoryItems(params.workspaceId, { kind, resolved });
  return { items: items.map(toMemoryItemDTO) };
});
