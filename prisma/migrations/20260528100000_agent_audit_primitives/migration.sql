-- The agent-audit pivot. Four new tables that turn Mneme from "personal
-- chat memory" into "decision audit trail for autonomous agents":
--
--   AgentRun            — one run of an agent (status, metadata)
--   AgentDecisionEvent  — every atomic decision the agent makes, with
--                         embedding + tsvector for hybrid retrieval and a
--                         chained content_hash for tamper-evidence
--   PolicyRule          — workspace-defined rules in plain English
--   PolicyViolation     — flagged decisions that broke a rule
--
-- The supersession FK pattern (MemoryItem.supersededById) is replicated on
-- AgentDecisionEvent. Embedding dimensionality stays 768 — same as
-- MemoryItem + Embedding — so all three share one HNSW infra and one
-- Gemini provider configuration. A future provider swap (1536d OpenAI,
-- 3072d Cohere) would touch all three at once.

-- ── Enums ────────────────────────────────────────────────────────────
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "PolicyViolationSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- ── AgentRun ─────────────────────────────────────────────────────────
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "agentVersion" TEXT NOT NULL DEFAULT '',
    "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentRun_workspaceId_startedAt_idx" ON "AgentRun"("workspaceId", "startedAt" DESC);
CREATE INDEX "AgentRun_status_idx" ON "AgentRun"("status");

ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── AgentDecisionEvent ───────────────────────────────────────────────
CREATE TABLE "AgentDecisionEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "decisionType" TEXT NOT NULL,
    "decisionContent" TEXT NOT NULL,
    "contextUsed" JSONB NOT NULL DEFAULT '{}',
    "toolCalled" TEXT,
    "toolOutput" JSONB,
    "embedding" vector(768),
    "contentTsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce("decisionContent", ''))) STORED,
    "contentHash" TEXT NOT NULL,
    "previousHash" TEXT,
    "supersededById" TEXT,
    "supersededReason" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentDecisionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentDecisionEvent_runId_decidedAt_idx" ON "AgentDecisionEvent"("runId", "decidedAt");
CREATE INDEX "AgentDecisionEvent_workspaceId_decidedAt_idx" ON "AgentDecisionEvent"("workspaceId", "decidedAt" DESC);
CREATE INDEX "AgentDecisionEvent_workspaceId_decisionType_idx" ON "AgentDecisionEvent"("workspaceId", "decisionType");
CREATE INDEX "AgentDecisionEvent_supersededById_idx" ON "AgentDecisionEvent"("supersededById");

-- HNSW for cosine over decision embeddings (supersession candidate search).
CREATE INDEX "AgentDecisionEvent_embedding_hnsw_idx"
  ON "AgentDecisionEvent" USING hnsw ("embedding" vector_cosine_ops);

-- GIN for BM25 / ts_rank_cd half of the RRF hybrid.
CREATE INDEX "AgentDecisionEvent_contentTsv_gin_idx"
  ON "AgentDecisionEvent" USING GIN ("contentTsv");

ALTER TABLE "AgentDecisionEvent"
  ADD CONSTRAINT "AgentDecisionEvent_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "AgentRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentDecisionEvent"
  ADD CONSTRAINT "AgentDecisionEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentDecisionEvent"
  ADD CONSTRAINT "AgentDecisionEvent_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "AgentDecisionEvent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── PolicyRule ───────────────────────────────────────────────────────
CREATE TABLE "PolicyRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ruleText" TEXT NOT NULL,
    "ruleEmbedding" vector(768),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PolicyRule_workspaceId_isActive_idx" ON "PolicyRule"("workspaceId", "isActive");

ALTER TABLE "PolicyRule"
  ADD CONSTRAINT "PolicyRule_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PolicyRule"
  ADD CONSTRAINT "PolicyRule_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── PolicyViolation ──────────────────────────────────────────────────
CREATE TABLE "PolicyViolation" (
    "id" TEXT NOT NULL,
    "decisionEventId" TEXT NOT NULL,
    "policyRuleId" TEXT NOT NULL,
    "violationExplanation" TEXT NOT NULL,
    "severity" "PolicyViolationSeverity" NOT NULL DEFAULT 'MEDIUM',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolverNote" TEXT,

    CONSTRAINT "PolicyViolation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PolicyViolation_decisionEventId_idx" ON "PolicyViolation"("decisionEventId");
CREATE INDEX "PolicyViolation_policyRuleId_idx" ON "PolicyViolation"("policyRuleId");
CREATE INDEX "PolicyViolation_severity_resolvedAt_idx" ON "PolicyViolation"("severity", "resolvedAt");

ALTER TABLE "PolicyViolation"
  ADD CONSTRAINT "PolicyViolation_decisionEventId_fkey"
  FOREIGN KEY ("decisionEventId") REFERENCES "AgentDecisionEvent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PolicyViolation"
  ADD CONSTRAINT "PolicyViolation_policyRuleId_fkey"
  FOREIGN KEY ("policyRuleId") REFERENCES "PolicyRule"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PolicyViolation"
  ADD CONSTRAINT "PolicyViolation_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
