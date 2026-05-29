import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import { listItemsForMessage } from "@/features/memory/server/memory-items.repository";
import { toMemoryItemDTO, toRevisitedDecisionDTO } from "@/lib/db/mappers";
import { Errors } from "@/lib/api/errors";

const paramsSchema = z.object({ messageId: z.string().min(1) });

/**
 * GET /api/messages/:messageId/captured
 *
 * Returns what the memory extractor wrote during the AI turn that produced
 * this message. Split into:
 *   - `added`   — brand new items (no predecessor)
 *   - `revised` — items that replaced an earlier revision, each paired
 *                 with the immediate predecessor for the inline
 *                 Originally → Now → Why preview
 *
 * The chat surface polls this after each assistant message reaches COMPLETE
 * — usually empty on the first poll (extraction is fire-and-forget after
 * ai_completed and takes ~1–3s), so the client retries once with a delay.
 * That's the felt moment of "the memory layer just did something for us."
 *
 * Member-gated on the owning workspace.
 */
export const GET = withHandler({ paramsSchema }, async ({ user, params }) => {
  const message = await prisma.message.findUnique({
    where: { id: params.messageId },
    select: { id: true, conversation: { select: { workspaceId: true } } },
  });
  if (!message) throw Errors.notFound("Message");
  await requireMembership(user.id, message.conversation.workspaceId);

  const rows = await listItemsForMessage(params.messageId);
  const added: ReturnType<typeof toMemoryItemDTO>[] = [];
  const revised: NonNullable<ReturnType<typeof toRevisitedDecisionDTO>>[] = [];
  for (const row of rows) {
    if (row.supersedes.length > 0) {
      const dto = toRevisitedDecisionDTO(row);
      if (dto) revised.push(dto);
    } else {
      added.push(toMemoryItemDTO(row));
    }
  }
  return { added, revised };
});
