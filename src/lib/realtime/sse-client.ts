"use client";

/**
 * Tiny SSE consumer for the AI streaming endpoint.
 *
 * The Web Streams API gives us bytes; SSE is a line-oriented text protocol;
 * we bridge the two and call the consumer once per complete `event: …\ndata:
 * …\n\n` frame. Keeps the protocol details in one place so callers just
 * handle typed events.
 */

export interface SSEFrame {
  event: string;
  data: unknown;
}

export type SSEHandler = (frame: SSEFrame) => void;

/**
 * Consumes the SSE stream until it ends (server close, client abort, or
 * stream error). Returns when the stream is exhausted; throws on parse
 * errors so the caller can decide how to surface them.
 */
export async function consumeSSE(
  body: ReadableStream<Uint8Array>,
  onFrame: SSEHandler,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const onAbort = () => {
    // Cancel the reader so the await resolves promptly.
    reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Split off all complete frames; keep the trailing partial in the
      // buffer for the next chunk.
      let sepIdx: number;
      while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        const frame = parseFrame(raw);
        if (frame) onFrame(frame);
      }
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

function parseFrame(raw: string): SSEFrame | null {
  let event: string | null = null;
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith(":")) continue; // comment / ping
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon);
    // Per spec, a single space after the colon is stripped.
    const value =
      line[colon + 1] === " " ? line.slice(colon + 2) : line.slice(colon + 1);
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }
  if (!event || dataLines.length === 0) return null;
  const joined = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(joined) };
  } catch {
    return null;
  }
}
