import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import { toConversationDTO } from "@/lib/db/mappers";
import {
  createConversation,
  listConversationsForWorkspace,
} from "@/features/conversation/server/conversation.repository";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });
const createSchema = z.object({ title: z.string().max(120).optional() });

/**
 * POST /api/workspaces/:workspaceId/conversations
 *
 * Creates a new thread inside the workspace. Title is optional — defaults
 * to "New conversation"; the client may rename via PATCH later (or we'll
 * auto-derive a title from the first prompt in a future iteration).
 */
export const POST = withHandler(
  { paramsSchema, bodySchema: createSchema },
  async ({ user, body, params }) => {
    await requireMembership(user.id, params.workspaceId, "EDITOR");
    const conv = await createConversation({
      workspaceId: params.workspaceId,
      title: body.title,
    });
    return { conversation: toConversationDTO(conv) };
  },
);

/**
 * GET /api/workspaces/:workspaceId/conversations
 *
 * Lists all threads in the workspace, newest first. The workspace snapshot
 * already includes this, so most callers won't need it — useful for thread
 * switcher refresh after a delete or rename.
 */
export const GET = withHandler({ paramsSchema }, async ({ user, params }) => {
  await requireMembership(user.id, params.workspaceId);
  const conversations = await listConversationsForWorkspace(params.workspaceId);
  return { conversations: conversations.map(toConversationDTO) };
});
