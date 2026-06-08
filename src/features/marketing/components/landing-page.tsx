"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  GitBranch,
  ListChecks,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { Badge, CodeBlock } from "@/components/design";
import { cn } from "@/lib/utils";

/**
 * Public landing — "bold & alive". Dark, but with presence: a real amber
 * glow, a heavy headline that leads with the stakes, and a big center-stage
 * demo of the product working (decision cards stack in → amber supersession
 * callout → red HIGH violation, forever). Sections reveal on scroll.
 */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-base text-ink">
      <Hero />
      <Primitives />
      <Integration />
      <Compliance />
      <FooterCta />
    </div>
  );
}

/* ── Scroll reveal ─────────────────────────────────────────────────── */

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700 ease-out",
        shown ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0",
        className,
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ── Section 1 — Hero ──────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Big amber glow — the brand actually registers now. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px]"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% -8%, rgba(245,158,11,0.18), transparent 70%)",
        }}
      />

      <div className="mx-auto max-w-4xl px-6 pb-14 pt-24 text-center sm:pt-28">
        <p
          className="type-micro"
          style={{ color: "var(--accent-amber)", letterSpacing: "0.12em" }}
        >
          Behavioral memory for AI agents
        </p>

        <h1 className="mx-auto mt-5 max-w-3xl text-[clamp(40px,7vw,64px)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
          Your agents forget.{" "}
          <span style={{ color: "var(--accent-amber)" }}>Mneme remembers.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-secondary">
          Log every decision, catch contradictions before they cause damage,
          enforce policies in real time, and export a tamper-evident proof
          trail — in one SDK call.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex h-11 items-center justify-center rounded-field px-5 text-[15px] font-medium shadow-elev2 transition-all hover:opacity-90 hover:shadow-elev3"
            style={{ backgroundColor: "var(--accent-amber)", color: "var(--bg-base)" }}
          >
            Start free
          </Link>
          <Link
            href="#integrate"
            className="inline-flex h-11 items-center justify-center rounded-field border border-hairline px-5 text-[15px] font-medium text-ink transition-colors hover:bg-surface-elevated"
          >
            View docs
          </Link>
        </div>

        {/* Framework trust line — lead with developer compatibility, not
            regulation. Compliance is the proof, not the pitch. */}
        <p className="mt-7 type-small text-ink-secondary">
          Works with LangChain · CrewAI · AutoGen · LlamaIndex · any agent
          framework
        </p>
      </div>

      {/* Center-stage demo. */}
      <div className="mx-auto max-w-2xl px-6 pb-24">
        <DemoPanel />
      </div>
    </section>
  );
}

/* ── The auto-playing demo ─────────────────────────────────────────── */

function DemoPanel() {
  return (
    <div className="relative mx-auto max-w-[540px]">
      {/* Glow behind the panel. */}
      <div
        className="pointer-events-none absolute -inset-10 -z-10"
        style={{
          background:
            "radial-gradient(closest-side, rgba(245,158,11,0.16), transparent)",
        }}
      />
      <div className="overflow-hidden rounded-modal border border-hairline bg-surface/80 shadow-elev3 backdrop-blur">
        <div className="flex items-center gap-2 border-b border-hairline-subtle px-4 py-2.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full animate-running-dot"
            style={{ backgroundColor: "var(--color-success)" }}
          />
          <span className="type-micro text-ink-secondary">
            live · pricing-agent v1.2.0
          </span>
          <span className="ml-auto type-micro text-ink-tertiary">
            decision feed
          </span>
        </div>
        <div className="p-4">
          <DemoFeed />
        </div>
      </div>
    </div>
  );
}

const DEMO_CARDS = [
  {
    type: "DATA_ACCESS",
    content: "Retrieved patient record PT-4821 for triage assessment.",
    hash: "a3f8c021",
  },
  {
    type: "PRICING_UPDATE",
    content: "Set SKU-401 price to $129.99 to match competitor floor.",
    hash: "7d2e9b14",
  },
  {
    type: "TRANSACTION",
    content: "Approved wire transfer of $14,200 to vendor ACME-LLC.",
    hash: "f10a55c8",
  },
];

function DemoFeed() {
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setCycle((c) => c + 1), 5500);
    return () => window.clearInterval(id);
  }, []);
  return <DemoSequence key={cycle} />;
}

