import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getServerEnv } from "@/config/env";

/**
 * Embedding provider abstraction. Parallel to the AI provider abstraction
 * — same lazy-init pattern, same swap-the-impl-and-everything-still-works
 * shape. For Team Memory v1 we run on Gemini's `text-embedding-004`
 * (free tier, 768 dims). Swapping to OpenAI's `text-embedding-3-small`
 * (1536 dims) means changing one factory and the pgvector column width.
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
  const modelName = "text-embedding-004";

  return {
    id: "gemini",
    model: modelName,
    dimensions: 768,

    async embed(text) {
      const model = gemini().getGenerativeModel({ model: modelName });
      const result = await model.embedContent(text);
      return result.embedding.values;
    },

    async embedMany(texts) {
      const model = gemini().getGenerativeModel({ model: modelName });
      const result = await model.batchEmbedContents({
        requests: texts.map((t) => ({
          content: { parts: [{ text: t }], role: "user" },
        })),
      });
      return result.embeddings.map((e) => e.values);
    },
  };
}

export function resolveEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;
  cached = createGeminiEmbeddingProvider();
  return cached;
}
