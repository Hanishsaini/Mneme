"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { Link2, LogOut, MessageSquare, Moon, Sun } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useWorkspaceStore } from "@/stores/workspace-store";

/**
 * ⌘K / Ctrl+K command palette. Owns the keyboard shortcut itself; open state
 * is lifted to WorkspaceShell so the sidebar and header triggers can drive
 * it too. Commands act on the live workspace via DOM focus/scroll + store
 * reads — no extra wiring into feature components.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const workspace = useWorkspaceStore((s) => s.workspace);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  /** Close the palette, then run the action on the next frame. */
  function run(action: () => void) {
    onOpenChange(false);
    requestAnimationFrame(action);
  }

  function scrollToPanel(id: string) {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function focusComposer() {
    document
      .querySelector<HTMLTextAreaElement>("[data-prompt-input]")
      ?.focus();
  }

  async function copyInviteLink() {
    if (!workspace) return;
    const pending = toast.loading("Generating invite link…");
    try {
      const res = await fetch(
        `/api/workspaces/${workspace.id}/invites`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Could not create invite");
      }
      const { invite } = (await res.json()) as { invite: { url: string } };
      await navigator.clipboard.writeText(invite.url);
      toast.success("Invite link copied to clipboard", { id: pending });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create invite",
        { id: pending },
      );
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => run(() => scrollToPanel("panel-chat"))}>
            <MessageSquare />
            Go to Conversation
          </CommandItem>
          <CommandItem onSelect={() => run(focusComposer)}>
            <MessageSquare />
            Focus message input
            <CommandShortcut>⏎</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Workspace">
          <CommandItem onSelect={() => run(copyInviteLink)}>
            <Link2 />
            Copy invite link
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))
            }
          >
            {resolvedTheme === "dark" ? <Sun /> : <Moon />}
            Toggle theme
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Account">
          <CommandItem
            onSelect={() => run(() => signOut({ callbackUrl: "/login" }))}
          >
            <LogOut />
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
