import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getServerEnv } from "@/config/env";
import type { AiProvider, AiStreamInput, AiUsage } from "./types";

/**
 * Gemini — the secondary free-tier fallback. Default model: gemini-2.5-flash
 * (generous free quota, fast, current generation). Used automatically when
 * Groq is unavailable or errors before streaming begins.
 *
 * Gemini's API differs from the OpenAI shape in two ways the adapter below
 * normalizes: the system prompt is a model-level `systemInstruction`, and
 * the assistant role is named "model".
 */

let sdk: GoogleGenerativeAI | null = null;
function gemini(): GoogleGenerativeAI {
  if (!sdk) {
    sdk = new GoogleGenerativeAI(getServerEnv().GEMINI_API_KEY ?? "");
  }
  return sdk;
}

function toContents(input: AiStreamInput) {
  return input.input.map((t) => ({
    role: t.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: t.content }],
  }));
}

export function createGeminiProvider(): AiProvider {
  const model = getServerEnv().GEMINI_MODEL;

  function getModel(systemInstruction: string) {
    return gemini().getGenerativeModel({ model, systemInstruction });
  }

  return {
    id: "gemini",
    model,

    async *streamCompletion(input) {
      const result = await getModel(input.instructions).generateContentStream({
        contents: toContents(input),
        generationConfig: { maxOutputTokens: input.maxTokens },
      });

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) yield text;
      }

      const response = await result.response;
      const meta = response.usageMetadata;
      const usage: AiUsage | null = meta
        ? {
            promptTokens: meta.promptTokenCount,
            completionTokens: meta.candidatesTokenCount,
          }
        : null;
      return { usage };
    },

    async generateText(input) {
      const result = await getModel(input.instructions).generateContent({
        contents: toContents(input),
        generationConfig: { maxOutputTokens: input.maxTokens },
      });
      return result.response.text() ?? "";
    },
  };
}
