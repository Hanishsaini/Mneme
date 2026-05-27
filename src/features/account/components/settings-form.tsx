"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/features/auth/components/password-input";
import { PasswordStrengthMeter } from "@/features/auth/components/password-strength-meter";
import { scorePassword } from "@/features/auth/lib/password-strength";

/**
 * Three independent sections in three cards: profile, password, danger
 * zone. Each runs its own mutation and shows its own pending/error state
 * — coupling them via a shared form state would just make every action
 * gate on the others.
 *
 * The delete-account flow requires the user to type their email as a
 * final guard rail (matches GitHub / Vercel / Stripe). Once confirmed,
 * we hit the endpoint, sign out client-side, and push to /.
 */
export function SettingsForm({
  email,
  initialName,
  hasPassword,
}: {
  email: string;
  initialName: string | null;
  hasPassword: boolean;
}) {
  return (
    <div className="space-y-6">
      <ProfileSection email={email} initialName={initialName} />
      {hasPassword ? (
        <PasswordSection email={email} />
      ) : (
        <SsoOnlySection />
      )}
      <DangerZone email={email} hasPassword={hasPassword} />
    </div>
  );
}

function ProfileSection({
  email,
  initialName,
}: {
  email: string;
  initialName: string | null;
}) {
  const { update } = useSession();
  const [name, setName] = useState(initialName ?? "");
  const [pending, setPending] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not save");
      // Refresh the in-memory NextAuth session so the header avatar /
      // account menu pick up the new name without a hard reload.
      await update();
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setPending(false);
    }
  }

  return (
    <Section title="Profile" description="How your name appears across Mneme.">
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Email
          </label>
          <Input value={email} disabled className="cursor-not-allowed" />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Email changes aren't supported yet. Reach out if you need this.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Display name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            disabled={pending}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

function PasswordSection({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const strength = scorePassword(next, email);
    if (strength.blocked) {
      setError(strength.hint || "Pick a stronger password.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: current,
          newPassword: next,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not change password");
      toast.success("Password updated");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setPending(false);
    }
  }

  return (
    <Section
      title="Password"
      description="12+ characters. Long passphrases beat shorter complex ones."
    >
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Current password
          </label>
          <PasswordInput
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={pending}
            autoComplete="current-password"
            placeholder="Current password"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            New password
          </label>
          <div className="space-y-1.5">
            <PasswordInput
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={pending}
              autoComplete="new-password"
              placeholder="New password (12+ characters)"
            />
            <PasswordStrengthMeter password={next} email={email} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Confirm new password
          </label>
          <PasswordInput
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={pending}
            autoComplete="new-password"
            placeholder="Confirm new password"
          />
        </div>
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={pending || !current || !next || !confirm}>
            {pending ? "Updating…" : "Update password"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

function SsoOnlySection() {
  return (
    <Section
      title="Password"
      description="This account uses single sign-on."
    >
      <p className="text-sm text-muted-foreground">
        Manage your password from the provider you signed in with.
      </p>
    </Section>
  );
}

function DangerZone({
  email,
  hasPassword,
}: {
  email: string;
  hasPassword: boolean;
}) {
  const router = useRouter();
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete =
    hasPassword && confirmEmail.trim().toLowerCase() === email && password.length > 0;

  async function nuke(e: React.FormEvent) {
    e.preventDefault();
    if (!canDelete) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: password }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not delete account");
      // Sign out + bounce. The cookie can't authenticate any further
      // calls since the user row is gone, but signOut clears it cleanly.
      await signOut({ redirect: false });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete account");
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
      <div className="mb-3 flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div>
          <h2 className="text-sm font-semibold text-destructive">
            Delete account
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Permanently removes your account, every workspace you own, and
            every chat in those workspaces. This is irreversible.
          </p>
        </div>
      </div>

      {hasPassword ? (
        <form onSubmit={nuke} className="space-y-2.5">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Type your email to confirm
            </label>
            <Input
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={email}
              disabled={pending}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Current password
            </label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              autoComplete="current-password"
              placeholder="Current password"
            />
          </div>
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="destructive"
            disabled={!canDelete || pending}
            className="gap-1.5"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {pending ? "Deleting account…" : "Delete my account"}
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">
          Account deletion via this form is only available for password-based
          accounts. Disconnect from your SSO provider first.
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card/40 p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