function DemoSequence() {
  const [showSupersession, setShowSupersession] = useState(false);
  const [showViolation, setShowViolation] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => setShowSupersession(true), 1500);
    const t2 = window.setTimeout(() => setShowViolation(true), 2500);
    const t3 = window.setTimeout(() => setFadingOut(true), 5000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, []);

  return (
    <div
      className={cn(
        "space-y-3 transition-opacity duration-500",
        fadingOut ? "opacity-0" : "opacity-100",
      )}
    >
      {DEMO_CARDS.map((card, i) => {
        const isMiddle = i === 1;
        const isBottom = i === 2;
        return (
          <div
            key={card.type}
            className="opacity-0"
            style={{
              animation: "mneme-fade-in 400ms ease-out forwards",
              animationDelay: `${i * 200}ms`,
            }}
          >
            <DemoCard
              type={card.type}
              content={card.content}
              hash={card.hash}
              superseded={isMiddle && showSupersession}
              violated={isBottom && showViolation}
            >
              {isMiddle && showSupersession && (
                <div
                  className="mt-2.5 flex items-center gap-2 rounded-field border-l-2 px-3 py-2 animate-slide-in-top"
                  style={{
                    borderColor: "var(--accent-amber)",
                    backgroundColor: "var(--accent-amber-subtle)",
                  }}
                >
                  <GitBranch
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: "var(--accent-amber)" }}
                  />
                  <span className="type-small" style={{ color: "var(--accent-amber)" }}>
                    Revises decision from 6 days ago
                  </span>
                </div>
              )}
              {isBottom && showViolation && (
                <div className="mt-2.5 inline-block animate-pulse-once rounded-pill">
                  <Badge variant="severity-high" size="sm" appearance="dot">
                    HIGH · Pricing policy
                  </Badge>
                </div>
              )}
            </DemoCard>
          </div>
        );
      })}
    </div>
  );
}

