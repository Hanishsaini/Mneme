"use client";

import { useRef, useState } from "react";
import type { WorkspaceSnapshot } from "@workspace/shared";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { WorkspaceHeader } from "./workspace-header";
import { CommandPalette } from "./command-palette";
import { JoinedToast } from "./joined-toast";
import { ConversationPanel } from "@/features/conversation/components/conversation-panel";

/**
 * The workspace session boundary. Hydrates the Zustand store from the
 * server-rendered snapshot before children read it, then mounts the chrome:
 * sidebar rail, header, the chat panel, and the ⌘K command palette.
 *
 * Mobile: the sidebar collapses to an animated drawer.
 */
export function WorkspaceShell({
  snapshot,
}: {
  snapshot: WorkspaceSnapshot;
}) {
  // Hydrate exactly once, synchronously, before children read the store.
  const hydrated = useRef(false);
  if (!hydrated.current) {
    useWorkspaceStore.getState().hydrate(snapshot);
    hydrated.current = true;
  }

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceHeader
          onMenuClick={() => setSidebarOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
        />

        <section id="panel-chat" className="min-h-0 flex-1 overflow-hidden">
          <ConversationPanel />
        </section>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <JoinedToast />
    </div>
  );
}
