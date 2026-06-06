/**
 * Transport-safe domain types. Mirrors the Prisma models but with dates as
 * ISO strings so payloads survive JSON serialization across the wire.
 */

export type MemberRole = "OWNER" | "EDITOR" | "VIEWER";
export type MessageRole = "USER" | "ASSISTANT" | "SYSTEM";
export type MessageStatus = "PENDING" | "STREAMING" | "COMPLETE" | "ERROR";
export type AiRunStatus = "RUNNING" | "COMPLETE" | "ERROR";

export interface UserPublic {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface WorkspaceMemberDTO {
  id: string;
  workspaceId: string;
  userId: string;
  role: MemberRole;
  cursorColor: string;
  user: UserPublic;
}

export interface WorkspaceDTO {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  members: WorkspaceMemberDTO[];
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  role: MessageRole;
  authorId: string | null;
  content: string;
  status: MessageStatus;
  clientMsgId: string | null;
  serverSeq: number;
  createdAt: string;
  completedAt: string | null;
}

export interface ConversationDTO {
  id: string;
  workspaceId: string;
  title: string;
  summary: string | null;
  createdAt: string;
}

export type MemoryItemKind = "DECISION" | "QUESTION" | "ACTION_ITEM" | "CONTEXT";

/** A semantically-related past message returned to the prompt composer's
 *  "related" surface as the user types. */
export interface RelatedMemoryHitDTO {
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  snippet: string;
  /** 0–1; higher = more semantically aligned. */
  similarity: number;
  createdAt: string;
}

/** A single source cited inside an "ask your team's memory" answer. */
export interface MemoryAskSourceDTO {
  /** 1-based index the synthesized answer references via `[N]` markers. */
  index: number;
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  snippet: string;
  similarity: number;
  createdAt: string;
}

/** Response shape for POST /api/workspaces/:id/memory/ask. The answer is
 *  an AI-synthesized paragraph that cites the workspace's own past
 *  discussions via `[1]`-style markers tied to the sources array. */
export interface MemoryAskResponseDTO {
  answer: string;
  sources: MemoryAskSourceDTO[];
}

export interface MemoryItemDTO {
  id: string;
  workspaceId: string;
  conversationId: string;
  messageId: string | null;
  kind: MemoryItemKind;
  text: string;
  ownerId: string | null;
  dueAt: string | null;
  resolvedAt: string | null;
  confirmedAt: string | null;
  /** When a newer revision has replaced this row, points at it. Live
   *  list views filter on `supersededById IS NULL`; the per-item history
   *  trail walks back through ancestors via this FK. */
  supersededById: string | null;
  /** Short LLM-generated explanation of WHY this row was superseded — the
   *  team revised the decision, reversed a commitment, narrowed a
   *  question. Surfaces inline in the history trail. */
  supersededReason: string | null;
  /** Count of direct predecessor revisions (`supersedes` reverse relation).
   *  >0 means this row replaced an earlier one — the UI shows a "Revised"
   *  pill. We don't walk the full chain server-side for list rendering;
   *  the dedicated history endpoint does that on demand. */
  revisionCount: number;
  createdAt: string;
  updatedAt: string;
}

/** One row in the "Decisions revisited recently" panel surface. The team
 *  replaced a prior decision with a newer one inside the lookback window;
 *  `current` is the live row, `prior` is the row it directly superseded
 *  (with the LLM-generated `reason` carried from the supersession edge).
 *
 *  The shape is intentionally one-step — older ancestors live in the
 *  History tab via the per-item `/history` endpoint. This DTO is just the
 *  "before / after / why" preview. */
export interface RevisitedDecisionDTO {
  current: MemoryItemDTO;
  prior: {
    id: string;
    text: string;
    /** From the supersession edge, not the prior row — `prior.supersededReason`
     *  is the LLM's "why this got replaced" written when the new row landed. */
    reason: string | null;
    createdAt: string;
  };
}

/** Response shape for GET /api/workspaces/:id/memory/revisited. */
export interface RevisitedMemoryResponseDTO {
  items: RevisitedDecisionDTO[];
  /** Count of memory items revised within the last 90 days. Powers the
   *  "N decisions revised this quarter" pill on the Memory header. */
  quarterCount: number;
}

/** What the extractor wrote during a single AI turn. Drives the inline
 *  "Captured" pill + "Revises X" callout that renders directly under each
 *  completed assistant message — the felt moment of "the memory layer just
 *  did something for us."
 *
 *  `added` is brand-new items (revisionCount === 0). `revised` is items that
 *  replaced an earlier revision (revisionCount > 0), each paired with the
 *  immediate predecessor so the Originally → Now → Why card renders without
 *  a second round-trip. */
export interface MessageCapturedDTO {
  added: MemoryItemDTO[];
  revised: RevisitedDecisionDTO[];
}

/* ─── Agent audit ────────────────────────────────────────────────── */

export type AgentRunStatus = "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type PolicyViolationSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface AgentRunDTO {
  id: string;
  workspaceId: string;
  agentName: string;
  agentVersion: string;
  status: AgentRunStatus;
  metadata: Record<string, unknown>;
  startedAt: string;
  endedAt: string | null;
  /** Populated when the run is listed via the runs endpoint — aggregate
   *  counts for the row badges (decisions, violations). */
  decisionCount?: number;
  violationCount?: number;
}

