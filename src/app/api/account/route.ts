import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { deleteAccount } from "@/features/account/server/account.service";

const bodySchema = z.object({
  currentPassword: z.string().min(1),
});

/**
 * DELETE /api/account
 *
 * Hard-deletes the signed-in user and cascades through every workspace
 * they own. Requires the current password as a final confirmation —
 * the request is already authenticated, but this is an irreversible
 * destructive action and we want one more proof-of-possession step
 * before pulling the trigger.
 *
 * The client is expected to sign out after a 2xx response so the now-
 * invalid session cookie doesn't leak. NextAuth has no DB session for
 * us to clear server-side under the JWT strategy; the cookie stops
 * being verifiable as soon as the user row is gone, but a polite client
 * close avoids confusing follow-up 401s.
 *
 * The Next.js DELETE handler can't accept a request body in some
 * clients/proxies; we still parse the body with zod for consistency
 * and rely on the fetch caller using `body: JSON.stringify(...)`.
 */
export const DELETE = withHandler(
  { bodySchema },
  async ({ user, body }) => {
    await deleteAccount(user.id, body);
    return { ok: true };
  },
);
