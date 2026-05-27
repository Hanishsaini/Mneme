import Link from "next/link";
import { BrainCircuit, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/constants";

/**
 * Global 404 surface — fires for any unmatched route OR for an explicit
 * notFound() throw inside a server component. Mirrors the landing-page
 * brand language so a mistyped URL doesn't leak the user out of the
 * product into a generic Next.js page.
 *
 * Pure RSC; no client interactivity needed, so the JS budget stays at
 * zero for this surface.
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 text-center">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_30%,hsl(263_70%_50%/0.12),transparent_60%)]" />

      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/30">
        <BrainCircuit className="h-6 w-6" />
      </div>

      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-300/80">
        404
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        Page not found.
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        That page doesn't exist — or it might have been a thread, workspace,
        or invite that's since been removed. {APP_NAME} is still right here.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href="/dashboard">Go to your workspaces</Link>
        </Button>
        <Button asChild variant="outline" className="gap-1.5">
          <Link href="/">
            <Search className="h-3.5 w-3.5" />
            Back to home
          </Link>
        </Button>
      </div>
    </div>
  );
}
