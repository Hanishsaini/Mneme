import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { requireConversationAccess } from "@/lib/auth/authz";
import { toConversationDTO } from "@/lib/db/mappers";
import {
  deleteConversation,
  updateConversation,
} from "@/features/conversation/server/conversation.repository";

const paramsSchema = z.object({ conversationId: z.string().min(1) });
const patchSchema = z.object({ title: z.string().min(1).max(120) });

/**
 * PATCH /api/conversations/:conversationId
 *
 * Rename a thread. Authorization gates on EDITOR+ membership of the parent
 * workspace (resolved by requireConversationAccess).
 */
export const PATCH = withHandler(
  { paramsSchema, bodySchema: patchSchema },
  async ({ user, body, params }) => {
    await requireConversationAccess(user.id, params.conversationId, "EDITOR");
    const conv = await updateConversation(params.conversationId, {
      title: body.title,
    });
    return { conversation: toConversationDTO(conv) };
  },
);

/**
 * DELETE /api/conversations/:conversationId
 *
 * Removes a thread; FK cascade clears its messages, AI runs, and any
 * abort flags on those runs (those are Redis-only with TTL — they'll
 * just expire). Workspace + canvas + other threads are untouched.
 *
 * Idempotent in spirit but Prisma will throw P2025 if called twice on the
 * same row — caller should treat 404 as already-deleted.
 */
export const DELETE = withHandler(
  { paramsSchema },
  async ({ user, params }) => {
    await requireConversationAccess(user.id, params.conversationId, "EDITOR");
    await deleteConversation(params.conversationId);
    return { ok: true };
  },
);
