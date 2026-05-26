import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/api/errors";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { CURSOR_COLORS } from "@/config/constants";

/**
 * Registers a new email+password user and provisions their personal
 * workspace + default conversation + canvas atomically. The OAuth path
 * provisions the workspace via the NextAuth `events.createUser` event;
 * credentials sign-ups bypass that hook (the PrismaAdapter only fires it
 * for adapter-created users), so we do it ourselves here.
 *
 * Email normalization is lower-case-trim; passwords are validated for
 * minimum length but not echoed to logs.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegisterInput {
  email: string;
  password: string;
  name?: string | null;
}

export async function registerUser(input: RegisterInput) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw Errors.badRequest("Enter a valid email address.");
  }

  const pwError = validatePasswordStrength(input.password, email);
  if (pwError) throw Errors.badRequest(pwError);

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });
  if (existing) {
    // Generic message — no enumeration. Tells legitimate users to sign in.
    throw Errors.badRequest(
      "An account with that email already exists. Sign in instead.",
    );
  }

  const passwordHash = await hashPassword(input.password);
  const trimmedName = input.name?.trim() || null;
  const firstName = trimmedName?.split(" ")[0]?.trim();
  const workspaceName = firstName
    ? `${firstName}'s workspace`
    : "Personal workspace";

  // One transaction: User + Workspace + Membership + Conversation + Canvas.
  // Mirrors the OAuth createUser event but inside an atomic boundary.
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email,
        name: trimmedName,
        passwordHash,
      },
    });
    await tx.workspace.create({
      data: {
        name: workspaceName,
        ownerId: u.id,
        members: {
          create: {
            userId: u.id,
            role: "OWNER",
            cursorColor: CURSOR_COLORS[0],
          },
        },
        conversations: { create: { title: "New conversation" } },
        canvases: { create: { type: "NOTES", snapshot: { blocks: [] } } },
      },
    });
    return u;
  });

  return { id: user.id, email: user.email };
}