function DemoCard({
  type,
  content,
  hash,
  superseded,
  violated,
  children,
}: {
  type: string;
  content: string;
  hash: string;
  superseded?: boolean;
  violated?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-card border border-hairline-subtle bg-surface-elevated shadow-elev1">
      <span
        className="absolute inset-y-0 left-0 w-0.5"
        style={{
          backgroundColor: superseded
            ? "var(--accent-amber)"
            : violated
              ? "var(--color-danger)"
              : "var(--border-default)",
        }}
      />
      <div className="py-3 pl-4 pr-3">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="neutral" size="sm">
            {type}
          </Badge>
          <span className="type-small text-ink-tertiary">just now</span>
        </div>
        <p className="mt-2 type-body text-ink">{content}</p>
        {children}
        <div className="mt-3">
          <span
            className="font-mono text-[13px]"
            style={{ color: "var(--hash-color)" }}
          >
            {hash}…
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Section 2 — Three primitives ──────────────────────────────────── */

function Primitives() {
  const items = [
    {
      icon: Brain,
      heading: "Memory that compounds",
      body: "Every decision your agent makes is logged, embedded, and connected to what came before. Your agent builds on what it learned — not what it can fit in a context window.",
    },
    {
      icon: GitBranch,
      heading: "Consistency enforcement",
      body: "When your agent contradicts a past decision, Mneme catches it in real time. The amber callout shows exactly what changed, why it matters, and what the original decision was.",
    },
    {
      icon: ShieldCheck,
      heading: "Proof when it counts",
      body: "Policy violations flagged before they ship. A tamper-evident audit trail for every action. One-click export for any regulator, auditor, or board that asks why.",
    },
  ];
  return (
    <section className="border-t border-hairline-subtle">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <p className="type-micro text-ink-tertiary">What you get</p>
        </Reveal>
        <div className="mt-10 grid gap-12 md:grid-cols-3">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.heading} delay={i * 100}>
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-card"
                  style={{ backgroundColor: "var(--accent-amber-subtle)" }}
                >
                  <Icon
                    className="h-5 w-5"
                    strokeWidth={1.75}
                    style={{ color: "var(--accent-amber)" }}
                  />
                </div>
                <h3 className="mt-4 type-heading text-ink">{item.heading}</h3>
                <p className="mt-2 type-body text-ink-secondary">{item.body}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Section 3 — SDK integration ───────────────────────────────────── */

const TS_CODE = `import { MnemeClient } from "@mneme/sdk";

const client = new MnemeClient({
  workspaceId: "ws_abc123",
  apiKey: process.env.MNEME_API_KEY!,
  baseUrl: "https://your-mneme.app",
});

const runId = await client.startRun("pricing-agent", "v1.2.0");

const result = await client.logDecision(runId, {
  decision_type: "PRICING_UPDATE",
  decision_content: "Set SKU-401 price to $129.99",
  context_used: { current: 119.99, competitor: 124.99 },
});

if (result.violations.length) abortAndEscalate(result);

await client.endRun(runId, "COMPLETED");`;

const PY_CODE = `# Python SDK — coming soon.
# Today, call the REST API directly:
#   POST /api/workspaces/:id/agent-runs
#   POST /api/agent-runs/:runId/decisions
#   POST /api/agent-runs/:runId/end`;

function Integration() {
  const [lang, setLang] = useState<"ts" | "py">("ts");
  return (
    <section id="integrate" className="border-t border-hairline-subtle">
      <div className="mx-auto max-w-3xl px-6 py-24">
        <Reveal>
          <p className="type-micro text-ink-tertiary">Integrate in 10 minutes</p>
          <h2 className="mt-3 type-display text-ink">Three calls. Any framework.</h2>
          <div className="mb-4 mt-6 inline-flex rounded-field border border-hairline-subtle p-0.5">
            {(["ts", "py"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={cn(
                  "rounded-[5px] px-3 py-1 type-small transition-colors",
                  lang === l
                    ? "bg-surface-elevated text-ink"
                    : "text-ink-tertiary hover:text-ink",
                )}
              >
                {l === "ts" ? "TypeScript" : "Python"}
              </button>
            ))}
          </div>
          <CodeBlock
            language={lang === "ts" ? "typescript" : "python"}
            code={lang === "ts" ? TS_CODE : PY_CODE}
          />
          <p className="mt-4 type-small text-ink-tertiary">
            Works with LangChain · CrewAI · AutoGen · any agent framework
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Section 4 — Compliance anchors ────────────────────────────────── */

function Compliance() {
  const cards = [
    {
      icon: ListChecks,
      title: "Colorado AI Act",
      body: "Enforcement June 30 2026. Impact assessments and decision documentation required for high-risk AI. Mneme generates both automatically.",
    },
    {
      icon: Lock,
      title: "HIPAA §164.312(b)",
      body: "Audit controls required for all systems processing PHI. Mneme's tamper-evident log satisfies this requirement out of the box.",
    },
    {
      icon: ShieldCheck,
      title: "SOC2 Type II",
      body: "Auditors need evidence. Mneme's export gives them a complete, signed decision trail they can actually use.",
    },
  ];
  return (
    <section className="border-t border-hairline-subtle">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <p className="type-micro text-ink-tertiary">Built for the audit</p>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {cards.map((card, i) => {
            const Icon = card.icon;
            return (
              <Reveal key={card.title} delay={i * 100}>
                <div className="h-full rounded-card border border-hairline-subtle bg-surface p-5 transition-colors hover:border-amber-border">
                  <Icon
                    className="h-5 w-5"
                    strokeWidth={1.5}
                    style={{ color: "var(--accent-amber)" }}
                  />
                  <h3 className="mt-4 type-subheading text-ink">{card.title}</h3>
                  <p className="mt-2 type-body text-ink-secondary">{card.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Section 5 — CTA footer ────────────────────────────────────────── */

function FooterCta() {
  return (
    <section className="relative overflow-hidden border-t border-hairline-subtle">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 70% at 50% 120%, rgba(245,158,11,0.14), transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-3xl px-6 py-28 text-center">
        <Reveal>
          <h2 className="text-[clamp(28px,5vw,40px)] font-semibold leading-tight tracking-[-0.02em] text-ink">
            Your agents are already making decisions.
            <br />
            Make them remember.
          </h2>
          <div className="mt-8 flex justify-center">
            <Link
              href="/register"
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-field px-6 text-[15px] font-medium shadow-elev2 transition-all hover:opacity-90 hover:shadow-elev3"
              style={{ backgroundColor: "var(--accent-amber)", color: "var(--bg-base)" }}
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
