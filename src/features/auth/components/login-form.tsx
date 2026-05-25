"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_NAME } from "@/config/constants";

const ERROR_MESSAGES: Record<string, string> = {
  // Generic message across every credential failure — no enumeration. Don't
  // distinguish "wrong password", "no account", "rate-limited" here.
  CredentialsSignin: "Invalid email or password.",
  OAuthAccountNotLinked:
    "That email is already linked to a different sign-in method. Use the original provider.",
  AccessDenied: "Access denied. You may not have permission to sign in.",
  Configuration: "Authentication is misconfigured on the server.",
  default: "Could not sign in. Please try again.",
};

export interface LoginFormProps {
  providers: {
    google: boolean;
    github: boolean;
  };
  initialError?: string;
  callbackUrl?: string;
}

/**
 * Email + password login. OAuth providers (Google/GitHub) appear below
 * as alternatives when their env keys are configured; if neither is set,
 * the form is just email + password.
 */
export function LoginForm({
  providers,
  initialError,
  callbackUrl,
}: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    initialError
      ? (ERROR_MESSAGES[initialError] ?? ERROR_MESSAGES.default)
      : null,
  );

  const next = callbackUrl ?? "/dashboard";

  async function handleCredentialsLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending("credentials");
    const res = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
      callbackUrl: next,
    });
    setPending(null);
    if (res?.error) {
      setError(ERROR_MESSAGES.CredentialsSignin);
      return;
    }
    router.push(next);
    router.refresh();
  }

  const hasOAuth = providers.google || providers.github;
  const registerHref = `/register${
    callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""
  }`;

  return (
    <Card className="w-full max-w-sm glass">
      <CardHeader>
        <CardTitle className="text-xl">{APP_NAME}</CardTitle>
        <CardDescription>
          Sign in to your collaborative workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleCredentialsLogin} className="space-y-3">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={pending !== null}
            autoComplete="email"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={pending !== null}
            autoComplete="current-password"
          />
          <Button
            type="submit"
            className="w-full"
            disabled={pending !== null || !email || !password}
          >
            {pending === "credentials" ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        {hasOAuth && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                <span className="bg-card px-2 text-muted-foreground">
                  or continue with
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {providers.google && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center gap-2"
                  disabled={pending !== null}
                  onClick={() => {
                    setPending("google");
                    signIn("google", { callbackUrl: next });
                  }}
                >
                  <GoogleIcon />
                  {pending === "google" ? "Redirecting…" : "Google"}
                </Button>
              )}
              {providers.github && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center gap-2"
                  disabled={pending !== null}
                  onClick={() => {
                    setPending("github");
                    signIn("github", { callbackUrl: next });
                  }}
                >
                  <Github />
                  {pending === "github" ? "Redirecting…" : "GitHub"}
                </Button>
              )}
            </div>
          </>
        )}

        {error && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-center text-xs text-muted-foreground">
        Don&apos;t have an account?
        <Link href={registerHref} className="ml-1 text-primary underline">
          Sign up
        </Link>
      </CardFooter>
    </Card>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 11v3.4h4.8c-.2 1.2-1.5 3.4-4.8 3.4-2.9 0-5.2-2.4-5.2-5.3S9.1 7.2 12 7.2c1.6 0 2.8.7 3.4 1.3l2.3-2.2C16.3 4.9 14.3 4 12 4 7.6 4 4 7.6 4 12s3.6 8 8 8c4.6 0 7.7-3.2 7.7-7.8 0-.5-.1-.9-.1-1.2H12z"
      />
    </svg>
  );
}
