<div align="center">

# Mneme

**An automatic decision archive for teams that already chat with AI.**

Every choice your team makes in a conversation gets captured automatically. When you revise it three weeks later, Mneme flags the revision *in the chat itself* — Originally → Now → Why — without you opening a panel. Six months in, your team has an institutional record nothing else can replicate.

[Open a workspace →](https://github.com/Hanishsaini/Mneme)

</div>

---

## Why this exists

Institutional forgetting is a documented organizational tax. Teams relitigate decisions they already made. New hires re-ask questions that were answered last quarter. A reversal in April quietly reappears in June with no record of why anyone moved off the original. Boards, McKinsey, and product-team writeups have all flagged this as expensive and chronic ([Advisorpedia](https://www.advisorpedia.com/viewpoints/institutional-forgetting-and-the-failure-of-corporate-memory/), [Medium: Decision Traces](https://medium.com/@blue___gene/decision-traces-the-architecture-of-organizational-memory-0865a458b847)).

Most teams treat it as gravity. Mneme treats it as solvable.

## What you actually see when you use it

Most "AI memory" products store stuff in the background. You never notice it working. **Mneme makes the memory layer visible at the moment it fires** — and that's the whole product wedge.

**Mid-conversation, right after the AI replies:**

> 📌 **Captured** · 1 decision, 1 question
>
> *Click to expand and see exactly what landed.*

A quiet pill confirms the layer just did something. No panel-opening required.

**When the team revises an earlier decision:**

> ⚠ **Heads up — this revises an earlier decision**
>
> **Originally** ~~We'll use WebSockets for real-time presence + canvas sync.~~
>
>          ↓
>
> **Now** SSE over async generator for AI streaming; presence + canvas deferred until they leave the v0 backlog.
>
> **Why** Socket-server complexity didn't earn its keep for a v0 surface we don't ship to users yet.

The amber callout appears directly under the AI message that triggered the revision. The team sees its own thinking *evolve in real time*. No other AI tool does this.

## Why now

The space is funded and the market is moving. But the funded comparables leave Mneme's lane wide open:

| Player                     | What they raised                                                                                                                     | What they ship                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **mem0**                   | **$24M Series A** (Oct 2025) · 41k GitHub stars · sole memory provider for AWS Agent SDK ([TechCrunch](https://techcrunch.com/2025/10/28/mem0-raises-24m-from-yc-peak-xv-and-basis-set-to-build-the-memory-layer-for-ai-apps/)) | Developer SDK — you build the surface yourself                                                |
| **supermemory**            | $2.6M from Google + Cloudflare execs (Oct 2025) ([TechCrunch](https://techcrunch.com/2025/10/06/a-19-year-old-nabs-backing-from-google-execs-for-his-ai-memory-startup-supermemory/))                                                 | Developer SDK — same shape, smaller team                                                      |
| **ChatGPT Teams**          | Project Memory shipped Apr 2025 ([OpenAI](https://openai.com/index/memory-and-new-controls-for-chatgpt/))                            | Single-project context; no cross-project decision log, no revision visibility                 |
| **Mneme** *(this project)* | —                                                                                                                                    | **Full product** with the supersession graph as a first-class UI, surfaced *during* the chat |

Every funded comparable is a developer SDK or single-project context. **The end-user product where the supersession graph is a first-class UI is empty space.** That's the defensible lane.

## What no one else exposes

|                       | What they miss                                            | What Mneme shows                                                              |
| --------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| ChatGPT / Claude      | Forgets the moment you close the tab. No team layer.      | Persistent, workspace-scoped, semantic — across every conversation, forever   |
| ChatGPT Projects      | Project-scoped context only. No revision visibility.      | Cross-conversation decision archive with visible Originally → Now → Why       |
| Notion AI             | Static docs nobody comes back to read.                    | Decisions surface themselves the next time the question comes up              |
| Slack search          | Keyword-only, over unstructured chatter.                  | Semantic + keyword fusion, over the structured decisions your team made       |
| mem0 / supermemory    | Developer SDKs — you build the surface.                   | Full product with the supersession graph wired straight into the chat UI      |

After six months of use, your team has a decision graph no other team can replicate. **That's the moat.** It compounds the longer you use it.

## How it works

Four engineering layers, each visible inside the product:

| Stage         | What happens                                                                                                                                                                                                                       | The tech                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Capture**   | An extractor reads every user → assistant exchange and writes structured items: decisions, open questions, action items, durable context. Fire-and-forget. Never blocks the response.                                              | mem0-style operation emitter (`ADD` / `UPDATE` / `DELETE` / `NONE`) over an LLM |
| **Connect**   | Every message gets embedded into a workspace-scoped vector + keyword index. Retrieval fuses pgvector cosine search with Postgres BM25 via reciprocal rank fusion — proper-noun precision and conceptual recall, in one CTE.        | `pgvector` 768d (Gemini) · `ts_rank_cd` BM25 · RRF (k=60)                       |
| **Evolve**    | When the team revises a past decision, Mneme detects the supersession, links the new row to the old one in a directed graph, and writes the LLM-generated rationale for the change. History is preserved, not overwritten.        | Self-referencing FK (`supersededById`) · soft-resolve on reversal              |
| **Surface**   | The inline "Captured" pill + amber "Heads up — this revises X" callout fire under every completed AI message. The dossier panel shows the full supersession graph in the Memory + History tabs.                                    | Message-scoped item query · 1.5/4/8s polling cadence                            |

## The four commits that built the moat

1. **[`41600bc`](https://github.com/Hanishsaini/Mneme/commit/41600bc) — Operation-emitter extraction.** Three-stage pipeline per AI turn: extract candidate facts → vector-search workspace memory for neighbors → reconcile via a second LLM call emitting `ADD` / `UPDATE` / `DELETE` / `NONE` ops. Hallucinated `targetId`s are dropped via a `validTargetIds` set.

2. **[`7b5b787`](https://github.com/Hanishsaini/Mneme/commit/7b5b787) — Hybrid retrieval (RRF).** Vector cosine and Postgres BM25 merged via reciprocal rank fusion (k=60) inside a single CTE. `FULL OUTER JOIN` over two ranked pools, sum of `1/(k+rank)` per source. One round-trip.

3. **[`847bad5`](https://github.com/Hanishsaini/Mneme/commit/847bad5) — Supersession graph as product surface.** `/memory/revisited` endpoint joins each head row to its immediate predecessor; the panel renders Originally → Now → Why. A dedicated History tab expands the full chain inline.

4. **[`933bd7b`](https://github.com/Hanishsaini/Mneme/commit/933bd7b) — Memory layer visible in chat.** Inline "Captured" pill + amber revises callout fire under every completed AI message. The moat made visible in the moment it happens — not buried in a panel.

Together: **capture, connect, evolve, surface.** The data plus the moment it shows up to the user.

## Architecture

```
┌────────────────────┐   ┌────────────────────────────────────────────┐
│  Next.js 15 App    │   │  Engineering surface                       │
│  (Server Components│   │                                            │
│   + SSE streaming) │   │  • SSE via ReadableStream + async gen      │
│                    │──▶│  • NextAuth v4 (JWT) + bcrypt 12           │
│                    │   │  • Zod-validated route handlers            │
└────────┬───────────┘   └──────────────────┬─────────────────────────┘
         │                                  │
         ▼                                  ▼
┌────────────────────┐            ┌────────────────────────────────────┐
│  Postgres          │            │  Upstash Redis                     │
│                    │            │                                    │
│  • pgvector 768d   │            │  • Per-conversation locks          │
│    + HNSW index    │            │  • AI rate limits                  │
│  • tsvector +      │            │  • Login lockout (8 try / 15 min)  │
│    GIN index       │            │  • Run-abort flags                 │
│  • Supersession FK │            │  • Sequence allocators             │
└────────────────────┘            └────────────────────────────────────┘
         ▲
         │  Provider abstraction with auto-fallback
         │
┌────────┴───────────────────────────────────────────────────────────┐
│  Groq → Gemini → OpenAI → mock  (chat + extraction + reconcile)    │
│  Gemini gemini-embedding-001 (768d via outputDimensionality)       │
└────────────────────────────────────────────────────────────────────┘
```

## Stack

| Layer             | Tech                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Framework         | Next.js 15.5 (App Router, React 19, Node runtime)                                             |
| Auth              | NextAuth v4 (JWT) · Credentials + Google + GitHub · bcryptjs cost 12 · NIST SP 800-63B policy |
| DB                | Postgres 16 · Prisma 6 · pgvector + HNSW · tsvector + GIN                                     |
| Cache / coord     | Upstash Redis (ioredis) — locks, rate limits, sequences, run-abort flags                      |
| AI                | Provider abstraction (Groq · Gemini · OpenAI · mock) · Gemini for embeddings (768d)           |
| Streaming         | SSE via `ReadableStream` + async generator; client disconnect aborts the run cleanly          |
| Styling           | Tailwind · shadcn/ui · Inter / Newsreader serif / JetBrains Mono                              |
| Deploy            | Vercel (web) · Neon or Supabase (Postgres) · Upstash (Redis)                                  |

## Local development

```bash
pnpm install
cp .env.local.example .env.local      # fill in DATABASE_URL, REDIS_URL, etc.
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Required env (the rest carry safe defaults):

```bash
DATABASE_URL=postgres://...           # pgvector + tsvector enabled
REDIS_URL=rediss://...                # Upstash works out of the box
NEXTAUTH_SECRET=...                   # change from dev default in prod
```

Optional AI keys — Mneme falls back to a mock provider if none are set:

```bash
GROQ_API_KEY=...
GEMINI_API_KEY=...                    # required for embeddings; falls back to no-op
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

## Project layout

```
src/
  app/                            # Next.js App Router routes
    api/
      messages/[messageId]/captured/  # The inline-capture endpoint
      workspaces/[id]/memory/         # revisited, stale, items, ask
  features/
    ai/                           # Provider abstraction, SSE orchestrator
    memory/                       # The moat
      server/
        extractor.service.ts        # Operation-emitter pipeline (mem0-style)
        hybrid-search.ts            # RRF over pgvector + BM25
        memory-items.repository.ts  # Supersession graph + revisited queries
      components/
        memory-panel.tsx            # Dossier surface (Ask / Memory / Review / History)
    conversation/
      components/
        captured-surface.tsx        # Inline pill + revises callout
        message-bubble.tsx          # Mounts CapturedSurface per completed AI message
    marketing/                    # Public landing
    auth/                         # Sign in / sign up, password policy
    workspace/                    # Shell, sidebar, invites
  lib/
    api/handler.ts                # withHandler wrapper (auth + Zod + error → JSON)
    auth/                         # NextAuth config, password hash + policy, lockout
    redis/                        # Locks, rate limits, sequences, run-abort
    db/                           # Prisma client + DTO mappers
  config/                         # Env validation (Zod), tunables
prisma/
  schema.prisma                   # MemoryItem, Embedding, supersession FK
  migrations/                     # Linear, no squashes
packages/
  shared/                         # Transport-safe DTOs (consumed by client + server)
```

## Security posture

- **Passwords**: bcrypt cost 12, 12-char minimum, common-password dictionary check, email-substring rejection. NIST SP 800-63B style — length over complexity.
- **Lockout**: 8 attempts per 15-minute window per email → 30-minute lockout. TTL extends at trip time so attackers can't game window-end timing.
- **No enumeration leak**: every auth failure surfaces "Invalid email or password" — wrong password, no account, locked out, OAuth-only all look identical.
- **Auth on every API route**: `withHandler` wraps every endpoint; session resolution + Zod body validation are non-optional.
- **Workspace isolation**: every read/write asserts `requireMembership` against the row's workspace before returning data.

## Roadmap

- **Inline citations when retrieval fires** — "Based on what your team decided Mar 12 [↗]…" so the AI visibly gets smarter the longer the team uses it.
- **Seeded demo workspace** — experience the supersession story in your first 60 seconds, before you generate any data of your own.
- **Public retrieval eval** — quantify the lift of RRF over cosine-only / BM25-only on a published set.
- **Memory-as-context SDK** — LangChain / LlamaIndex adapter so external AI agents can read the decision archive.
- **Team analytics** — "your team revisits decisions 2.4× faster than typical."

## License

MIT.

---

<div align="center">

Built with care. Designed to compound.

[github.com/Hanishsaini/Mneme](https://github.com/Hanishsaini/Mneme)

</div>
