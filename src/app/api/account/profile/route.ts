import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { updateProfile } from "@/features/account/server/account.service";

const bodySchema = z.object({
  name: z.string().max(120).nullable().optional(),
});

/**
 * PATCH /api/account/profile
 *
 * Update the signed-in user's display name. Pass `null` (or an empty
 * string the server will normalize) to clear it. The session cookie
 * doesn't get re-minted here — clients should call `update()` from
 * next-auth/react to refresh the in-memory session if they're displaying
 * the name elsewhere.
 */
export const PATCH = withHandler(
  { bodySchema },
  async ({ user, body }) => {
    const result = await updateProfile(user.id, { name: body.name ?? null });
    return result;
  },
);
