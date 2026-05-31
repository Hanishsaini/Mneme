import "server-only";
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Demo seed — runs at workspace creation time so a brand-new user
 * lands in /audit and immediately sees:
 *
 *   • One example agent run with 6 backdated decisions
 *   • An amber "supersedes prior" badge on decision #3 (it replaces #1)
 *   • A red policy-violation card on decision #5 (it violates the seeded
 *     "no pricing change within 7 days" rule)
 *   • One active policy rule
 *
 * The old empty-workspace problem killed Mneme v1. Fixing it here is
 * the single biggest churn lever — a stranger goes from "interesting
 * idea" to "I get exactly what this product does" in ~30 seconds.
 *
 * The seed bypasses the LLM-driven supersession + policy engines and
 * writes the supersession FK + PolicyViolation rows directly. Same
 * shape as what the production pipeline produces, but deterministic
 * and free. Embeddings are skipped — the demo is illustrative; the
 * user's own decisions will exercise the real embedding path.
 *
 * Failures are swallowed at the call site so a seed hiccup never
 * blocks workspace creation.
 */

const AGENT_NAME = "example-pricing-agent";
const AGENT_VERSION = "v0.1.0";
const POLICY_RULE_TEXT =
  "Do not change product pricing more than once per week. Each pricing decision must be at least 7 days after the previous pricing decision for the same product.";

interface SeedDecision {
  type: string;
  content: string;
  context: Record<string, unknown>;
  toolCalled: string | null;
  toolOutput: Record<string, unknown> | null;
  daysAgo: number;
}

const DECISIONS: SeedDecision[] = [
  {
    type: "PRICING_UPDATE",
    content: "Set product SKU-401 (Acme Widget Pro) base price to $119.99.",
    context: { sku: "SKU-401", previous_price: 109.99, competitor_floor: 124.99, signal: "Demand softening; reduce 3.6% to defend share." },
    toolCalled: "stripe.products.update",
    toolOutput: { id: "prod_SK401", price_id: "price_3a", updated: true },
    daysAgo: 14,
  },
  {
    type: "REFUND_APPROVAL",
    content: "Approve full refund for order #20247 (SKU-220, $84.00) — customer reported damaged shipment.",
    context: { order_id: "20247", customer: "cust_4912", reason: "damaged_in_transit", amount_cents: 8400 },
    toolCalled: "stripe.refunds.create",
    toolOutput: { id: "re_8x21k", status: "succeeded" },
    daysAgo: 12,
  },
  {
    type: "PRICING_UPDATE",
    content: "Set product SKU-401 (Acme Widget Pro) base price to $129.99 — competitor exited the segment; recover margin.",
    context: { sku: "SKU-401", previous_price: 119.99, competitor_floor: null, signal: "Competitor B retired SKU on Apr 22; +8.3% defended." },
    toolCalled: "stripe.products.update",
    toolOutput: { id: "prod_SK401", price_id: "price_3b", updated: true },
    daysAgo: 9,
  },
  {
    type: "INVENTORY_REORDER",
    content: "Reorder 240 units of SKU-118 (lead time 11 days; current stock 38; projected stockout in 6 days).",
    context: { sku: "SKU-118", current_stock: 38, projected_stockout_days: 6, supplier: "Vendor-3" },
    toolCalled: "vendor3.orders.create",
    toolOutput: { po_number: "PO-77310", confirmed: true },
    daysAgo: 6,
  },
  {
    type: "PRICING_UPDATE",
    content: "Set product SKU-401 (Acme Widget Pro) base price to $134.99 — demand stayed strong post-increase; push another 3.8%.",
    context: { sku: "SKU-401", previous_price: 129.99, days_since_last_change: 3, signal: "Conversion rate unchanged at $129.99; test upside." },
    toolCalled: "stripe.products.update",
    toolOutput: { id: "prod_SK401", price_id: "price_3c", updated: true },
    daysAgo: 5,
  },
  {
    type: "REFUND_APPROVAL",
    content: "Approve partial refund ($14.00) for order #20891 — late delivery, 15% courtesy.",
    context: { order_id: "20891", customer: "cust_8821", reason: "late_delivery", amount_cents: 1400 },
    toolCalled: "stripe.refunds.create",
    toolOutput: { id: "re_b9q4n", status: "succeeded" },
    daysAgo: 2,
  },
];

