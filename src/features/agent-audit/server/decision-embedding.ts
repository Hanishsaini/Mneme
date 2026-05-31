import "server-only";
import { resolveEmbeddingProvider } from "@/features/memory/server/embedding-provider";

/** Thin wrapper around the existing Gemini embedding provider so the
 *  agent-audit code doesn't reach into features/memory directly. */
const MAX_INPUT_CHARS = 8000;

export async function embedDecisionContent(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const clipped = trimmed.slice(0, MAX_INPUT_CHARS);
  const provider = resolveEmbeddingProvider();
  return provider.embed(clipped);
}

export async function embedPolicyRule(text: string): Promise<number[] | null> {
  return embedDecisionContent(text);
}
