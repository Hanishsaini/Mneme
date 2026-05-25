import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { registerUser } from "@/features/auth/server/registration.service";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(256),
  name: z.string().max(80).optional(),
});

/**
 * POST /api/auth/register
 *
 * Public endpoint — no session required. Creates a User + personal
 * Workspace and returns the new user's email. The client then calls
 * `signIn("credentials", ...)` to establish the session.
 *
 * Email enumeration is mitigated by the generic "account already exists"
 * message in the service, but the existence check is unavoidable here
 * (Prisma's unique constraint would surface as a less-friendly P2002 too).
 */
export const POST = withHandler(
  { auth: false, bodySchema },
  async ({ body }) => {
    const user = await registerUser(body);
    return { user };
  },
);
