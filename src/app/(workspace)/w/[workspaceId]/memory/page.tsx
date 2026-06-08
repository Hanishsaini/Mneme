import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { requireMembership } from "@/lib/auth/authz";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { UnifiedMemory } from "@/features/memory/components/unified-memory";
import { ApiError } from "@/lib/api/errors";

/**
 * Agent Memory (RSC) — the unified timeline of agent decisions and the
 * conversation memory captured from chat, in one chronological feed. Auth +
 * membership gate, then hand off to the client timeline.
 */
export default async function MemoryPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  try {
    await requireMembership(user.id, workspaceId);
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    });
    if (!workspace) notFound();
    return (
      <AppShell
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        active="memory"
        userName={user.name}
        userEmail={user.email}
      >
        <UnifiedMemory workspaceId={workspace.id} />
      </AppShell>
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}
