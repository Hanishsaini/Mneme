import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  BrainCircuit,
  CheckCircle2,
  Github,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME, APP_TAGLINE } from "@/config/constants";

/**
 * Mneme's public landing. Single-screen-ish narrative: hero with the
 * one-line wedge, three concrete value props that map 1:1 to features
 * we've shipped, a quick differentiator vs. the obvious alternatives,
 * and a closing CTA.
 *
 * Pure RSC (no client interactivity needed) so this renders fast on
 * the first paint and never enters the JS budget. Visual style is
 * dark + violet accent; the hero uses a radial-gradient + grid pattern
 * for depth without shipping any image assets.
 */
export function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <BackgroundDecor />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/30">
            <BrainCircuit className="h-4 w-4" />
          </div>
          <span className="text-base font-semibold tracking-tight">
            {APP_NAME}
          </span>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="https://github.com/Hanishsaini/Mneme"
            className="hidden items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github className="h-3.5 w-3.5" />
            GitHub
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild className="bg-violet-500 text-white hover:bg-violet-400">
            <Link href="/register">Get started</Link>
          </Button>
        </nav>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-5">
        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <section className="pb-20 pt-12 text-center sm:pt-20">
          <div className="mx-auto mb-5 inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[11px] font-medium text-violet-300">
            <Sparkles className="h-3 w-3" />
            Team memory that compounds
          </div>
          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
            The memory layer
            <br />
            <span className="bg-gradient-to-r from-violet-300 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              for your team.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            Every decision your team makes, every question still open, every
            commitment — captured automatically, surfaced when it matters,
            never forgotten.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              asChild
              className="gap-1.5 bg-violet-500 text-white hover:bg-violet-400"
            >
              <Link href="/register">
                Start for free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">I already have an account</Link>
            </Button>
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">
            No credit card. Free forever for personal use.
          </p>

          {/* Hero visual — stylized Memory panel preview */}
          <div className="mx-auto mt-16 max-w-4xl">
            <HeroPreview />
          </div>
        </section>

        {/* ── VALUE PROPS ──────────────────────────────────────────────── */}
        <section className="py-16">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Three things every team forgets
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Mneme is built around the failures the existing tools quietly
              cause.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <FeatureCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Decisions stop disappearing"
              body="Every AI conversation produces a clean record of what was decided, what stayed open, and what someone committed to. No more 'wait, did we agree on Postgres?'"
              accent="emerald"
            />
            <FeatureCard
              icon={<Zap className="h-5 w-5" />}
              title="Surfaced before you ask"
              body="As you start typing a new question, the related past discussions show up automatically. The graph of your team's thinking, on tap, with similarity scores."
              accent="violet"
            />
            <FeatureCard
              icon={<BellRing className="h-5 w-5" />}
              title="Stale decisions get flagged"
              body="Decisions rot. Mneme tracks the age of every commitment and pings you when something needs revisiting — before it bites you in the next sprint."
              accent="amber"
            />
          </div>
        </section>

        {/* ── DIFFERENTIATOR ──────────────────────────────────────────── */}
        <section className="py-16">
          <div className="mx-auto max-w-3xl rounded-2xl border bg-card/40 p-8 backdrop-blur sm:p-10">
            <h2 className="text-2xl font-semibold tracking-tight">
              Why not just use ChatGPT, Notion, or Slack?
            </h2>
            <ul className="mt-6 space-y-4 text-sm text-muted-foreground">
              <DiffRow
                tool="ChatGPT"
                problem="forgets the moment you close the tab."
                solution="Mneme remembers across every conversation, forever."
              />
              <DiffRow
                tool="Notion"
                problem="is a graveyard of stale docs nobody reads."
                solution="Mneme is alive — decisions get surfaced when they're relevant."
              />
              <DiffRow
                tool="Slack search"
                problem="is keyword-only, on top of unstructured chatter."
                solution="Mneme is semantic, over the actual decisions your team made."
              />
            </ul>
            <p className="mt-6 border-t pt-6 text-sm text-foreground/80">
              After six months, your team has a decision graph nobody else
              owns. That's the moat — and it compounds the longer you use it.
            </p>
          </div>
        </section>

        {/* ── CLOSING CTA ─────────────────────────────────────────────── */}
        <section className="py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Stop losing what your team already decided.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            Spin up your workspace in under a minute. Bring your AI
            conversations; Mneme handles the rest.
          </p>
          <div className="mt-8">
            <Button
              size="lg"
              asChild
              className="gap-1.5 bg-violet-500 text-white hover:bg-violet-400"
            >
              <Link href="/register">
                Start for free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/60 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-5 text-[11px] text-muted-foreground sm:flex-row">
          <p>
            © {new Date().getFullYear()} {APP_NAME}. {APP_TAGLINE}
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="https://github.com/Hanishsaini/Mneme"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Github className="h-3 w-3" />
              github.com/Hanishsaini/Mneme
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * Stylized preview of the Memory panel. Static markup, no real data —
 * but visually identical enough to the real surface that a visitor sees
 * exactly what they'd get inside the app. Cheaper than maintaining a
 * screenshot asset that goes stale every UI tweak.
 */
