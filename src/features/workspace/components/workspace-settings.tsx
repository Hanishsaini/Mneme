"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { MemberRole } from "@workspace/shared";
import { Badge, HashDisplay } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface MemberRow {
  id: string;
  role: MemberRole;
  name: string | null;
  email: string;
}

/**
 * Workspace settings — three independent sections (Workspace / Security /
 * Members), each owning its own mutation + pending state. Owner-only controls
 * (rename, delete) are disabled for non-owners; the server enforces it too.
 */
export function WorkspaceSettings({
  workspaceId,
  initialName,
  isOwner,
  members,
}: {
  workspaceId: string;
  initialName: string;
  isOwner: boolean;
  members: MemberRow[];
}) {
  return (
    <div className="px-8 py-7">
      <div className="mb-8">
        <h1 className="type-display text-ink">Settings</h1>
        <p className="mt-1 type-body text-ink-secondary">
          Manage this workspace, its members, and its data.
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-6">
        <WorkspaceSection
          workspaceId={workspaceId}
          initialName={initialName}
          isOwner={isOwner}
        />
        <MembersSection workspaceId={workspaceId} members={members} />
        <SecuritySection
          workspaceId={workspaceId}
          name={initialName}
          isOwner={isOwner}
        />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
  danger = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-card border bg-surface p-5",
        danger ? "border-danger/40" : "border-hairline-subtle",
      )}
      style={danger ? { borderColor: "rgba(239,68,68,0.4)" } : undefined}
    >
      <h2 className="type-heading text-ink">{title}</h2>
      {description && (
        <p className="mt-1 type-small text-ink-secondary">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ── Workspace ───────────────────────────────────────────────────── */

function WorkspaceSection({
  workspaceId,
  initialName,
  isOwner,
}: {
  workspaceId: string;
  initialName: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== initialName && name.trim().length > 0;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.status === 403) throw new Error("Only an owner can rename the workspace");
      if (!res.ok) throw new Error("Could not save");
      toast.success("Workspace renamed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Workspace">
      <div className="space-y-4">
        <div>
          <label className="type-micro text-ink-tertiary">Workspace name</label>
          <div className="mt-1.5 flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isOwner}
              className="max-w-sm border-hairline-subtle bg-surface-base"
            />
            {isOwner && (
              <Button size="sm" onClick={save} disabled={!dirty || saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
            )}
          </div>
        </div>
        <div>
          <label className="type-micro text-ink-tertiary">Workspace ID</label>
          <div className="mt-1.5">
            <HashDisplay value={workspaceId} />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

/* ── Members ─────────────────────────────────────────────────────── */

function MembersSection({
  workspaceId,
  members,
}: {
  workspaceId: string;
  members: MemberRow[];
}) {
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  async function invite() {
    if (!email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    setInviting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error("Could not create invite");
      const data = (await res.json()) as { invite?: { url?: string } };
      const url = data.invite?.url;
      if (url) {
        await navigator.clipboard.writeText(url).catch(() => undefined);
        toast.success("Invite link copied to clipboard");
      } else {
        toast.success("Invite created");
      }
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not invite");
    } finally {
      setInviting(false);
    }
  }

  const roleVariant: Record<MemberRole, "warning" | "info" | "neutral"> = {
    OWNER: "warning",
    EDITOR: "info",
    VIEWER: "neutral",
  };

  return (
    <SectionCard
      title="Members"
      description="People with access to this workspace."
    >
      <ul className="divide-y divide-hairline-subtle">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-subtle">
                <span className="type-micro text-ink-secondary">
                  {(m.name ?? m.email).slice(0, 1).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="type-body text-ink">{m.name ?? m.email}</p>
                {m.name && (
                  <p className="type-small text-ink-tertiary">{m.email}</p>
                )}
              </div>
            </div>
            <Badge variant={roleVariant[m.role]} size="sm">
              {m.role}
            </Badge>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center gap-2 border-t border-hairline-subtle pt-4">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !inviting && invite()}
          placeholder="teammate@company.com"
          className="max-w-xs border-hairline-subtle bg-surface-base"
        />
        <Button size="sm" variant="outline" onClick={invite} disabled={inviting}>
          {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Invite"}
        </Button>
      </div>
    </SectionCard>
  );
}

/* ── Security / danger zone ──────────────────────────────────────── */

function SecuritySection({
  workspaceId,
  name,
  isOwner,
}: {
  workspaceId: string;
  name: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const canDelete = isOwner && confirm === name;

  async function remove() {
    if (!canDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete workspace");
      toast.success("Workspace deleted");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
      setDeleting(false);
    }
  }

  return (
    <SectionCard
      title="Security"
      description="Irreversible actions. Proceed with care."
      danger
    >
      <p className="type-body text-ink">Delete this workspace</p>
      <p className="mt-1 type-small text-ink-secondary">
        Permanently removes every run, decision, policy, key, and member. This
        cannot be undone.
        {!isOwner && " Only the workspace owner can do this."}
      </p>
      {isOwner && (
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={`Type "${name}" to confirm`}
            className="max-w-xs border-hairline-subtle bg-surface-base"
          />
          <Button
            size="sm"
            variant="destructive"
            onClick={remove}
            disabled={!canDelete || deleting}
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Delete workspace"
            )}
          </Button>
        </div>
      )}
    </SectionCard>
  );
}
