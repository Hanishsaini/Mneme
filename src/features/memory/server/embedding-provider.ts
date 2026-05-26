import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getServerEnv } from "@/config/env";

/**
 * Embedding provider abstraction. Parallel to the AI provider abstraction
 * — same lazy-init pattern, same swap-the-impl-and-everything-still-works
 * shape. For Team Memory v1 we run on Gemini's `gemini-embedding-001`
 * with `outputDimensionality: 768` so the vectors fit our existing
 * `pgvector(768)` column (the earlier `text-embedding-004` was retired
 * by Google). Swapping to OpenAI's `text-embedding-3-small` (1536 dims)
 * means changing one factory plus the pgvector column width.
 */

export interface EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
}

let cached: EmbeddingProvider | null = null;
let cachedSdk: GoogleGenerativeAI | null = null;

function gemini(): GoogleGenerativeAI {
  if (!cachedSdk) {
    const apiKey = getServerEnv().GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is required for embeddings — set it in .env.local",
      );
    }
    cachedSdk = new GoogleGenerativeAI(apiKey);
  }
  return cachedSdk;
}

function createGeminiEmbeddingProvider(): EmbeddingProvider {
  // `gemini-embedding-001` is the current GA model. Defaults to 3072 dims;
  // we explicitly request 768 via `outputDimensionality` to match the
  // pgvector(768) column from the original migration. Bumping to a wider
  // vector would require a fresh migration + reindex.
  const modelName = "gemini-embedding-001";
  const dimensions = 768;

  return {
    id: "gemini",
    model: modelName,
    dimensions,

    async embed(text) {
      const model = gemini().getGenerativeModel({ model: modelName });
      // The `@google/generative-ai` SDK shipped before `outputDimensionality`
      // was added to the embedding API. The field is honored at runtime
      // (verified against /v1beta/models/gemini-embedding-001:embedContent)
      // but isn't in the types — cast through the union to pass type-check.
      const result = await model.embedContent({
        content: { parts: [{ text }], role: "user" },
        outputDimensionality: dimensions,
      } as unknown as Parameters<typeof model.embedContent>[0]);
      return result.embedding.values;
    },

    async embedMany(texts) {
      const model = gemini().getGenerativeModel({ model: modelName });
      const result = await model.batchEmbedContents({
        requests: texts.map((t) => ({
          content: { parts: [{ text: t }], role: "user" },
          outputDimensionality: dimensions,
        })),
      } as unknown as Parameters<typeof model.batchEmbedContents>[0]);
      return result.embeddings.map((e) => e.values);
    },
  };
}

export function resolveEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;
  cached = createGeminiEmbeddingProvider();
  return cached;
}
