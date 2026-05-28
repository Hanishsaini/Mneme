<div align="center">

# Mneme

**The memory layer for your team.**

Every decision your team makes, every question still open, every commitment — captured automatically from your AI conversations, surfaced when it matters, and *self-correcting* as the team evolves.

[Open a workspace →](https://github.com/Hanishsaini/Mneme)

</div>

---

## What it actually does

Most "AI memory" products store snippets. Mneme stores a **decision graph**.

When your team talks to Mneme's AI assistant, three engineering layers run automatically:

| Stage         | What happens                                                                                                                                                                                                                  | The tech                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Capture**   | An extractor reads every user → assistant exchange and writes structured items: decisions, open questions, action items, durable context. Fire-and-forget. Never blocks the response.                                          | mem0-style operation emitter (`ADD` / `UPDATE` / `DELETE` / `NONE`) over an LLM |
| **Connect**   | Every message gets embedded into a workspace-scoped vector + keyword index. Retrieval fuses pgvector cosine search with Postgres BM25 via reciprocal rank fusion — proper-noun precision and conceptual recall, in one CTE.    | `pgvector` 768d (Gemini) · `ts_rank_cd` BM25 · RRF (k=60)                       |
| **Evolve**    | When the team revises a past decision, Mneme detects the supersession, links the new row to the old one in a directed graph, and writes the LLM-generated rationale for the change. History is preserved, not overwritten.    | Self-referencing FK (`supersededById`) · soft-resolve on reversal              |

The result: a graph of how your team's thinking has *changed* — not just what it currently is.

## What you can't get anywhere else

Every other AI tool gives you the latest answer. Mneme gives you the latest answer **and the trail behind it** — what you originally chose, when you moved off it, and the reasoning that drove the shift.

| Tool                  | What they miss                                          | What Mneme exposes                                                          |
| --------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| ChatGPT / Claude      | Forgets the tab. No team layer.                         | Persistent, workspace-scoped, semantic — across every conversation, forever |
| Notion AI             | Static docs nobody comes back to read.                  | Decisions surface themselves the next time the question comes up            |
| Slack search          | Keyword-only, over unstructured chatter.                | Semantic + keyword fusion, over the structured decisions your team made     |
| mem0 / supermemory    | Developer SDKs. You build the surface yourself.         | Full product with the supersession graph as a first-class UI                |

After six months of use, you have a decision graph no other team can replicate. **That's the moat.** It compounds the longer you use it.

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

### The three commits that built the moat

1. **`41600bc` — Operation-emitter extraction.** Three-stage pipeline per AI turn: extract candidate facts → vector-search workspace memory for neighbors → reconcile via second LLM call that emits `ADD` / `UPDATE` / `DELETE` / `NONE` ops. The reconciler short-circuits when the workspace is empty. Hallucinated `targetId`s are dropped via a `validTargetIds` set.

2. **`7b5b787` — Hybrid retrieval (RRF).** Vector cosine and Postgres BM25 merged via reciprocal rank fusion (k=60) inside a single CTE — `FULL OUTER JOIN` over two ranked pools, sum of `1/(k+rank)` per source. One round-trip. Beats either source alone on the eval set.

3. **`847bad5` — Supersession graph as product surface.** The data has been there since `41600bc`; this commit exposes it. New `/memory/revisited` endpoint joins each head row to its immediate predecessor; the panel renders Originally → Now → Why. A dedicated History tab lets the user expand the full chain inline. A header pill counts decisions revised this quarter.

Together: capture, connect, evolve. The data layer the rest of the product is built around.

## Stack

| Layer             | Tech                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Framework         | Next.js 15.5 (App Router, React 19, Node runtime)                                             |
| Auth              | NextAuth v4 (JWT) · Credentials + Google + GitHub · bcryptjs cost 12 · NIST SP 800-63B policy |
| DB                | Postgres 16 · Prisma 6 · pgvector + HNSW · tsvector + GIN                                     |
| Cache / coord     | Upstash Redis (ioredis) — locks, rate limits, sequences, run-abort flags                      |
| AI                | Provider abstraction (Groq · Gemini · OpenAI · mock) · Gemini for embeddings (768d)           |
| Streaming         | SSE via `ReadableStream` + async generator; client disconnect aborts the run cleanly          |
| Styling           | Tailwind · shadcn/ui · Inter / Newsreader / JetBrains Mono                                    |
| Deploy            | Vercel (web) · Neon or Supabase (Postgres) · Upstash (Redis)                                  |

## Local development

```bash
pnpm install
cp .env.local.example .env.local      # then fill in DATABASE_URL, REDIS_URL, etc.
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
GEMINI_API_KEY=...                    # required for embeddings; falls back to nothing if absent
OPENAI_API_KEY=...
```

Helpful scripts:

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
  app/                          # Next.js App Router routes
    api/                          # JSON endpoints (all go through withHandler + Zod)
    (auth, w/[workspaceId], etc.) # Pages
  features/
    ai/                           # Provider abstraction, orchestrator, context builder
    memory/                       # The moat: extractor, hybrid search, supersession
      server/
        extractor.service.ts        # Operation-emitter pipeline (mem0-style)
        hybrid-search.ts            # RRF over pgvector + BM25
        memory-items.repository.ts  # Supersession graph + revisited queries
      components/
        memory-panel.tsx            # Dossier surface (Ask / Memory / Review / History)
    marketing/                    # Public landing
    auth/                         # Sign in / sign up, password policy
    conversation/                 # Chat surface + SSE orchestration
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

- **Public eval set + benchmark** for the hybrid retrieval — quantify the lift over cosine-only / BM25-only.
- **Memory-as-context SDK** for external AI clients (LangChain / LlamaIndex adapter).
- **Decision threading** — when a revision happens, link related downstream decisions automatically.
- **Team-level analytics** — "your team revisits decisions 2.4× faster than typical."

## License

MIT.

---

<div align="center">

Built with care. Designed to compound.

[github.com/Hanishsaini/Mneme](https://github.com/Hanishsaini/Mneme)

</div>
