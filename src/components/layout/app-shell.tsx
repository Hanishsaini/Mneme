"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BrainCircuit,
  ChevronsUpDown,
  LayoutGrid,
  ListChecks,
  Menu,
  MessageSquare,
  Settings as SettingsIcon,
  Shield,
  X,
} from "lucide-react";
import { APP_NAME } from "@/config/constants";
import { cn, initials } from "@/lib/utils";

/**
 * The app shell — a 220px fixed left sidebar with everything in it, no top
 * navbar. Content fills the rest, edge-to-edge with 32px internal padding.
 * Surfaces pass their `active` nav key; the shell never guesses from the URL
 * so it stays a dumb, predictable frame.
 *
 * Visual register: sidebar on --bg-surface (a step up from the --bg-base
 * content), active item gets white text + a 2px amber left bar + elevated
 * ground. Dev-tools calm — one accent, lots of breathing room.
 */

export type NavKey =
  | "overview"
  | "decisions"
  | "memory"
  | "policies"
  | "settings";

interface NavItem {
  key: NavKey;
  label: string;
  icon: typeof LayoutGrid;
  href: (workspaceId: string) => string;
}

// One nav for the whole product. Overview is the workspace landing;
// Decisions is the agent audit surface (the 5-tab shell); Memory is the
// unified decision + conversation timeline; Policies is promoted from a
// tab to a first-class destination. Chat is a secondary surface, linked
// from the footer rather than the primary nav.
const NAV: NavItem[] = [
  { key: "overview", label: "Overview", icon: LayoutGrid, href: (w) => `/w/${w}` },
  { key: "decisions", label: "Decisions", icon: Shield, href: (w) => `/w/${w}/audit` },
  { key: "memory", label: "Memory", icon: BrainCircuit, href: (w) => `/w/${w}/memory` },
  { key: "policies", label: "Policies", icon: ListChecks, href: (w) => `/w/${w}/policies` },
  { key: "settings", label: "Settings", icon: SettingsIcon, href: (w) => `/w/${w}/settings` },
];

export function AppShell({
  workspaceId,
  workspaceName,
  active,
  userName,
  userEmail,
  children,
}: {
  workspaceId: string;
  workspaceName: string;
  active: NavKey;
  userName: string | null;
  userEmail: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <div className="flex h-full flex-col bg-surface">
      {/* Wordmark */}
      <div className="flex items-center gap-2 px-5 pb-4 pt-5">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: "var(--accent-amber)" }}
        />
        <span className="text-[16px] font-semibold tracking-tight text-ink">
          {APP_NAME}
        </span>
      </div>

      {/* Workspace selector */}
      <div className="px-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-field px-2 py-1.5 transition-colors hover:bg-surface-elevated"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded bg-surface-overlay">
            <span className="type-micro text-ink-secondary">
              {initials(workspaceName)}
            </span>
          </div>
          <span className="flex-1 truncate text-[14px] text-ink">
            {workspaceName}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" />
        </Link>
      </div>

      <div className="mx-3 my-3 border-t border-hairline-subtle" />

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href(workspaceId)}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "relative flex items-center gap-2.5 rounded-field px-2.5 py-2 text-[14px] transition-colors duration-100",
                isActive
                  ? "bg-surface-elevated text-ink"
                  : "text-ink-secondary hover:bg-surface-elevated hover:text-ink",
              )}
            >
              {isActive && (
                <span
                  className="absolute inset-y-1.5 left-0 w-0.5 rounded-full"
                  style={{ backgroundColor: "var(--accent-amber)" }}
                />
              )}
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer: chat shortcut + user + shortcut hint */}
      <div className="mt-3 space-y-2 border-t border-hairline-subtle px-3 py-3">
        <Link
          href={`/w/${workspaceId}/chat`}
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-2.5 rounded-field px-2.5 py-2 text-[14px] text-ink-secondary transition-colors hover:bg-surface-elevated hover:text-ink"
        >
          <MessageSquare className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          Chat
        </Link>
        <div className="flex items-center gap-2 px-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-subtle">
            <span className="type-micro text-ink-secondary">
              {initials(userName ?? userEmail)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-ink-secondary">
              {userName ?? userEmail}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-1 type-small text-ink-tertiary">
          <span>Shortcuts</span>
          <kbd className="rounded border border-hairline-subtle bg-surface-overlay px-1 py-0.5 font-mono text-[10px] text-ink-secondary">
            ?
          </kbd>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-surface-base">
      {/* Desktop sidebar */}
      <aside className="hidden w-[220px] shrink-0 border-r border-hairline-subtle lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[260px] border-r border-hairline-subtle lg:hidden">
            {sidebar}
          </aside>
        </>
      )}

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-hairline-subtle px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="text-ink-secondary"
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: "var(--accent-amber)" }}
            />
            <span className="text-[15px] font-semibold text-ink">{APP_NAME}</span>
          </span>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
