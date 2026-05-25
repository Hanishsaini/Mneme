import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Dev seed — opt-in via env. Two independent fixtures:
 *
 *   SEED_DEV_USERS=true   → create alice@example.com + bob@example.com,
 *                           each with their OWN personal workspace +
 *                           conversation + canvas. Both seeded users get
 *                           the dev password "password1234" so you can
 *                           sign in via the email+password flow.
 *
 *   SEED_DEMO_SHARED=true → additionally create a shared "Demo Workspace"
 *                           with both seeded users as members, for testing
 *                           the realtime collaboration flow without setting
 *                           up OAuth + inviting a second account.
 *
 * Defaults: nothing happens. This file is idempotent — it upserts users and
 * only creates a workspace if the named one doesn't already exist.
 *
 * Re-running the seed re-hashes the dev password every time, which keeps
 * Alice/Bob signable after a password rotation in `DEV_PASSWORD` below.
 */

const CURSOR_COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b"];
const DEV_PASSWORD = "password1234";

const seedUsers = process.env.SEED_DEV_USERS === "true";
const seedShared = process.env.SEED_DEMO_SHARED === "true";

async function upsertUser(email: string, name: string, passwordHash: string) {
  return prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, name, passwordHash },
  });
}

async function ensurePersonalWorkspace(
  userId: string,
  name: string,
  cursorColor: string,
) {
  const existing = await prisma.workspace.findFirst({
    where: { ownerId: userId, name },
    select: { id: true },
  });
  if (existing) return existing.id;

  const ws = await prisma.workspace.create({
    data: {
      name,
      ownerId: userId,
      members: { create: { userId, role: "OWNER", cursorColor } },
      conversations: { create: { title: "New conversation" } },
      canvases: { create: { type: "NOTES", snapshot: { blocks: [] } } },
    },
    select: { id: true },
  });
  return ws.id;
}

async function ensureSharedWorkspace(
  ownerId: string,
  collaboratorId: string,
  ownerColor: string,
  collaboratorColor: string,
) {
  const existing = await prisma.workspace.findFirst({
    where: { name: "Demo Workspace" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const ws = await prisma.workspace.create({
    data: {
      name: "Demo Workspace",
      ownerId,
      members: {
        create: [
          { userId: ownerId, role: "OWNER", cursorColor: ownerColor },
          {
            userId: collaboratorId,
            role: "EDITOR",
            cursorColor: collaboratorColor,
          },
        ],
      },
      conversations: { create: { title: "Getting started" } },
      canvases: { create: { type: "NOTES", snapshot: { blocks: [] } } },
    },
    select: { id: true },
  });
  return ws.id;
}

async function main() {
  if (!seedUsers && !seedShared) {
    console.log(
      "[seed] no SEED_* flags set — nothing to do.\n" +
        "       Set SEED_DEV_USERS=true and/or SEED_DEMO_SHARED=true in .env.local to populate fixtures.",
    );
    return;
  }

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);
  const alice = await upsertUser("alice@example.com", "Alice", passwordHash);
  const bob = await upsertUser("bob@example.com", "Bob", passwordHash);
  console.log(`[seed] dev password for both: ${DEV_PASSWORD}`);

  if (seedUsers) {
    const aliceWs = await ensurePersonalWorkspace(
      alice.id,
      "Alice's workspace",
      CURSOR_COLORS[0],
    );
    const bobWs = await ensurePersonalWorkspace(
      bob.id,
      "Bob's workspace",
      CURSOR_COLORS[1],
    );
    console.log(`[seed] alice → workspace ${aliceWs}`);
    console.log(`[seed] bob   → workspace ${bobWs}`);
  }

  if (seedShared) {
    const sharedWs = await ensureSharedWorkspace(
      alice.id,
      bob.id,
      CURSOR_COLORS[0],
      CURSOR_COLORS[1],
    );
    console.log(`[seed] shared demo workspace: ${sharedWs}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
