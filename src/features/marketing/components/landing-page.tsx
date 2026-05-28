import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Brain,
  Eye,
  GitBranch,
  Layers,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/constants";

/**
 * Mneme's public landing — "archive / dossier" aesthetic.
 *
 * Narrative arc, in one scroll:
 *   1. Hero — a real supersession story on screen, before the visitor reads
 *      a single sentence. The moat made visible.
 *   2. The cost of forgetting — the concrete pain in two beats.
 *   3. How it works — Capture → Connect → Evolve, mapped to the actual
 *      three engineering commits behind the product.
 *   4. The moat — what Mneme exposes that no chat product can.
 *   5. vs the world — ChatGPT / Notion / Slack / mem0, each in a sentence.
 *   6. Closing CTA.
 *
 * Pure RSC, no client interactivity, no image assets. Serif headlines for
 * the dossier register; amber for every accent; mono for IDs/timestamps.
 */
export function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground paper-grain">
      <AmberGlow />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-2.5">
          <MnemeMark />
          <span className="font-serif text-lg font-medium tracking-tight">
            {APP_NAME}
          </span>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="https://github.com/Hanishsaini/Mneme"
            className="hidden items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            target="_blank"
            rel="noopener noreferrer"
          >
            <GitBranch className="h-3.5 w-3.5" />
            Source
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button
            size="sm"
            asChild
            className="gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Link href="/register">
              Open a workspace
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </nav>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-5">
        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <section className="pb-20 pt-10 sm:pt-16">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-6">
              <p className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
                <Sparkles className="h-3 w-3" />
                Mneme · v0.1 · open beta
              </p>
              <h1 className="font-serif text-[44px] font-medium leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
                Your team already
                <br />
                decided this.{" "}
                <span className="text-primary">Mneme remembers.</span>
              </h1>
              <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
                Every AI conversation your team has becomes durable, queryable,
                self-correcting memory — capturing what was decided, when it was
                revised, and{" "}
                <span className="font-serif italic text-foreground/90">why</span>{" "}
                the team changed its mind.
              </p>
              <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <Button
                  size="lg"
                  asChild
                  className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Link href="/register">
                    Start your archive
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Link
                  href="#how-it-works"
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  See how it works
                  <ArrowDown className="h-3 w-3" />
                </Link>
              </div>
              <p className="mt-5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                Free forever for personal use · No card · Self-host friendly
              </p>
            </div>

            <div className="lg:col-span-6">
              <SupersessionDemo />
            </div>
          </div>
        </section>

        {/* ── THE COST OF FORGETTING ──────────────────────────────────── */}
        <section className="border-t border-border/60 py-20">
          <DossierLabel>The problem</DossierLabel>
          <h2 className="mt-3 max-w-3xl font-serif text-3xl font-medium leading-[1.15] tracking-tight sm:text-4xl">
            On Tuesday you chose Postgres. On Friday someone reopens the
            database question.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Chat AIs lose state the moment you close the tab. Notion turns into
            a graveyard of stale docs nobody reads. Slack search is keyword soup
            over chatter. Every decision your team makes gets relitigated until
            someone gives up — and the work of remembering becomes the work
            itself.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <PainCard
              number="01"
              title="Decisions vanish"
              body="The decision was real. The thread is gone. The team relitigates."
            />
            <PainCard
              number="02"
              title="Reversals disappear"
              body="You changed your mind in March. By June, the original is back, with no record of why you ever moved off it."
            />
            <PainCard
              number="03"
              title="Onboarding burns"
              body="New teammates ask the same eight questions, get answers from people who half-remember."
            />
          </div>
        </section>

        {/* ── HOW IT WORKS ────────────────────────────────────────────── */}
        <section id="how-it-works" className="border-t border-border/60 py-20">
          <DossierLabel>How it works</DossierLabel>
          <h2 className="mt-3 max-w-3xl font-serif text-3xl font-medium leading-[1.15] tracking-tight sm:text-4xl">
            Three layers, each watching the one above it.
          </h2>
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
            Memory in Mneme isn't a feature bolted onto chat — it's three
            distinct stages, each a real engineering layer, each visible inside
            the product.
          </p>

          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border/70 bg-border/70 sm:grid-cols-3">
            <StageCard
              step="I"
              title="Capture"
              icon={<ScrollText className="h-4 w-4" />}
              body="As you chat, an extractor reads every exchange and writes structured items — decisions, open questions, commitments, context. Fire-and-forget. Never blocks the response."
              tech="LLM-driven extraction · mem0-style operation emitter"
            />
            <StageCard
              step="II"
              title="Connect"
              icon={<Layers className="h-4 w-4" />}
              body="Every message gets embedded into a workspace-scoped vector + keyword index. Retrieval fuses pgvector cosine with Postgres BM25 via reciprocal rank fusion — proper nouns + concepts, both."
              tech="pgvector 768d · ts_rank_cd BM25 · RRF k=60"
            />
            <StageCard
              step="III"
              title="Evolve"
              icon={<GitBranch className="h-4 w-4" />}
              body="When the team revises a decision, Mneme detects the supersession, links the new row to the old one in a directed graph, and writes the LLM-generated reason for the change. History is preserved, not overwritten."
              tech="Supersession FK · soft-resolve on reversal"
              isLast
            />
          </div>
        </section>

        {/* ── THE MOAT ────────────────────────────────────────────────── */}
        <section className="border-t border-border/60 py-20">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <DossierLabel>What no chat product has</DossierLabel>
              <h2 className="mt-3 font-serif text-3xl font-medium leading-[1.15] tracking-tight sm:text-4xl">
                A graph of how your team's thinking has{" "}
                <span className="font-serif italic text-primary">changed</span>.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground">
                Every other tool gives you the latest answer. Mneme gives you
                the latest answer{" "}
                <span className="font-serif italic text-foreground/90">
                  and the trail behind it
                </span>{" "}
                — what you originally chose, when you moved off it, and the
                reasoning that drove the shift. It's the difference between a
                whiteboard and an institutional memory.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                After six months of use, you have a decision graph that no other
                team can replicate. That's the moat. It compounds the longer
                you use it.
              </p>
            </div>
            <div className="lg:col-span-7">
              <ChainPreview />
            </div>
          </div>
        </section>

        {/* ── VS THE WORLD ────────────────────────────────────────────── */}
        <section className="border-t border-border/60 py-20">
          <DossierLabel>How Mneme is different</DossierLabel>
          <h2 className="mt-3 max-w-2xl font-serif text-3xl font-medium leading-[1.15] tracking-tight sm:text-4xl">
            What you can't get anywhere else.
          </h2>
          <div className="mt-10 divide-y divide-border/60 border-y border-border/60">
            <DiffRow
              tool="ChatGPT / Claude"
              their="Forgets the moment you close the tab. No team layer."
              ours="Persistent, workspace-scoped, semantic — across every conversation, forever."
            />
            <DiffRow
              tool="Notion AI"
              their="Writes inside static docs. Nobody comes back to read them."
              ours="Decisions surface themselves the next time the question comes up."
            />
            <DiffRow
              tool="Slack search"
              their="Keyword-only, on top of unstructured chatter."
              ours="Semantic + keyword fusion, over the structured decisions your team made."
            />
            <DiffRow
              tool="mem0 / supermemory"
              their="Developer SDKs. You build the surface yourself."
              ours="Full product, with the supersession graph as a first-class UI."
            />
          </div>
        </section>

        {/* ── CLOSING CTA ─────────────────────────────────────────────── */}
        <section className="py-24 text-center">
          <DossierLabel className="justify-center">
            Open a workspace
          </DossierLabel>
          <h2 className="mt-3 font-serif text-3xl font-medium leading-[1.1] tracking-tight sm:text-4xl">
            Stop losing what your team already decided.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
            Sixty seconds to spin up. Bring an AI conversation. Watch Mneme
            start the archive.
          </p>
          <div className="mt-8">
            <Button
              size="lg"
              asChild
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Link href="/register">
                Start your archive
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/60 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:flex-row">
          <p>
            © {new Date().getFullYear()} · {APP_NAME} · Memory layer for teams
          </p>
          <Link
            href="https://github.com/Hanishsaini/Mneme"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <GitBranch className="h-3 w-3" />
            github · Hanishsaini/Mneme
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </footer>
    </div>
  );
}

