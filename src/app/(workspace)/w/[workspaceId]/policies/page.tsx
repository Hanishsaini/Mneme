import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { requireMembership } from "@/lib/auth/authz";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { PoliciesPanel } from "@/features/agent-audit/components/policies-panel";
import { ApiError } from "@/lib/api/errors";

/**
 * Policies (RSC) — promoted from an audit tab to a first-class destination.
 * Same panel the audit shell's Policies tab renders, now reachable directly
 * from the unified nav. Auth + membership gate, then hand off.
 */
export default async function PoliciesPage({
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
        active="policies"
        userName={user.name}
        userEmail={user.email}
      >
        <div className="px-8 py-7">
          <PoliciesPanel workspaceId={workspace.id} />
        </div>
      </AppShell>
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}
