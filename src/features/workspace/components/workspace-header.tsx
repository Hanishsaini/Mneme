"use client";

import { useState } from "react";
import { BrainCircuit, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AccountMenu } from "@/features/account/components/account-menu";
import { MemoryPanel } from "@/features/memory/components/memory-panel";
import { useStaleCount } from "@/features/memory/hooks/use-stale-count";
import { useWorkspaceStore } from "@/stores/workspace-store";

/**
 * Top chrome: mobile menu trigger, workspace name, Memory button (with
 * stale-count badge), command-palette trigger, account menu.
 *
 * The old "Live / Reconnecting…" status badge and presence avatars were
 * tied to the socket connection — both removed now that chat streams
 * directly over SSE. A future multi-user reintroduction will reinstate
 * them.
 */
export function WorkspaceHeader({
  onMenuClick,
  onOpenPalette,
}: {
  onMenuClick: () => void;
  onOpenPalette: () => void;
}) {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const { count: staleCount, refresh: refreshStale } = useStaleCount(
    workspace?.id ?? null,
  );

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
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="relative hidden gap-1.5 text-muted-foreground hover:text-foreground sm:flex"
          onClick={() => setMemoryOpen(true)}
        >
          <BrainCircuit className="h-3.5 w-3.5" />
          <span className="text-xs">Memory</span>
          {staleCount > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {staleCount > 99 ? "99+" : staleCount}
            </span>
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="relative sm:hidden"
          onClick={() => setMemoryOpen(true)}
          aria-label={
            staleCount > 0
              ? `Team memory — ${staleCount} need review`
              : "Open team memory"
          }
        >
          <BrainCircuit />
          {staleCount > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
          )}
        </Button>
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
      <MemoryPanel
        open={memoryOpen}
        onOpenChange={setMemoryOpen}
        staleCount={staleCount}
        onStaleChange={refreshStale}
      />
    </header>
  );
}
