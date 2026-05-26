"use client";

import { useState } from "react";
import { BrainCircuit, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PresenceAvatars } from "@/features/presence/components/presence-avatars";
import { AccountMenu } from "@/features/account/components/account-menu";
import { MemoryPanel } from "@/features/memory/components/memory-panel";
import { useWorkspaceStore, type ConnectionStatus } from "@/stores/workspace-store";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
  offline: "Offline",
};

const STATUS_VARIANT: Record<
  ConnectionStatus,
  "default" | "secondary" | "destructive"
> = {
  connecting: "secondary",
  live: "default",
  reconnecting: "secondary",
  offline: "destructive",
};

/**
 * Top chrome: mobile menu trigger, workspace name + connection status,
 * presence avatars, command-palette trigger, sign-out.
 */
export function WorkspaceHeader({
  onMenuClick,
  onOpenPalette,
}: {
  onMenuClick: () => void;
  onOpenPalette: () => void;
}) {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const connection = useWorkspaceStore((s) => s.connection);
  const [memoryOpen, setMemoryOpen] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card/40 px-3 backdrop-blur sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu />
        </Button>
        <span className="truncate font-semibold">
          {workspace?.name ?? "Workspace"}
        </span>
        <Badge variant={STATUS_VARIANT[connection]} className="gap-1">
          <span
            className="h-1.5 w-1.5 rounded-full bg-current"
            aria-hidden
          />
          {STATUS_LABEL[connection]}
        </Badge>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="hidden gap-1.5 text-muted-foreground hover:text-foreground sm:flex"
          onClick={() => setMemoryOpen(true)}
        >
          <BrainCircuit className="h-3.5 w-3.5" />
          <span className="text-xs">Memory</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          onClick={() => setMemoryOpen(true)}
          aria-label="Open team memory"
        >
          <BrainCircuit />
        </Button>
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <PresenceAvatars />
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <Button
          variant="outline"
          size="sm"
          className="hidden gap-2 text-muted-foreground sm:flex"
          onClick={onOpenPalette}
        >
          <Search className="h-3.5 w-3.5" />
          <kbd className="rounded border bg-muted px-1.5 text-[10px] font-medium">
            ⌘K
          </kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          onClick={onOpenPalette}
          aria-label="Search and commands"
        >
          <Search />
        </Button>
        <AccountMenu />
      </div>
      <MemoryPanel open={memoryOpen} onOpenChange={setMemoryOpen} />
    </header>
  );
}
