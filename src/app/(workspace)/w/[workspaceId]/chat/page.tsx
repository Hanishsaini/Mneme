import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { requireMembership } from "@/lib/auth/authz";
import { getWorkspaceSnapshot } from "@/features/workspace/server/workspace.service";
import { WorkspaceShell } from "@/features/workspace/components/workspace-shell";
import { ApiError } from "@/lib/api/errors";

/**
 * Chat (RSC). The conversational capture surface — where talking to the AI
 * produces the conversation-memory half of the unified memory. A secondary
 * destination now: Overview (/w/[id]) is the workspace landing; chat is
 * reached from the nav footer and the Memory page. Auth + membership gate,
 * then build the snapshot the client store hydrates from.
 */
export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ thread?: string }>;
}) {
  const { workspaceId } = await params;
  const { thread } = await searchParams;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  try {
    await requireMembership(user.id, workspaceId);
    const snapshot = await getWorkspaceSnapshot(workspaceId, thread);
    return <WorkspaceShell snapshot={snapshot} />;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    // 403 / anything else → bubble to error.tsx
    throw err;
  }
}
