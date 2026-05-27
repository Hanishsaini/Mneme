import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { SettingsForm } from "@/features/account/components/settings-form";

/**
 * /settings — account self-service. RSC fetches the user row server-side
 * (so the form has the email + name without an extra round-trip), then
 * hands off to the client form for the three mutation flows.
 *
 * The dashboard layout already enforces auth, but we double-check here
 * so a stray direct hit can't reach the page in an unauthed state.
 */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Pull the canonical row from Postgres — the session JWT may carry stale
  // name/image after a rename, and we want the form prefilled with truth.
  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, passwordHash: true },
  });
  if (!fresh) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 lg:py-14">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to workspaces
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account, password, and data.
        </p>
      </div>

      <SettingsForm
        email={fresh.email}
        initialName={fresh.name}
        hasPassword={Boolean(fresh.passwordHash)}
      />
    </div>
  );
}