/* ─── Components ──────────────────────────────────────────────────── */

/**
 * The hero demonstration — a real-looking supersession card. Three beats:
 * originally (struck-through), now (the new decision), why (the LLM's
 * generated reason). This is the moat surface, shown in full before any
 * value-prop copy. A visitor groks Mneme by looking at it.
 */
function SupersessionDemo() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-3xl bg-primary/[0.05] blur-2xl" />
      <article className="rounded-2xl border border-border/80 bg-card/95 p-6 shadow-2xl shadow-primary/10 backdrop-blur">
        <header className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
              <GitBranch className="h-2.5 w-2.5" />
              Revised
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Decision · 3 revisions
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            mem_3f8a · today
          </span>
        </header>

        <div className="grid grid-cols-[68px_1fr] gap-x-3 gap-y-2 text-sm">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Originally
          </span>
          <span className="font-serif text-base italic leading-snug text-muted-foreground line-through decoration-muted-foreground/40">
            Mneme will use WebSockets for real-time presence + canvas sync
            across the workspace.
          </span>
        </div>

        <div className="my-4 flex items-center gap-2 text-muted-foreground/60">
          <span className="h-px flex-1 bg-border" />
          <ArrowDown className="h-3 w-3" />
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="grid grid-cols-[68px_1fr] gap-x-3 gap-y-2 text-sm">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Now
          </span>
          <span className="font-serif text-base leading-snug text-foreground">
            SSE over async generator for AI streaming; presence + canvas
            deferred until they leave the v0 backlog.
          </span>
        </div>

        <div className="mt-5 rounded-md border border-primary/20 bg-primary/[0.06] px-3 py-2.5">
          <p className="mb-1 font-mono text-[9px] uppercase tracking-wider text-primary/80">
            Why the team changed its mind
          </p>
          <p className="text-[13px] leading-snug text-foreground/85">
            Socket-server deploy complexity didn't earn its keep for a v0
            surface we don't ship to users yet. Revisit when canvas + presence
            leave backlog.
          </p>
        </div>

        <footer className="mt-5 flex items-center justify-between border-t border-border/50 pt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>From conversation · &ldquo;Realtime architecture&rdquo;</span>
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" />
            Surfaced when relevant
          </span>
        </footer>
      </article>
    </div>
  );
}

