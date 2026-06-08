import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { requireMembership } from "@/lib/auth/authz";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { AuditShell } from "@/features/agent-audit/components/audit-shell";
import { ApiError } from "@/lib/api/errors";

/**
 * Agent Audit route — the first-class surface for the pivot. Sibling of
 * the chat route at /w/[id]/audit. Auth + membership gate, then hand off
 * to the client shell.
 */
export default async function AuditPage({
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
        active="decisions"
        userName={user.name}
        userEmail={user.email}
      >
        <AuditShell workspaceId={workspace.id} workspaceName={workspace.name} />
      </AppShell>
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}
