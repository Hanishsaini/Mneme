import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/api/errors";
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/auth/password";

/**
 * Account-management service. Three responsibilities:
 *   - Update profile (display name)
 *   - Change password (verify the current one, validate the new one)
 *   - Delete account (cascade the user's owned workspaces, null out
 *     authored-message references in workspaces they don't own, hard-
 *     delete the user)
 *
 * Every mutation here is authed at the route layer via `getCurrentUser`.
 * This service trusts the userId it's handed.
 */

const MAX_NAME_LENGTH = 80;

export interface UpdateProfileInput {
  name: string | null;
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const trimmed = input.name?.trim() || null;
  if (trimmed && trimmed.length > MAX_NAME_LENGTH) {
    throw Errors.badRequest(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }
  await prisma.user.update({
    where: { id: userId },
    data: { name: trimmed },
  });
  return { name: trimmed };
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true },
  });
  if (!user) throw Errors.notFound("Account");
  if (!user.passwordHash) {
    // OAuth-only account; no current password to verify. We don't expose
    // this path in v1 — credentials users only.
    throw Errors.badRequest(
      "This account uses single sign-on. Password change isn't available.",
    );
  }

  const ok = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!ok) {
    // Generic message — same wording as the login form so an attacker
    // can't distinguish a guessed current password from a wrong one.
    throw Errors.badRequest("Current password is incorrect.");
  }

  // Pass the email so the validator also rejects passwords containing
  // the local-part. Same rules as registration.
  const pwError = validatePasswordStrength(input.newPassword, user.email);
  if (pwError) throw Errors.badRequest(pwError);

  if (input.currentPassword === input.newPassword) {
    throw Errors.badRequest("New password must be different from the current one.");
  }

  const newHash = await hashPassword(input.newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });
  return { ok: true };
}

export interface DeleteAccountInput {
  currentPassword: string;
}

export async function deleteAccount(
  userId: string,
  input: DeleteAccountInput,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) throw Errors.notFound("Account");
  if (!user.passwordHash) {
    throw Errors.badRequest(
      "This account uses single sign-on. Delete from the provider instead.",
    );
  }

  const ok = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!ok) {
    throw Errors.badRequest("Password is incorrect.");
  }

  // Three-step cascade inside a transaction:
  //   1. Null out authored-message references in workspaces the user
  //      doesn't own. Without this, the FK Message.authorId -> User
  //      blocks the user delete. We keep the messages so other members'
  //      transcripts stay intact, just attribute them to "Unknown".
  //   2. Delete every workspace the user owns. Cascade FKs clean out
  //      conversations, messages inside those, AI runs, embeddings,
  //      memory items, canvases, ops, memberships, invites, presence.
  //   3. Delete the user. Cascade FKs clean accounts (NextAuth), sessions
  //      (NextAuth), memberships in OTHER workspaces, presence rows,
  //      sent invites.
  await prisma.$transaction(async (tx) => {
    await tx.message.updateMany({
      where: { authorId: userId },
      data: { authorId: null },
    });
    await tx.workspace.deleteMany({ where: { ownerId: userId } });
    await tx.user.delete({ where: { id: userId } });
  });
}
