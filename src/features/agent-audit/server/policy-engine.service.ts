import "server-only";
import type { PolicyViolationSeverity } from "@workspace/shared";
import { prisma } from "@/lib/db/prisma";
import { generateText } from "@/features/ai/server/ai-service";
import { embedDecisionContent } from "./decision-embedding";

/**
 * Policy engine — given a new agent decision, check it against every
 * active policy rule in the workspace and write a PolicyViolation row
 * for each match.
 *
 * Architecture:
 *   1. Compute decision embedding (passed in from the orchestrator —
 *      already computed for the decision row, no need to re-embed).
 *   2. Score every active rule by cosine similarity. Take the top-10
 *      most-similar rules. (Cheap pre-filter; the LLM call only runs
 *      against rules that are at least topically related.)
 *   3. Single LLM call that returns an array of `{ ruleId, violates,
 *      severity, explanation }`. Drops hallucinated ruleIds.
 *   4. Write PolicyViolation rows for the violations.
 *
 * Returns the violation list so the SDK response carries them
 * (the agent can react in-loop).
 */

const TOP_K_RULES = 10;
const VIOLATIONS_PROMPT = `You are a compliance reviewer. A new agent decision has just been logged. You receive the decision plus a list of active POLICY RULES the workspace has defined. For each rule, decide whether the decision violates it.

Return ONE JSON array (no markdown fences, no prose):

[
  { "ruleId": "<exact-id-from-rules>", "violates": true | false, "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", "explanation": "<one short sentence on what the decision did vs what the rule requires>" },
  ...
]

Rules:
- Include one entry per rule in the input (don't skip rules).
- "violates: true" only when the decision genuinely breaks the rule. False positives erode trust.
- Severity: LOW = minor / advisory, MEDIUM = standard, HIGH = significant, CRITICAL = regulatory or safety-critical.
- Use the exact ruleId from the rules list. Never invent an id.
- Output JSON array only.`;

export interface PolicyViolation {
  policyRuleId: string;
  severity: PolicyViolationSeverity;
  explanation: string;
}

const SEVERITIES: PolicyViolationSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

interface ActiveRule {
  id: string;
  ruleText: string;
}

export async function checkPolicies(args: {
  workspaceId: string;
  decisionId: string;
  decisionType: string;
  decisionContent: string;
  decisionEmbedding: number[] | null;
}): Promise<PolicyViolation[]> {
  try {
    const candidateRules = await pickCandidateRules(
      args.workspaceId,
      args.decisionEmbedding,
    );
    if (candidateRules.length === 0) return [];

    const prompt = buildPrompt(args.decisionType, args.decisionContent, candidateRules);
    const raw = await generateText({
      instructions: VIOLATIONS_PROMPT,
      input: [{ role: "user", content: prompt }],
      maxTokens: 800,
    });

    const parsed = parseViolations(raw);
    const validIds = new Set(candidateRules.map((r) => r.id));
    const violations: PolicyViolation[] = [];
    for (const v of parsed) {
      if (!v.violates) continue;
      if (!validIds.has(v.ruleId)) continue;
      violations.push({
        policyRuleId: v.ruleId,
        severity: v.severity,
        explanation: v.explanation,
      });
    }

    if (violations.length === 0) return [];

    // Persist atomically — all violations or none, so a partial write
    // doesn't leave the audit trail in an inconsistent state.
    await prisma.$transaction(
      violations.map((v) =>
        prisma.policyViolation.create({
          data: {
            decisionEventId: args.decisionId,
            policyRuleId: v.policyRuleId,
            violationExplanation: v.explanation,
            severity: v.severity,
          },
        }),
      ),
    );

    return violations;
  } catch (err) {
    console.error(`[agent-audit] policy engine failed:`, err);
    return [];
  }
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

interface RankedRule {
  id: string;
  ruleText: string;
  distance: number;
}

async function pickCandidateRules(
  workspaceId: string,
  embedding: number[] | null,
): Promise<ActiveRule[]> {
  if (embedding) {
    const rows = await prisma.$queryRawUnsafe<RankedRule[]>(
      `SELECT id, "ruleText", (("ruleEmbedding" <=> $1::vector)::float) AS distance
       FROM "PolicyRule"
       WHERE "workspaceId" = $2 AND "isActive" = true AND "ruleEmbedding" IS NOT NULL
       ORDER BY "ruleEmbedding" <=> $1::vector
       LIMIT ${TOP_K_RULES}`,
      vectorLiteral(embedding),
      workspaceId,
    );
    if (rows.length > 0) {
      return rows.map((r) => ({ id: r.id, ruleText: r.ruleText }));
    }
  }
  // Fallback when embedding is null (e.g., embedding provider offline) —
  // run the LLM against every active rule (capped). At small policy counts
  // this is still cheap; large policy counts will degrade gracefully.
  return prisma.policyRule.findMany({
    where: { workspaceId, isActive: true },
    take: TOP_K_RULES,
    select: { id: true, ruleText: true },
  });
}

function buildPrompt(
  decisionType: string,
  decisionContent: string,
  rules: ActiveRule[],
): string {
  const ruleBlock = rules
    .map((r) => `Rule ${r.id}\n  text: ${r.ruleText}`)
    .join("\n\n");
  return `AGENT DECISION\n  type: ${decisionType}\n  text: ${decisionContent}\n\nACTIVE POLICY RULES\n\n${ruleBlock}`;
}

interface ParsedRow {
  ruleId: string;
  violates: boolean;
  severity: PolicyViolationSeverity;
  explanation: string;
}

function parseViolations(raw: string): ParsedRow[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  let arr: unknown[];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    arr = parsed;
  } catch {
    return [];
  }

  const out: ParsedRow[] = [];
  for (const entry of arr) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.ruleId !== "string") continue;
    const violates = e.violates === true;
    const severity = SEVERITIES.includes(e.severity as PolicyViolationSeverity)
      ? (e.severity as PolicyViolationSeverity)
      : "MEDIUM";
    const explanation =
      typeof e.explanation === "string" && e.explanation.trim().length > 0
        ? e.explanation.trim()
        : "Policy violation detected.";
    out.push({ ruleId: e.ruleId, violates, severity, explanation });
  }
  return out;
}