/**
 * Chain preview for the "What no chat product has" section — a vertical
 * supersession thread with three nodes (original → revised → revised
 * again) and the LLM-written rationale on each edge. Different surface
 * from the hero card (which shows ONE decision); this shows the WALK.
 */
function ChainPreview() {
  const nodes = [
    {
      date: "Mar 12",
      op: "Original",
      text: "Hand-rolled BM25 against the messages table; defer vector search until traffic justifies the infra.",
      reason: null,
      live: false,
    },
    {
      date: "Apr 02",
      op: "Revised",
      text: "Add pgvector; cosine search complements BM25 for conceptual queries.",
      reason: "Keyword-only retrieval was missing decisions phrased differently from how they were searched.",
      live: false,
    },
    {
      date: "May 27",
      op: "Revised",
      text: "Fuse both via reciprocal rank fusion (k=60). Both signals contribute every query.",
      reason: "RRF beats either source alone on the eval set; parameter-free, one-CTE round-trip.",
      live: true,
    },
  ];

  return (
    <div className="rounded-2xl border border-border/80 bg-card/80 p-6 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-serif text-sm font-medium tracking-tight">
          Decision: how Mneme should retrieve memory
        </p>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          3 revisions · 76 days
        </span>
      </div>
      <ol className="relative space-y-5">
        <span
          aria-hidden
          className="absolute left-[7px] top-2 bottom-2 w-px bg-border"
        />
        {nodes.map((n, i) => (
          <li key={i} className="relative pl-7">
            <span
              className={
                n.live
                  ? "absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-primary bg-primary/20"
                  : "absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-border bg-card"
              }
            />
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {n.date} · {n.op}
              </span>
              {n.live && (
                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
                  Live
                </span>
              )}
            </div>
            <p
              className={
                n.live
                  ? "mt-1 font-serif text-[15px] leading-snug text-foreground"
                  : "mt-1 font-serif text-[15px] leading-snug text-muted-foreground"
              }
            >
              {n.text}
            </p>
            {n.reason && (
              <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground/90">
                <span className="font-mono text-[9px] uppercase tracking-wider text-primary/80">
                  Why ·
                </span>{" "}
                {n.reason}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function PainCard({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/50 p-5">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        № {number}
      </p>
      <p className="mt-3 font-serif text-lg font-medium tracking-tight">
        {title}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function StageCard({
  step,
  title,
  icon,
  body,
  tech,
  isLast,
}: {
  step: string;
  title: string;
  icon: React.ReactNode;
  body: string;
  tech: string;
  isLast?: boolean;
}) {
  return (
    <div className="relative bg-card/80 p-6 sm:p-7">
      <div className="flex items-center gap-2 text-primary">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/30">
          {icon}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
          Stage {step}
        </span>
      </div>
      <h3 className="mt-4 font-serif text-2xl font-medium tracking-tight">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
      <p className="mt-5 border-t border-border/60 pt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
        {tech}
      </p>
      {!isLast && (
        <ArrowRight
          aria-hidden
          className="absolute right-0 top-1/2 hidden h-4 w-4 -translate-y-1/2 translate-x-1/2 rounded-full bg-background p-0.5 text-muted-foreground sm:block"
        />
      )}
    </div>
  );
}

function DiffRow({
  tool,
  their,
  ours,
}: {
  tool: string;
  their: string;
  ours: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 py-6 sm:grid-cols-[180px_1fr_1fr] sm:gap-8">
      <p className="font-serif text-lg font-medium tracking-tight">{tool}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
          Them ·{" "}
        </span>
        {their}
      </p>
      <p className="text-sm leading-relaxed text-foreground/90">
        <span className="font-mono text-[9px] uppercase tracking-wider text-primary">
          Mneme ·{" "}
        </span>
        {ours}
      </p>
    </div>
  );
}

function DossierLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={
        "inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-primary " +
        (className ?? "")
      }
    >
      <span className="h-px w-6 bg-primary/60" />
      {children}
    </p>
  );
}

/**
 * Compact wordmark — a serif "M" inside a soft-amber square. Replaces the
 * generic brain-circuit lucide icon. Pure CSS, no asset.
 */
function MnemeMark() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/30">
      <Brain className="h-4 w-4 text-primary" strokeWidth={1.75} />
    </div>
  );
}

/**
 * Soft amber glow anchored top-right + a hairline grid below — keeps the
 * dossier surface from feeling flat without competing with the hero card.
 */
function AmberGlow() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top_right,hsl(32_95%_58%/0.12),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
      />
    </>
  );
}
