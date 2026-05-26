import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getServerEnv } from "@/config/env";
import { AuthForm } from "@/features/auth/components/auth-form";

/**
 * /login — renders the unified auth surface defaulted to Sign-in. The
 * Create-account tab is one click away; we keep /login as a stable URL
 * (callbackUrl deeplinks rely on it, NextAuth's default redirect points
 * here) without showing the user two distinct pages.
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
    <AuthForm
      initialMode="signin"
      providers={{
        google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        github: Boolean(env.GITHUB_ID && env.GITHUB_SECRET),
      }}
      initialError={params.error}
      callbackUrl={params.callbackUrl}
    />
  );
}
