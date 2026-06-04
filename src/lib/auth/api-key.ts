import "server-only";
import { createHash, randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import {
  findActiveApiKeyByHash,
  touchApiKey,
} from "@/features/agent-audit/server/api-keys.repository";

/**
 * Bearer API key primitives.
 *
 * Keys look like `mnk_<43 url-safe chars>` — a short human-readable prefix
 * plus 32 bytes of entropy. We store only the SHA-256 of the full token,
 * never the plaintext. Because the token is high-entropy (not a
 * user-chosen password) a fast hash is the right choice: it lets us look
 * the key up by an indexed equality on `keyHash` instead of scanning every
 * row and bcrypt-comparing. bcrypt would be both slower AND unusable for
 * lookup here.
 */

const PREFIX = "mnk_";
/** Non-secret leading slice kept for display: `mnk_` + first 6 token chars. */
const DISPLAY_LEN = PREFIX.length + 6;

export interface GeneratedApiKey {
  /** The full secret. Returned to the caller exactly once, never stored. */
  plaintext: string;
  /** SHA-256 hex of `plaintext` — this is what lands in the database. */
  keyHash: string;
  /** Non-secret identifying prefix, safe to persist and display. */
  keyPrefix: string;
}

export function generateApiKey(): GeneratedApiKey {
  const plaintext = PREFIX + randomBytes(32).toString("base64url");
  return {
    plaintext,
    keyHash: hashApiKey(plaintext),
    keyPrefix: plaintext.slice(0, DISPLAY_LEN),
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Pull the raw token out of an `Authorization: Bearer <token>` header. */
export function extractBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

export interface ResolvedApiKey {
  apiKeyId: string;
  workspaceId: string;
}

/**
 * Resolve a request's Bearer token to its workspace, or null if there's no
 * token or it doesn't match an active key. Stamps `lastUsedAt`
 * fire-and-forget — a failed touch never blocks the request.
 */
export async function resolveApiKeyFromRequest(
  req: NextRequest,
): Promise<ResolvedApiKey | null> {
  const token = extractBearerToken(req);
  // Cheap reject for obviously-not-ours tokens before hitting the DB.
  if (!token || !token.startsWith(PREFIX)) return null;

  const key = await findActiveApiKeyByHash(hashApiKey(token));
  if (!key) return null;

  void touchApiKey(key.id).catch(() => {
    // best-effort; never fail the request over a usage timestamp
  });

  return { apiKeyId: key.id, workspaceId: key.workspaceId };
}
