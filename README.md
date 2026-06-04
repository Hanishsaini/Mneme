<div align="center">

# Mneme

**The decision audit trail for autonomous AI agents.**

Every agent decision logged. Every contradiction flagged. Every policy violation caught — synchronously, at decision time, with a tamper-evident export ready for your regulator.

[Open a workspace →](https://github.com/Hanishsaini/Mneme) · [SDK quickstart →](#sdk-quickstart)

</div>

---

## The problem

In 2026, autonomous AI agents are making decisions inside companies that humans never see:

- An agent updates a product price. Three days later it changes the same price again — violating the team's "no more than one pricing change per week" policy. Nobody notices until the quarterly review.
- An agent approves a healthcare recommendation that contradicts a clinical guideline a different agent committed to six weeks earlier. Both decisions are logged in separate JSON traces. Neither agent knows about the other.
- A regulator asks for the decision trail behind a denied loan application. The team hands over LangChain trace files. The regulator asks who authenticated, what context the agent saw, and whether anything has been altered since. There are no answers.

The Colorado AI Act takes effect **June 2026**. HIPAA, FINRA, SOC2 already require what agent frameworks don't produce: durable, queryable, tamper-evident logs of autonomous decisions with policy enforcement built in.

**That gap is what Mneme fills.**

## The three primitives

| Primitive | What it does |
| --- | --- |
| **Agent Decision Log** | Every agent action is an event. Mneme captures *what* the agent decided, *what context* it saw, *what tool* it called, and stores a chained `content_hash` so external auditors can verify nothing's been altered after the fact. |
| **Supersession Detection** | When a new decision lands, Mneme runs it against past decisions in the workspace using hybrid retrieval (pgvector cosine + Postgres BM25, fused via RRF). If it contradicts or revises a prior decision, the supersession link fires — amber callout *in the audit timeline, at the moment it happens*. |
| **Policy Rules Engine** | Workspaces define rules in plain English: *"Never approve transactions over $10,000 without human review."* Every incoming decision runs against every active rule. Violations are flagged synchronously, severity-tagged, and surfaced to the agent on the SDK response so it can react in-loop. |

## SDK quickstart

Drop the SDK into any LangChain, CrewAI, AutoGen, or hand-rolled agent. Three calls.

Authentication is a workspace API key, passed as `apiKey`. Generate one in
the workspace's **API Keys** tab (`/w/<workspaceId>` → API Keys → *Generate
key*) — the secret is shown once, so copy it into your agent's environment as
`MNEME_API_KEY`. The key is scoped to that one workspace and can be revoked at
any time.

```typescript
import { MnemeClient } from "@mneme/sdk";

const client = new MnemeClient({
  workspaceId: "ws_abc123",
  apiKey: process.env.MNEME_API_KEY!, // the key from the API Keys tab
  baseUrl: "https://your-mneme.app",
});

// Open a run
const runId = await client.startRun("pricing-agent", "v1.2.0");

// Log every decision
const result = await client.logDecision(runId, {
  decision_type: "PRICING_UPDATE",
  decision_content: "Set product SKU-401 price to $129.99",
  context_used: { current_price: 119.99, competitor: 124.99 },
  tool_called: "stripe.products.update",
  tool_output: { id: "prod_xyz", updated: true },
});

// React in-loop — the response carries supersession + violation arrays
if (result.violations.length > 0) {
  for (const v of result.violations) {
    console.warn(`Policy violation [${v.severity}]: ${v.explanation}`);
    // Abort, escalate, or revert
  }
}
if (result.supersessions.length > 0) {
  console.info("This decision revised an earlier one — review the audit.");
}

// Close the run
await client.endRun(runId, "COMPLETED");
```

The SDK explicitly does **not** retry — decision logging is too important to risk silent double-writes. The caller decides retry semantics.

### Runnable example: a LangChain agent

[`examples/langchain-agent.ts`](examples/langchain-agent.ts) is a complete
tool-calling pricing agent wired to Mneme: it opens a run, logs a decision
after every tool call, prints any supersessions and policy violations the
moment they fire, and closes the run. Run it against a real workspace:

```bash
# extra deps the example needs (not part of the app):
pnpm add -D langchain @langchain/openai @langchain/core

# point it at your workspace + a key from the API Keys tab:
export MNEME_BASE_URL="https://your-mneme.app"   # or http://localhost:3000
export MNEME_WORKSPACE_ID="ws_abc123"
export MNEME_API_KEY="mnk_..."
export OPENAI_API_KEY="sk-..."

pnpm tsx examples/langchain-agent.ts
```

Run it twice — the second pricing change supersedes the first and, if your
workspace has the seeded "no more than one pricing change per week" rule
active, trips a policy violation you'll see in the console and in the
**Decisions** tab.

