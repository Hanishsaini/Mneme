import "server-only";
import { nanoid } from "nanoid";
import type { MemberRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireMembership } from "@/lib/auth/authz";
import { INVITE_TTL_MS } from "@/config/constants";
import { addMember } from "./workspace.service";
import {
  createInviteRecord,
  findInviteByToken,
  markInviteUsed,
} from "./invite.repository";

/**
 * Workspace invite orchestration. Tokens are single-use; the service is the
 * sole authority on what "consumed" means so the API + UI layers stay simple.
 *
 * Outcome model: `acceptInvite` returns a tagged union the caller (a server
 * component) maps onto a redirect or an error page. Throwing is reserved for
 * unexpected failures — predictable states are values, not exceptions.
 */

export interface CreatedInvite {
  token: string;
  url: string;
  expiresAt: string;
}

export async function createInvite(
  workspaceId: string,
  invitedById: string,
  baseUrl: string,
): Promise<CreatedInvite> {
  // EDITOR or higher can mint invites — VIEWER cannot grow the workspace.
  await requireMembership(invitedById, workspaceId, "EDITOR");

  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const invite = await createInviteRecord({
    token,
    workspaceId,
    invitedById,
    role: "EDITOR",
    expiresAt,
  });

  return {
    token: invite.token,
    url: `${baseUrl.replace(/\/$/, "")}/invite/${invite.token}`,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export type InviteOutcome =
  | { kind: "joined"; workspaceId: string; workspaceName: string }
  | { kind: "already_member"; workspaceId: string; workspaceName: string }
  | { kind: "expired"; workspaceName: string }
  | { kind: "used"; workspaceName: string }
  | { kind: "invalid" };

/**
 * Resolves an invite token against the current user. Order of checks matters:
 *
 *   1. token must exist                  → "invalid"
 *   2. already a member?                 → "already_member" (do NOT consume the
 *                                          token; let the invite outlive an
 *                                          owner self-click)
 *   3. already used by someone else?     → "used"
 *   4. expired?                          → "expired"
 *   5. otherwise: add member + mark used → "joined"
 *
 * Step 2 is deliberately ahead of expiry/used checks: an owner clicking their
 * own (expired) link should still land in their workspace, not see an error.
 */
export async function acceptInvite(
  token: string,
  userId: string,
): Promise<InviteOutcome> {
  const invite = await findInviteByToken(token);
  if (!invite) return { kind: "invalid" };

  const workspaceName = invite.workspace.name;

  const existingMember = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId: invite.workspaceId, userId },
    },
  });
  if (existingMember) {
    return {
      kind: "already_member",
      workspaceId: invite.workspaceId,
      workspaceName,
    };
  }

  if (invite.usedAt) return { kind: "used", workspaceName };
  if (invite.expiresAt < new Date()) return { kind: "expired", workspaceName };

  // Two writes, sequential rather than transactional — the upsert in addMember
  // is the source of truth; if markInviteUsed fails the user is still in the
  // workspace and a retry just re-redirects via the "already_member" branch.
  await addMember(invite.workspaceId, userId);
  await markInviteUsed(invite.id, userId).catch((err) => {
    console.error("[invite] failed to mark invite used:", err);
  });

  return { kind: "joined", workspaceId: invite.workspaceId, workspaceName };
}
