"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { BrainCircuit, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { APP_NAME, APP_TAGLINE } from "@/config/constants";
import { PasswordInput } from "./password-input";
import { PasswordStrengthMeter } from "./password-strength-meter";
import { scorePassword } from "../lib/password-strength";

/**
 * Unified sign-in / sign-up surface. Replaces the prior split between
 * /login and /register so a returning user and a brand-new one land on
 * the same page and just pick the right tab. Both /login and /register
 * still exist as routes — they just both render this component with the
 * appropriate `initialMode` so a `/register?callbackUrl=…` flow keeps
 * working.
 */

type Mode = "signin" | "signup";

const ERROR_MESSAGES: Record<string, string> = {
  // Generic — no enumeration. "Wrong password", "no account",
  // "rate-limited" all map to one message at the UI.
  CredentialsSignin: "Invalid email or password.",
  OAuthAccountNotLinked:
    "That email is already linked to a different sign-in method. Use the original provider.",
  AccessDenied: "Access denied. You may not have permission to sign in.",
  Configuration: "Authentication is misconfigured on the server.",
  default: "Could not sign in. Please try again.",
};

export interface AuthFormProps {
  initialMode: Mode;
  providers: {
    google: boolean;
    github: boolean;
  };
  initialError?: string;
  callbackUrl?: string;
}

export function AuthForm({
  initialMode,
  providers,
  initialError,
  callbackUrl,
}: AuthFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    initialError ? (ERROR_MESSAGES[initialError] ?? ERROR_MESSAGES.default) : null,
  );
  const [_, startTransition] = useTransition();

  const next = callbackUrl ?? "/dashboard";
  const hasOAuth = providers.google || providers.github;

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setConfirm("");
  }

  async function handleSignIn(e: React.FormEvent) {
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
    startTransition(() => {
      router.push(next);
      router.refresh();
    });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side gate; server re-validates regardless. Mirrors the
    // server's `validatePasswordStrength` so the user sees the same
    // verdict before submission.
    const strength = scorePassword(password, email);
    if (strength.blocked) {
      setError(strength.hint || "Pick a stronger password.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setPending("register");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not create account");

      const signin = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl: next,
      });
      if (signin?.error) {
        throw new Error(
          "Account created but sign-in failed. Try signing in.",
        );
      }
      startTransition(() => {
        router.push(next);
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="w-full max-w-md">
      {/* Brand block — sits ABOVE the card so the product identity is the
          first thing the user reads, not the form. */}
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <BrainCircuit className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{APP_TAGLINE}</p>
      </div>

      <div className="rounded-2xl border bg-card/60 p-1 shadow-2xl backdrop-blur">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/40 p-1">
          <TabButton
            active={mode === "signin"}
            onClick={() => switchMode("signin")}
          >
            Sign in
          </TabButton>
          <TabButton
            active={mode === "signup"}
            onClick={() => switchMode("signup")}
          >
            Create account
          </TabButton>
        </div>

        <div className="px-5 py-5">
          {mode === "signin" ? (
            <form onSubmit={handleSignIn} className="space-y-3">
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={pending !== null}
                autoComplete="email"
              />
              <PasswordInput
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
          ) : (
            <form onSubmit={handleSignUp} className="space-y-3">
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
                type="text"
                placeholder="Your name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending !== null}
                autoComplete="name"
              />
              <div className="space-y-1.5">
                <PasswordInput
                  placeholder="Password (12+ characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={pending !== null}
                  autoComplete="new-password"
                />
                <PasswordStrengthMeter password={password} email={email} />
              </div>
              <PasswordInput
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                disabled={pending !== null}
                autoComplete="new-password"
              />
              <Button
                type="submit"
                className="w-full"
                disabled={pending !== null || !email || !password || !confirm}
              >
                {pending === "register" ? "Creating account…" : "Create account"}
              </Button>
            </form>
          )}

          {hasOAuth && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
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
                    {pending === "google" ? "Redirecting…" : "Continue with Google"}
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
                    {pending === "github" ? "Redirecting…" : "Continue with GitHub"}
                  </Button>
                )}
              </div>
            </>
          )}

          {error && (
            <p className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        By continuing, you agree to keep your chats private and never share your
        password.
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
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
