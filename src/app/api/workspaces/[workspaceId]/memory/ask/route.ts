import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { requireMembership } from "@/lib/auth/authz";
import { askWorkspaceMemory } from "@/features/memory/server/ask.service";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });
const bodySchema = z.object({ query: z.string().min(1).max(2000) });

/**
 * POST /api/workspaces/:workspaceId/memory/ask
 *
 * The "ask your team's memory" endpoint — the surface that makes the
 * landing page's headline pitch real. Embed-searches the workspace's
 * past messages, synthesizes an answer with the LLM, and returns the
 * answer plus the cited sources for inline footnoting.
 *
 * POST (not GET) because the question can be paragraph-length, and we
 * never want this cached by an intermediary — the data inputs change
 * every time a conversation finishes.
 *
 * Member-gated; the workspace boundary is the only access control here.
 */
export const POST = withHandler(
  { paramsSchema, bodySchema },
  async ({ user, params, body }) => {
    await requireMembership(user.id, params.workspaceId);
    const result = await askWorkspaceMemory(params.workspaceId, body.query);
    return result;
  },
);
