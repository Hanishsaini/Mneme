/**
 * Mneme SDK — a minimal TypeScript client for any agent framework
 * (LangChain, CrewAI, AutoGen, your custom orchestrator) to log
 * decisions into a Mneme workspace.
 *
 * The contract is three calls:
 *
 *   const client = new MnemeClient({
 *     workspaceId: "ws_...",
 *     apiKey: process.env.MNEME_API_KEY!,
 *     baseUrl: "https://your-mneme.app",
 *   });
 *
 *   const runId = await client.startRun("pricing-agent", "v1.2.0");
 *
 *   const result = await client.logDecision(runId, {
 *     decision_type: "PRICING_UPDATE",
 *     decision_content: "Set product SKU-401 price to $129.99",
 *     context_used: { current_price: 119.99, competitor: 124.99 },
 *     tool_called: "stripe.products.update",
 *     tool_output: { id: "prod_xyz", updated: true },
 *   });
 *
 *   if (result.violations.length > 0) {
 *     // The agent broke a policy rule — abort, escalate, or revert.
 *     for (const v of result.violations) console.warn(v.explanation);
 *   }
 *   if (result.supersessions.length > 0) {
 *     // The agent contradicted a prior decision — heads up.
 *   }
 *
 *   await client.endRun(runId, "completed");
 *
 * Authentication: bearer token in the Authorization header. The token
 * lives in the workspace settings; rotate at any time. The SDK never
 * batches — every decision is one POST, so a crashing agent can't lose
 * decisions it already made.
 *
 * Errors: the HTTP layer throws MnemeApiError on non-2xx responses; the
 * caller decides whether to retry. The SDK does NOT retry on its own —
 * decision logging is too important to silently re-attempt and risk
 * double-writes.
 */

export type AgentRunStatus = "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type PolicyViolationSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface MnemeClientOptions {
  workspaceId: string;
  apiKey: string;
  baseUrl: string;
  /** Defaults to the global fetch. Pass a custom fetch (e.g. for tests
   *  or for environments where fetch isn't ambient). */
  fetch?: typeof fetch;
}

export interface DecisionInput {
  decision_type: string;
  decision_content: string;
  context_used?: Record<string, unknown>;
  tool_called?: string;
  tool_output?: Record<string, unknown>;
}

export interface DecisionResult {
  decision_id: string;
  content_hash: string;
  previous_hash: string | null;
  supersessions: Array<{ supersededId: string; reason: string }>;
  violations: Array<{
    policyRuleId: string;
    severity: PolicyViolationSeverity;
    explanation: string;
  }>;
}

export class MnemeApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "MnemeApiError";
  }
}

export class MnemeClient {
  private readonly workspaceId: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: MnemeClientOptions) {
    this.workspaceId = opts.workspaceId;
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
  }

  /** Open a new agent run. Returns the run id used by subsequent
   *  logDecision and endRun calls. */
  async startRun(
    agentName: string,
    agentVersion: string,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    const body = { agent_name: agentName, agent_version: agentVersion, metadata: metadata ?? {} };
    const res = await this.request<{ run: { id: string } }>(
      "POST",
      `/api/workspaces/${this.workspaceId}/agent-runs`,
      body,
    );
    return res.run.id;
  }

  /** Log a single agent decision. Returns the decision id plus any
   *  supersessions or policy violations detected synchronously. The
   *  agent can read these arrays and react in-loop — abort, retry,
   *  escalate. */
  async logDecision(runId: string, decision: DecisionInput): Promise<DecisionResult> {
    return this.request<DecisionResult>(
      "POST",
      `/api/agent-runs/${runId}/decisions`,
      decision,
    );
  }

  /** Close an open run. After this call no further decisions can be
   *  logged against the run id (returns 409). */
  async endRun(runId: string, status: Exclude<AgentRunStatus, "RUNNING">): Promise<void> {
    await this.request<{ ok: true }>(
      "POST",
      `/api/agent-runs/${runId}/end`,
      { status },
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      throw new MnemeApiError(res.status, "INVALID_JSON", text || "Empty response");
    }
    if (!res.ok) {
      const err = parsed as { error?: string; code?: string } | null;
      throw new MnemeApiError(
        res.status,
        err?.code ?? "REQUEST_FAILED",
        err?.error ?? `HTTP ${res.status}`,
      );
    }
    return parsed as T;
  }
}
