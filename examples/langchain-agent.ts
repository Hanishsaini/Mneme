/**
 * Mneme × LangChain — a runnable tool-calling agent that writes its every
 * decision into a Mneme audit trail.
 *
 * The pattern is the whole point:
 *   1. `startRun` once, at the top.
 *   2. `logDecision` after every tool the agent calls — Mneme hashes it into
 *      the tamper-evident chain, checks it against the workspace's policy
 *      rules, and tells you in the response whether it superseded a prior
 *      decision or broke a rule.
 *   3. React in-loop: the agent (here, the wrapper) sees violations the
 *      instant they happen and can surface or abort.
 *   4. `endRun` when the agent finishes — COMPLETED, or FAILED if it threw.
 *
 * ─── Run it ──────────────────────────────────────────────────────────────
 *
 *   # from the repo root — install the example's extra deps:
 *   pnpm add -D langchain @langchain/openai @langchain/core
 *
 *   # point it at a real Mneme workspace + key (API Keys tab → Generate key):
 *   export MNEME_BASE_URL="https://your-mneme.app"   # or http://localhost:3000
 *   export MNEME_WORKSPACE_ID="ws_..."
 *   export MNEME_API_KEY="mnk_..."
 *   export OPENAI_API_KEY="sk-..."
 *
 *   pnpm tsx examples/langchain-agent.ts
 *
 * Tip: run it twice. The second run's pricing change supersedes the first
 * and — if your workspace has the seeded "no more than one pricing change
 * per week" rule active — trips a policy violation you'll see in the
 * console AND in the Decisions tab.
 */

import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { MnemeClient, type DecisionInput } from "../sdk/mneme";

// ─── Config ────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const mneme = new MnemeClient({
  baseUrl: requireEnv("MNEME_BASE_URL"),
  workspaceId: requireEnv("MNEME_WORKSPACE_ID"),
  apiKey: requireEnv("MNEME_API_KEY"),
});

// ─── The "business" the agent acts on (mocked) ───────────────────────────────

const OUR_PRICES: Record<string, number> = { "SKU-401": 119.99 };
const COMPETITOR_PRICES: Record<string, number> = { "SKU-401": 124.99 };

// ─── Audited tool wrapper ────────────────────────────────────────────────────
//
// Wrap a tool so that AFTER it runs, the call becomes a logged Mneme
// decision. The wrapper reads the supersession + violation arrays off the
// response and prints them — this is the "react in-loop" surface. The
// string the agent sees is augmented with a policy warning so the LLM
// itself can decide to back off.

function auditedTool<S extends z.ZodObject<z.ZodRawShape>>(config: {
  runId: string;
  name: string;
  description: string;
  schema: S;
  decisionType: string;
  /** Run the real side-effect; return the human-readable result string and
   *  the structured context/output to record on the decision. */
  run: (args: z.infer<S>) => {
    result: string;
    decision: Omit<DecisionInput, "decision_type">;
  };
}) {
  return new DynamicStructuredTool({
    name: config.name,
    description: config.description,
    schema: config.schema,
    func: async (args) => {
      const { result, decision } = config.run(args as z.infer<S>);

      const logged = await mneme.logDecision(config.runId, {
        decision_type: config.decisionType,
        ...decision,
      });

      console.log(`\n  ↳ logged decision ${logged.decision_id} (${config.decisionType})`);

      if (logged.supersessions.length > 0) {
        for (const s of logged.supersessions) {
          console.log(`    ⤺ supersedes ${s.supersededId}: ${s.reason}`);
        }
      }

      if (logged.violations.length > 0) {
        for (const v of logged.violations) {
          console.warn(`    ⚠ POLICY VIOLATION [${v.severity}]: ${v.explanation}`);
        }
        // Feed the warning back to the LLM so it can choose to abort/revert.
        return `${result}\n\nWARNING: this action violated ${logged.violations.length} workspace policy rule(s). Reconsider before proceeding.`;
      }

      return result;
    },
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const runId = await mneme.startRun("langchain-pricing-agent", "v1.0.0", {
    framework: "langchain",
    example: true,
  });
  console.log(`Started Mneme run: ${runId}`);

  try {
    const tools = [
      auditedTool({
        runId,
        name: "get_competitor_price",
        description: "Look up the current competitor price for a product SKU.",
        schema: z.object({ sku: z.string().describe("The product SKU, e.g. SKU-401") }),
        decisionType: "PRICE_LOOKUP",
        run: ({ sku }) => {
          const price = COMPETITOR_PRICES[sku] ?? 0;
          return {
            result: `Competitor price for ${sku} is $${price.toFixed(2)}.`,
            decision: {
              decision_content: `Looked up competitor price for ${sku}: $${price.toFixed(2)}`,
              context_used: { sku, ourPrice: OUR_PRICES[sku] },
              tool_called: "get_competitor_price",
              tool_output: { sku, competitorPrice: price },
            },
          };
        },
      }),
      auditedTool({
        runId,
        name: "set_price",
        description: "Set our selling price for a product SKU.",
        schema: z.object({
          sku: z.string().describe("The product SKU"),
          price: z.number().describe("The new price in dollars"),
        }),
        decisionType: "PRICING_UPDATE",
        run: ({ sku, price }) => {
          const previous = OUR_PRICES[sku];
          OUR_PRICES[sku] = price;
          return {
            result: `Set ${sku} price to $${price.toFixed(2)} (was $${previous?.toFixed(2) ?? "n/a"}).`,
            decision: {
              decision_content: `Set ${sku} price to $${price.toFixed(2)}`,
              context_used: { sku, previousPrice: previous, competitorPrice: COMPETITOR_PRICES[sku] },
              tool_called: "stripe.products.update",
              tool_output: { sku, newPrice: price, updated: true },
            },
          };
        },
      }),
    ];

    const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "You are a pricing agent. Use the tools to inspect the market and set prices. Be decisive."],
      ["human", "{input}"],
      ["placeholder", "{agent_scratchpad}"],
    ]);

    const agent = createToolCallingAgent({ llm, tools, prompt });
    const executor = new AgentExecutor({ agent, tools });

    const result = await executor.invoke({
      input:
        "Check the competitor's price for SKU-401, then set our price to undercut them by $5.",
    });

    console.log(`\nAgent finished: ${result.output}`);
    await mneme.endRun(runId, "COMPLETED");
    console.log(`Closed Mneme run ${runId} as COMPLETED.`);
  } catch (err) {
    // Close the run as FAILED so the audit trail reflects what really happened.
    await mneme.endRun(runId, "FAILED").catch(() => undefined);
    console.error("Agent run failed:", err);
    process.exitCode = 1;
  }
}

void main();
