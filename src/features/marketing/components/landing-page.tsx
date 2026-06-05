"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  GitBranch,
  ListChecks,
  Lock,
  ScrollText,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { Badge, CodeBlock } from "@/components/design";
import { cn } from "@/lib/utils";

/**
 * Public landing. Dark, precise, one accent. The hero's right column runs a
 * forever-looping demo of the product working — three decision cards stack
 * in, a supersession callout slides onto the middle card, a HIGH violation
 * badge pulses onto the bottom card — so a visitor understands the product
 * in 8 seconds without reading a word.
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

/* ── Section 1 — Hero ──────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="hero-radial relative">
      <div className="mx-auto grid max-w-6xl gap-16 px-6 py-24 lg:grid-cols-[3fr_2fr] lg:py-32">
        <div className="flex flex-col justify-center">
          <p
            className="type-micro"
            style={{ color: "var(--accent-amber)", letterSpacing: "0.1em" }}
          >
            Agent audit infrastructure
          </p>
          <h1 className="mt-4 text-[40px] font-medium leading-[1.1] tracking-[-0.03em] text-ink sm:text-[48px]">
            Every agent decision.
            <br />
            Logged. <span style={{ color: "var(--accent-amber)" }}>Proven.</span>{" "}
            Auditable.
          </h1>
          <p className="mt-6 max-w-[480px] text-[16px] leading-relaxed text-ink-secondary">
            AI agents are making consequential decisions right now. When a
            regulator asks why — you need proof. Mneme captures every decision,
            flags contradictions, and exports a tamper-evident audit trail.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/register"
              className="inline-flex h-10 items-center justify-center rounded-field px-4 text-[14px] font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--accent-amber)", color: "var(--bg-base)" }}
            >
              Start auditing free
            </Link>
            <Link
              href="#integrate"
              className="inline-flex h-10 items-center justify-center rounded-field border border-hairline px-4 text-[14px] font-medium text-ink transition-colors hover:bg-surface-elevated"
            >
              View docs
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {["Colorado AI Act Jun 2026", "HIPAA §164.312(b)", "SOC2 Type II"].map(
              (chip) => (
                <span
                  key={chip}
                  className="rounded-pill border border-hairline-subtle px-2.5 py-1 type-small text-ink-tertiary"
                >
                  {chip}
                </span>
              ),
            )}
          </div>
        </div>

        <div className="flex items-center justify-center">
          <DemoFeed />
        </div>
      </div>
    </section>
  );
}

/* ── The auto-playing demo ─────────────────────────────────────────── */

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

/** Loop length 5500ms (matches the frame spec). A parent key bump restarts
 *  the whole sequence so it runs forever with no interaction. */
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
        "w-full max-w-[380px] space-y-3 transition-opacity duration-500",
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
    <div className="relative overflow-hidden rounded-card border border-hairline-subtle bg-surface shadow-elev1">
      <span
        className="absolute inset-y-0 left-0 w-0.5"
        style={{
          backgroundColor: superseded
            ? "var(--accent-amber)"
            : violated
              ? "var(--color-danger)"
              : "var(--border-subtle)",
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
      icon: ScrollText,
      heading: "Decision Log",
      body: "Every agent action captured. Tool calls, context used, outputs — all hashed and chained for tamper-evidence.",
    },
    {
      icon: GitBranch,
      heading: "Supersession Detection",
      body: "When an agent contradicts a past decision, Mneme flags it instantly. The amber callout shows exactly what changed and why.",
    },
    {
      icon: Shield,
      heading: "Policy Rules Engine",
      body: "Define rules in plain English. Mneme checks every decision in real time and catches violations before they become incidents.",
    },
  ];
  return (
    <section className="border-t border-hairline-subtle">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="type-micro text-ink-tertiary">How it works</p>
        <div className="mt-10 grid gap-12 md:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.heading}>
                <Icon
                  className="h-6 w-6"
                  strokeWidth={1.5}
                  style={{ color: "var(--accent-amber)" }}
                />
                <h3 className="mt-4 type-heading text-ink">{item.heading}</h3>
                <p className="mt-2 type-body text-ink-secondary">{item.body}</p>
              </div>
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
        <p className="type-micro text-ink-tertiary">Integrate in 10 minutes</p>
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
        <p className="type-micro text-ink-tertiary">Built for the audit</p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="rounded-card border border-hairline-subtle bg-surface p-5"
              >
                <Icon
                  className="h-5 w-5"
                  strokeWidth={1.5}
                  style={{ color: "var(--accent-amber)" }}
                />
                <h3 className="mt-4 type-subheading text-ink">{card.title}</h3>
                <p className="mt-2 type-body text-ink-secondary">{card.body}</p>
              </div>
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
    <section className="border-t border-hairline-subtle">
      <div className="mx-auto max-w-3xl px-6 py-28 text-center">
        <h2 className="text-[32px] font-medium leading-tight tracking-[-0.02em] text-ink">
          Your agents are already making decisions.
          <br />
          Are you watching?
        </h2>
        <div className="mt-8 flex justify-center">
          <Link
            href="/register"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-field px-5 text-[14px] font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--accent-amber)", color: "var(--bg-base)" }}
          >
            Start auditing free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
