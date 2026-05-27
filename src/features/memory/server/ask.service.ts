import "server-only";
import { prisma } from "@/lib/db/prisma";
import { generateText } from "@/features/ai/server/ai-service";
import { resolveEmbeddingProvider } from "./embedding-provider";

/**
 * "Ask your team's memory" — the surface that makes the landing-page
 * pitch real. Vector-searches the workspace's embedded messages, hands
 * the top hits to the LLM as context, and gets back a single
 * paragraph-shaped answer with `[1]`-style citation markers tied to the
 * `sources` array we return alongside.
 *
 * Distinct from the embedding `searchMemory` used by the prompt-composer
 * surface because:
 *   - The retrieval window here is larger (more context, slower threshold)
 *   - We do a second LLM pass to synthesize, not just rank
 *   - We expose citation indices the UI can render as clickable footnote
 *     numbers next to passages of the answer
 */

const TOP_K = 6;
const SNIPPET_CHARS = 320;
const DISTANCE_CEILING = 0.7;
const ANSWER_MAX_TOKENS = 600;

export interface AskSource {
  index: number;
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  snippet: string;
  similarity: number;
  createdAt: string;
}

export interface AskResult {
  answer: string;
  sources: AskSource[];
}

const SYSTEM_PROMPT = `You answer questions about a team's past AI conversations using only the provided context.

Rules:
- Ground every claim in the context. Cite sources inline as [1], [2], [N] tied to the numbered context blocks.
- If multiple blocks support the same claim, cite all of them: [1][3].
- If the context does not contain the answer, say so explicitly. Do NOT invent.
- One concise paragraph, no preamble like "Based on the context...".
- No bullet lists unless the user explicitly asked for them.
- Sentence case; plain prose.`;

interface RawRow {
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  content: string;
  distance: number;
  createdAt: Date;
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export async function askWorkspaceMemory(
  workspaceId: string,
  query: string,
): Promise<AskResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { answer: "", sources: [] };
  }

  // 1. Embed the question + cosine-search workspace embeddings.
  const provider = resolveEmbeddingProvider();
  const vec = await provider.embed(trimmed);
  const literal = vectorLiteral(vec);

  const rows = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT
       e."messageId",
       e."conversationId",
       c."title" AS "conversationTitle",
       e.content,
       (e.embedding <=> $1::vector)::float AS distance,
       e."createdAt"
     FROM "Embedding" e
     JOIN "Conversation" c ON c.id = e."conversationId"
     WHERE e."workspaceId" = $2
       AND e.embedding IS NOT NULL
     ORDER BY e.embedding <=> $1::vector
     LIMIT $3`,
    literal,
    workspaceId,
    TOP_K,
  );

  // 2. Threshold-filter so off-topic noise doesn't dilute the prompt.
  const hits = rows.filter((r) => r.distance < DISTANCE_CEILING);
  if (hits.length === 0) {
    return {
      answer:
        "I don't see anything in your team's past conversations that touches on that. Once you've discussed this topic with the AI, future questions will find it here.",
      sources: [],
    };
  }

  const sources: AskSource[] = hits.map((r, i) => ({
    index: i + 1,
    messageId: r.messageId,
    conversationId: r.conversationId,
    conversationTitle: r.conversationTitle,
    snippet:
      r.content.length > SNIPPET_CHARS
        ? `${r.content.slice(0, SNIPPET_CHARS - 1)}…`
        : r.content,
    similarity: Math.max(0, Math.min(1, 1 - r.distance)),
    createdAt: r.createdAt.toISOString(),
  }));

  // 3. Build the numbered context block + ask the model to synthesize.
  const context = sources
    .map(
      (s) =>
        `[${s.index}] (thread: ${s.conversationTitle})\n${s.snippet}`,
    )
    .join("\n\n");

  const answer = await generateText({
    instructions: SYSTEM_PROMPT,
    input: [
      {
        role: "user",
        content: `Context:\n${context}\n\nQuestion: ${trimmed}`,
      },
    ],
    maxTokens: ANSWER_MAX_TOKENS,
  });

  return { answer: answer.trim(), sources };
}
