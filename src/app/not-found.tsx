import Link from "next/link";
import { Compass, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/constants";

/**
 * Global 404 surface — fires for any unmatched route OR an explicit
 * notFound() throw in a server component. New visual system: dark base,
 * one amber accent, no decoration.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-base px-4 text-center">
      <div
        className="mb-5 flex h-12 w-12 items-center justify-center rounded-card"
        style={{ backgroundColor: "var(--accent-amber-subtle)" }}
      >
        <Compass className="h-6 w-6" style={{ color: "var(--accent-amber)" }} />
      </div>

      <p className="type-micro" style={{ color: "var(--accent-amber)" }}>
        404
      </p>
      <h1 className="mt-2 type-display text-ink">Page not found.</h1>
      <p className="mt-2 max-w-md type-body text-ink-secondary">
        That page doesn&apos;t exist — or it might have been a run, workspace,
        or invite that&apos;s since been removed. {APP_NAME} is still right
        here.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button
          asChild
          style={{ backgroundColor: "var(--accent-amber)", color: "var(--bg-base)" }}
        >
          <Link href="/dashboard">Go to your workspaces</Link>
        </Button>
        <Button asChild variant="outline" className="gap-1.5 border-hairline">
          <Link href="/">
            <Home className="h-3.5 w-3.5" />
            Back to home
          </Link>
        </Button>
      </div>
    </div>
  );
}
