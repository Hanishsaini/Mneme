"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
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

const PASSWORD_MIN_LENGTH = 12;

export function RegistrationForm({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = callbackUrl ?? "/dashboard";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side pre-flight; server re-validates regardless.
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setPending(true);
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
        | { error?: string; user?: unknown }
        | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "Could not create account");
      }

      // Auto sign-in. The signIn call uses NextAuth's CredentialsProvider
      // which verifies the freshly-set password and mints a session cookie.
      const signin = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl: next,
      });
      if (signin?.error) {
        throw new Error(
          "Account created but sign-in failed. Try signing in from /login.",
        );
      }

      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-sm glass">
      <CardHeader>
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>
          Get a free {APP_NAME} workspace in 30 seconds.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={pending}
            autoComplete="email"
          />
          <Input
            type="text"
            placeholder="Your name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            autoComplete="name"
          />
          <Input
            type="password"
            placeholder={`Password (${PASSWORD_MIN_LENGTH}+ characters)`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={pending}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
          />
          <Input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            disabled={pending}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={pending || !email || password.length < PASSWORD_MIN_LENGTH}
          >
            {pending ? "Creating account…" : "Create account"}
          </Button>
          {error && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </p>
          )}
        </form>
      </CardContent>
      <CardFooter className="justify-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="ml-1 text-primary underline">
          Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
