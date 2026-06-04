import "server-only";
import { prisma } from "@/lib/db/prisma";

/** Data access for ApiKey — workspace-scoped bearer tokens. */

export function createApiKey(input: {
  workspaceId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  createdById?: string | null;
}) {
  return prisma.apiKey.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name,
      keyHash: input.keyHash,
      keyPrefix: input.keyPrefix,
      createdById: input.createdById ?? null,
    },
  });
}

/** Active keys for the management UI, newest first. Never selects keyHash. */
export function listApiKeysForWorkspace(workspaceId: string) {
  return prisma.apiKey.findMany({
    where: { workspaceId, isActive: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Auth lookup. Resolves a hashed token to its active key, or null. */
export function findActiveApiKeyByHash(keyHash: string) {
  return prisma.apiKey.findFirst({
    where: { keyHash, isActive: true },
    select: { id: true, workspaceId: true },
  });
}

export function findApiKey(id: string) {
  return prisma.apiKey.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, isActive: true },
  });
}

/** Stamp last use. Fire-and-forget from the auth path — a failed touch must
 *  never block the request it's recording. */
export function touchApiKey(id: string) {
  return prisma.apiKey.update({
    where: { id },
    data: { lastUsedAt: new Date() },
  });
}

/** Soft revoke. The row stays for the audit record; auth lookups filter on
 *  `isActive`, so a revoked key stops working immediately. */
export function revokeApiKey(id: string) {
  return prisma.apiKey.update({
    where: { id },
    data: { isActive: false },
  });
}
