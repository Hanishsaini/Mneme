import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getServerEnv } from "@/config/env";
import { LoginForm } from "@/features/auth/components/login-form";

/**
 * Server entry. Resolves which OAuth providers are wired up + reads any
 * `?error=` from a previous attempt, then hands off to the client form.
 * Email+password is always available; OAuth buttons surface conditionally.
 * Authenticated users skip the page entirely.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const env = getServerEnv();
  const params = await searchParams;

  return (
    <LoginForm
      providers={{
        google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        github: Boolean(env.GITHUB_ID && env.GITHUB_SECRET),
      }}
      initialError={params.error}
      callbackUrl={params.callbackUrl}
    />
  );
}