const VIOLATION_EXPLANATION =
  "This pricing change for SKU-401 happened 3 days after the previous pricing change (Apr 21 → Apr 24). The policy requires at least 7 days between pricing changes for the same product.";

export async function seedDemoAgentAudit(workspaceId: string): Promise<void> {
  try {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    // 1) Policy rule — created earliest so its createdAt predates the run.
    const rule = await prisma.policyRule.create({
      data: {
        workspaceId,
        ruleText: POLICY_RULE_TEXT,
        isActive: true,
        createdAt: new Date(now - 16 * dayMs),
        updatedAt: new Date(now - 16 * dayMs),
      },
      select: { id: true },
    });

    // 2) Agent run — backdated to before the earliest decision.
    const run = await prisma.agentRun.create({
      data: {
        workspaceId,
        agentName: AGENT_NAME,
        agentVersion: AGENT_VERSION,
        status: "COMPLETED",
        metadata: { framework: "langchain", trace_id: "demo-trace-001" } as Prisma.InputJsonValue,
        startedAt: new Date(now - 15 * dayMs),
        endedAt: new Date(now - 1 * dayMs),
        createdAt: new Date(now - 15 * dayMs),
        updatedAt: new Date(now - 1 * dayMs),
      },
      select: { id: true },
    });

    // 3) Decisions — chained content_hash, backdated decidedAt.
    let prevHash: string | null = null;
    const createdIds: string[] = [];
    for (const d of DECISIONS) {
      const decidedAt = new Date(now - d.daysAgo * dayMs);
      const hash = chainedHash(d.content, d.context, prevHash);
      const row = await prisma.agentDecisionEvent.create({
        data: {
          runId: run.id,
          workspaceId,
          decisionType: d.type,
          decisionContent: d.content,
          contextUsed: d.context as Prisma.InputJsonValue,
          toolCalled: d.toolCalled,
          toolOutput: (d.toolOutput ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          contentHash: hash,
          previousHash: prevHash,
          decidedAt,
          createdAt: decidedAt,
          updatedAt: decidedAt,
        },
        select: { id: true },
      });
      createdIds.push(row.id);
      prevHash = hash;
    }

    // 4) Supersession: decision #3 supersedes decision #1 (indices 2 and 0).
    if (createdIds.length >= 3) {
      await prisma.agentDecisionEvent.update({
        where: { id: createdIds[0] },
        data: {
          supersededById: createdIds[2],
          supersededReason:
            "Newer pricing decision replaced this one — competitor exited the segment, agent reverted SKU-401 to $129.99.",
        },
      });
    }

    // 5) Policy violation on decision #5.
    if (createdIds.length >= 5) {
      await prisma.policyViolation.create({
        data: {
          decisionEventId: createdIds[4],
          policyRuleId: rule.id,
          violationExplanation: VIOLATION_EXPLANATION,
          severity: "HIGH",
          detectedAt: new Date(now - 5 * dayMs),
        },
      });
    }
  } catch (err) {
    // Don't poison workspace creation if the seed fails — log and move on.
    console.error(`[agent-audit] demo seed failed for workspace ${workspaceId}:`, err);
  }
}

function chainedHash(
  decisionContent: string,
  contextUsed: Record<string, unknown>,
  previousHash: string | null,
): string {
  const canonical = canonicalJSON(contextUsed);
  const input = `${decisionContent}\n${canonical}\n${previousHash ?? ""}`;
  return createHash("sha256").update(input).digest("hex");
}

function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`).join(",")}}`;
}