export interface AgentDecisionEventDTO {
  id: string;
  runId: string;
  workspaceId: string;
  decisionType: string;
  decisionContent: string;
  contextUsed: Record<string, unknown>;
  toolCalled: string | null;
  toolOutput: Record<string, unknown> | null;
  contentHash: string;
  previousHash: string | null;
  /** When this decision replaced an earlier one, points at the prior
   *  decision's id. The "this revises X" amber callout fires on rows
   *  where `supersededById` was set DURING ingestion of the new event
   *  (a NEW event whose ingestion linked to a PRIOR one). */
  supersededById: string | null;
  supersededReason: string | null;
  decidedAt: string;
  createdAt: string;
}

export interface PolicyRuleDTO {
  id: string;
  workspaceId: string;
  ruleText: string;
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  /** Count of violations this rule has caught (lifetime). Populated when
   *  the rule is listed via the rules endpoint. */
  violationCount?: number;
}

export interface PolicyViolationDTO {
  id: string;
  decisionEventId: string;
  policyRuleId: string;
  /** The matched rule's text, denormalized for display. */
  policyRuleText?: string;
  violationExplanation: string;
  severity: PolicyViolationSeverity;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolverNote: string | null;
}

/** Returned by POST /agent-runs/:runId/decisions — what the SDK reads
 *  immediately after logging a decision. The SDK exposes these arrays
 *  so an agent can react in-loop ("policy violation detected — abort"). */
export interface DecisionIngestionResultDTO {
  decision: AgentDecisionEventDTO;
  /** If this decision superseded a prior one, the prior decision id and
   *  the LLM-generated reason. Empty array if no supersession fired. */
  supersessions: Array<{
    supersededId: string;
    reason: string;
  }>;
  /** Every policy rule this decision violated, with severity + LLM
   *  explanation. Empty array if no violations. */
  violations: Array<{
    policyRuleId: string;
    severity: PolicyViolationSeverity;
    explanation: string;
  }>;
}

/** Full audit export — what GET /audit-export returns. Designed to be
 *  handed to a compliance officer / regulator. Includes everything needed
 *  to re-derive the content_hash chain externally and verify no row was
 *  altered after the fact. */
export interface AuditExportDTO {
  workspace: { id: string; name: string };
  generatedAt: string;
  /** sha256 of the canonical serialization of every decision's
   *  contentHash, joined with newlines. Verifies the export wasn't
   *  modified between download and audit. */
  exportHash: string;
  runs: Array<AgentRunDTO & {
    decisions: Array<AgentDecisionEventDTO & {
      violations: PolicyViolationDTO[];
    }>;
  }>;
  policyRules: PolicyRuleDTO[];
}

/** A workspace API key as shown in the management UI. Never carries the
 *  secret — only the non-secret `keyPrefix` for identification. */
export interface ApiKeyDTO {
  id: string;
  workspaceId: string;
  name: string;
  /** Non-secret leading slice (e.g. `mnk_a1b2c3`) for at-a-glance ID. */
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

/** Returned ONCE, by POST /api/workspaces/:id/api-keys. `plaintext` is the
 *  full secret — it is never stored and never returned again, so the UI
 *  must surface it immediately and tell the user to copy it now. */
export interface CreatedApiKeyDTO {
  apiKey: ApiKeyDTO;
  plaintext: string;
}

/** Initial server-rendered snapshot handed to the client store on load. */
export interface WorkspaceSnapshot {
  workspace: WorkspaceDTO;
  /** The full thread list in this workspace, newest first. Light metadata
   *  only — clients render the thread switcher from here. */
  conversations: ConversationDTO[];
  /** The currently-active thread (either picked by `?thread=` or the most
   *  recent one). Its messages are included; sibling threads' messages are
   *  fetched on demand. */
  conversation: ConversationDTO;
  messages: MessageDTO[];
  serverSeq: number;
}