App-side configuration (database, Redis, AI keys) lives in
[`.env.example`](.env.example) — copy it to `.env.local` to run Mneme itself.

## Competitive landscape

| Player | What they raised | What they ship | What they miss |
| --- | --- | --- | --- |
| **mem0** | **$24M Series A** (Oct 2025) · 41k stars · AWS Agent SDK ([TechCrunch](https://techcrunch.com/2025/10/28/mem0-raises-24m-from-yc-peak-xv-and-basis-set-to-build-the-memory-layer-for-ai-apps/)) | Developer SDK for *agent memory* | No supersession surface · no policy engine · no compliance export |
| **supermemory** | $2.6M from Google + Cloudflare execs ([TechCrunch](https://techcrunch.com/2025/10/06/a-19-year-old-nabs-backing-from-google-execs-for-his-ai-memory-startup-supermemory/)) | Developer SDK for *agent memory* | Same |
| **LangSmith / Langfuse** | LangChain ecosystem | Traces + observability for debugging | Traces ≠ audit; no synchronous policy enforcement; no tamper evidence |
| **Mneme** | — | **Full audit product** with supersession graph as first-class UI, plain-English policy enforcement, and a JSON export designed for compliance officers | — |

**The empty lane:** every funded competitor is debugging infrastructure for engineers. Nobody ships the *compliance product* the buyer (legal, risk, regulatory) actually needs to hand to a regulator.

## The regulation context

| Regulation | Effective | What it requires | What Mneme produces |
| --- | --- | --- | --- |
| **Colorado AI Act** | June 2026 | Reasonable care + decision records for "consequential decisions" by AI systems | Every decision logged with context, tool calls, hashes |
| **HIPAA** | In force | Audit logs of every system access + decision affecting PHI | Same — with workspace-scoped retention controls |
| **FINRA Rule 3110** | In force | Supervision systems for automated trading + advisory decisions | Synchronous policy violations + tamper-evident exports |
| **SOC2 Type II** | Continuous | Logging, monitoring, and change-management evidence | The full audit-export JSON satisfies the AI-system evidence ask |

## Architecture

```
┌────────────────────┐   ┌────────────────────────────────────────────┐
│  Next.js 15 App    │   │  Public surfaces                           │
│  (App Router +     │   │                                            │
│   Server Components│   │  • /api/agent-runs/:id/decisions  (ingest) │
│   + SSE chat)      │──▶│  • /api/workspaces/:id/audit-export        │
│                    │   │  • SDK: MnemeClient (3 calls)              │
└────────┬───────────┘   └──────────────────┬─────────────────────────┘
         │                                  │
         ▼                                  ▼
┌────────────────────┐            ┌────────────────────────────────────┐
│  Postgres          │            │  Engines                           │
│                    │            │                                    │
│  • AgentRun        │            │  • Supersession: hybrid RRF +      │
│  • DecisionEvent   │            │    LLM operation emitter           │
│    + pgvector 768d │            │  • PolicyEngine: cosine pre-filter │
│    + tsvector GIN  │            │    + LLM violation check           │
│    + content_hash  │            │  • Tamper evidence: chained sha256 │
│    + supersededBy  │            │    over (content || context        │
│  • PolicyRule      │            │    || previousHash)                │
│  • PolicyViolation │            │                                    │
└────────────────────┘            └────────────────────────────────────┘
                                                  ▲
                                                  │
┌─────────────────────────────────────────────────┴──────────────────┐
│  Provider abstraction: Groq · Gemini · OpenAI · mock               │
│  Gemini gemini-embedding-001 (768d) for embeddings                 │
└────────────────────────────────────────────────────────────────────┘
```

## Tamper evidence

Each `AgentDecisionEvent` carries:

```
contentHash  = sha256(decisionContent || canonical-JSON(contextUsed) || previousHash)
previousHash = the contentHash of the immediately prior decision in the same run
```

The export's top-level `exportHash` is `sha256(every decision's contentHash, in chronological order)`. To verify integrity, an external auditor:

1. Reads the JSON export.
2. Re-derives each decision's `contentHash` from `(content, context, previousHash)`.
3. Confirms every derived hash matches every stored hash.
4. Concatenates the verified hashes and confirms `exportHash` matches.

Any modification anywhere — change one byte of `decisionContent`, swap two context fields, delete a row — breaks every subsequent hash in the chain. The verification is `O(n)` with no special tooling: a 100-line Python script does it.

## Stack

| Layer | Tech |
| --- | --- |
| Framework | Next.js 15.5 (App Router, React 19, Node runtime) |
| Auth | NextAuth v4 (JWT) · Credentials + Google + GitHub · bcryptjs cost 12 · NIST SP 800-63B password policy |
| DB | Postgres 16 · Prisma 6 · pgvector + HNSW · tsvector + GIN |
| Cache / coord | Upstash Redis (ioredis) — rate limits, lockouts, sequences |
| AI | Provider abstraction (Groq · Gemini · OpenAI · mock) · Gemini for embeddings (768d) |
| Styling | Tailwind · shadcn/ui · Inter / Newsreader serif / JetBrains Mono |
| Deploy | Vercel (web) · Neon or Supabase (Postgres) · Upstash (Redis) |

## Local development

```bash
pnpm install
cp .env.example .env.local            # fill in DATABASE_URL, REDIS_URL, NEXTAUTH_SECRET
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Required env in production:

```bash
DATABASE_URL=postgres://...           # pgvector + tsvector enabled
REDIS_URL=rediss://...
NEXTAUTH_SECRET=...                   # 32+ chars; env.ts FAILS LOUDLY if absent in prod
```

Optional AI keys — Mneme falls back to a mock provider if none are set:

```bash
GROQ_API_KEY=...                      # fastest for the synchronous LLM calls
GEMINI_API_KEY=...                    # required for embeddings (768d)
OPENAI_API_KEY=...
```

Useful scripts:

```bash
pnpm typecheck        # tsc --noEmit
pnpm lint             # next lint
pnpm db:studio        # Prisma Studio
pnpm db:migrate       # apply pending migrations
pnpm db:reset         # nuke + reseed (dev only)
```

## The demo

A new user opens a workspace and lands on `/audit` to find:

- **One agent run** — `example-pricing-agent v0.1.0` — with six backdated decisions
- **An amber "Supersedes prior" badge** on decision #3 (it replaced decision #1 — competitor exited, pricing recovered)
- **A red HIGH-severity policy violation** on decision #5 (pricing changed twice within 7 days, violating the seeded rule)
- **One active policy rule** in the Policies tab

The supersession + violation are *already there* before the user has logged a single decision of their own. The product sells itself in 30 seconds.

## Project layout

```
src/
  app/
    (workspace)/w/[workspaceId]/
      page.tsx                       # Chat surface
      audit/page.tsx                 # The pivot's first-class route
    api/
      agent-runs/[runId]/
        decisions/                   # POST ingestion · GET timeline
        end/                         # POST close-run
      workspaces/[id]/
        agent-runs/                  # POST + GET runs
        policy-rules/                # POST + GET rules
        audit-export/                # GET full JSON export
      policy-rules/[ruleId]/         # PATCH toggle
  features/
    agent-audit/
      server/
        agent-runs.repository.ts
        decision-events.repository.ts
        decision-embedding.ts        # Gemini 768d embeddings for decisions
        decision-hybrid-search.ts    # RRF over decision events
        decision-ingestion.service.ts # The orchestrator
        supersession-detector.service.ts
        policy-engine.service.ts
        policy-rules.repository.ts
        audit-export.service.ts
        seed.service.ts              # Demo seed
      components/
        audit-shell.tsx              # 4-tab UI
    memory/                          # Personal chat memory — coexists
    ai/                              # Provider abstraction
    conversation/                    # Chat (the original surface)
  lib/
    api/handler.ts                   # Auth + Zod + error → JSON wrapper
    auth/                            # NextAuth + bcrypt + lockout
    db/                              # Prisma client + DTO mappers
sdk/
  mneme.ts                           # The TypeScript SDK stub
prisma/
  schema.prisma                      # AgentRun, AgentDecisionEvent,
                                     # PolicyRule, PolicyViolation
                                     # + existing Memory + chat tables
  migrations/                        # Linear, no squashes
```

## Security posture

- **Passwords**: bcrypt cost 12, 12-char minimum, common-password dictionary check.
- **Lockout**: 8 attempts per 15-minute window per email → 30-minute lockout. TTL extends at trip.
- **No enumeration leak**: every auth failure surfaces the same generic message.
- **Prod-guarded secrets**: `NEXTAUTH_SECRET` requires 32+ characters when `NODE_ENV=production`; the dev fallback (`dev-only-…`) is rejected. Same pattern for other env entries.
- **OAuth account linking off**: `allowDangerousEmailAccountLinking: false` on both Google and GitHub providers.
- **Auth on every route**: `withHandler` wraps every endpoint; member-scoped where applicable.
- **Workspace isolation**: every read/write asserts `requireMembership` against the row's workspace.

## Roadmap

- **Slack + Linear connectors** so policy violations land in the channels humans actually watch
- **LangSmith / Langfuse import** to ingest existing trace archives into Mneme retroactively
- **Per-rule severity overrides** — let the policy author specify severity instead of having the LLM choose
- **Multi-tenant compliance officer view** for legal / risk teams managing multiple workspaces

## License

MIT.

---

<div align="center">

Built for the moment regulators ask, *"Show us the trail."*

[github.com/Hanishsaini/Mneme](https://github.com/Hanishsaini/Mneme)

</div>
