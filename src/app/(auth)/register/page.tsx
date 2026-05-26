import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getServerEnv } from "@/config/env";
import { AuthForm } from "@/features/auth/components/auth-form";

/**
 * /register — same unified form, defaulted to the Create-account tab.
 * Kept as a separate URL so `Sign up` links + the post-invite flow can
 * deeplink straight into the right mode.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const env = getServerEnv();
  const { callbackUrl } = await searchParams;

  return (
    <AuthForm
      initialMode="signup"
      providers={{
        google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        github: Boolean(env.GITHUB_ID && env.GITHUB_SECRET),
      }}
      callbackUrl={callbackUrl}
    />
  );
}
