import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { requireMembership } from "@/lib/auth/authz";
import { prisma } from "@/lib/db/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceSettings } from "@/features/workspace/components/workspace-settings";
import { ApiError } from "@/lib/api/errors";

/**
 * Workspace settings — rendered in the AppShell. Server-fetches the workspace
 * + members and the caller's role so the client form knows whether to enable
 * the owner-only rename / delete controls.
 */
export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  try {
    const membership = await requireMembership(user.id, workspaceId);
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { members: { include: { user: true }, orderBy: { joinedAt: "asc" } } },
    });
    if (!workspace) notFound();

    return (
      <AppShell
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        active="settings"
        userName={user.name}
        userEmail={user.email}
      >
        <WorkspaceSettings
          workspaceId={workspace.id}
          initialName={workspace.name}
          isOwner={membership.role === "OWNER"}
          members={workspace.members.map((m) => ({
            id: m.id,
            role: m.role,
            name: m.user.name,
            email: m.user.email,
          }))}
        />
      </AppShell>
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}