function HeroPreview() {
  const items = [
    {
      kind: "DECISION",
      kindColor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      text: "Use Postgres + pgvector for semantic search (avoids second infra dependency)",
      thread: "Auth architecture",
    },
    {
      kind: "QUESTION",
      kindColor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      text: "How will we handle rate-limiting when traffic spikes?",
      thread: "Scaling discussion",
    },
    {
      kind: "ACTION ITEM",
      kindColor: "bg-sky-500/15 text-sky-300 border-sky-500/30",
      text: "Sarah — ship the embeddings migration by Friday",
      thread: "Sprint planning",
    },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border bg-card/60 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b bg-card/40 px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/30">
          <BrainCircuit className="h-3.5 w-3.5" />
        </div>
        <p className="text-sm font-semibold">Team memory</p>
        <span className="ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
          2
        </span>
        <p className="ml-auto text-[10px] text-muted-foreground">
          Extracted automatically as you chat
        </p>
      </div>
      <div className="flex gap-1 border-b bg-card/30 px-4 py-2">
        {["Needs review", "All", "Decisions", "Questions", "Action items"].map(
          (t, i) => (
            <span
              key={t}
              className={
                i === 1
                  ? "rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-foreground"
                  : "rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground"
              }
            >
              {t}
            </span>
          ),
        )}
      </div>
      <ul className="divide-y">
        {items.map((it) => (
          <li
            key={it.text}
            className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-card/40"
          >
            <span
              className={`mt-0.5 shrink-0 rounded border px-1.5 py-0 text-[10px] ${it.kindColor}`}
            >
              {it.kind}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">{it.text}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                from {it.thread}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  accent: "emerald" | "violet" | "amber";
}) {
  const accentClasses = {
    emerald: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
    violet: "bg-violet-500/10 text-violet-400 ring-violet-500/30",
    amber: "bg-amber-500/10 text-amber-400 ring-amber-500/30",
  }[accent];

  return (
    <div className="rounded-2xl border bg-card/40 p-5 backdrop-blur transition-colors hover:bg-card/60">
      <div
        className={`mb-4 flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${accentClasses}`}
      >
        {icon}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function DiffRow({
  tool,
  problem,
  solution,
}: {
  tool: string;
  problem: string;
  solution: string;
}) {
  return (
    <li className="flex flex-col gap-1 border-l-2 border-violet-500/40 pl-4 sm:flex-row sm:items-baseline sm:gap-2">
      <span className="shrink-0 font-medium text-foreground">{tool}</span>
      <span>{problem}</span>
      <span className="text-foreground/80">→ {solution}</span>
    </li>
  );
}

/**
 * Decorative background — a soft radial gradient anchored top-center
 * plus a subtle dotted grid. Pure CSS, no images, no JS. Lives behind
 * everything via `absolute inset-0 z-0` so content sits above it.
 */
function BackgroundDecor() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.15),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
    </>
  );
}
