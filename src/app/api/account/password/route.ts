import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { changePassword } from "@/features/account/server/account.service";

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1).max(256),
});

/**
 * POST /api/account/password
 *
 * Change the signed-in user's password. Requires the current password as
 * an explicit step — even though the request is already authenticated,
 * this is the standard "prove possession" pattern to make a stolen-cookie
 * attack harder to escalate into full takeover.
 *
 * The new password is validated server-side against the same strength
 * rules as registration (min length, breach-list, can't contain email
 * local-part).
 */
export const POST = withHandler(
  { bodySchema },
  async ({ user, body }) => {
    return changePassword(user.id, body);
  },
);
