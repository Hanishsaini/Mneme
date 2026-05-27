"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/constants";

/**
 * Per-segment error boundary. Fires for any uncaught render-time error
 * below /app, NOT for global-app-shell crashes (those go to
 * global-error.tsx) and NOT for handled API errors (those bubble through
 * JSON via the route handler wrapper).
 *
 * `digest` is the redacted server-side error id Next stamps; useful in
 * production logs to match a user report to the actual stack trace
 * without leaking internals.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] uncaught error:", error);
  }, [error]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 text-center">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_30%,hsl(0_70%_50%/0.10),transparent_60%)]" />

      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/30">
        <AlertTriangle className="h-6 w-6" />
      </div>

      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-destructive/80">
        Something broke
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        {APP_NAME} hit an unexpected error.
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The error has been logged. Try again — most transient issues clear up
        on a retry. If this keeps happening, your last conversation is safe;
        head back to the dashboard and reopen it.
      </p>

      {error.digest && (
        <p className="mt-3 text-[10px] font-mono text-muted-foreground/60">
          ref: {error.digest}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
