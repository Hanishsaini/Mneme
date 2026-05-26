/**
 * Minimal Server-Sent Events helpers shared by the AI streaming endpoint
 * and (eventually) any other long-lived push surface.
 *
 * Pure encoding — no Node/Web Stream coupling, so the same helper works
 * inside Next's Edge runtime and Node runtime route handlers identically.
 */

const ENCODER = new TextEncoder();

/**
 * Format one SSE message. JSON-stringifies the payload, prepends the event
 * name, and terminates with the required blank line. Multi-line payloads
 * are uncommon for our use (we only send JSON), so a single `data:` field
 * is sufficient — the spec allows but doesn't require splitting on \n.
 */
export function encodeSSE(event: string, data: unknown): Uint8Array {
  const json = JSON.stringify(data);
  return ENCODER.encode(`event: ${event}\ndata: ${json}\n\n`);
}

/** Periodic ping so proxies / load balancers don't kill the connection on
 *  long quiet stretches (e.g. between user prompt and first AI token). */
export function encodeSSEPing(): Uint8Array {
  return ENCODER.encode(`: ping ${Date.now()}\n\n`);
}

export const SSE_HEADERS: HeadersInit = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  // Required for Nginx-fronted hosts (Vercel uses one) — otherwise it
  // buffers up to 4 KB before flushing, which kills the perceived
  // streaming feel.
  "x-accel-buffering": "no",
  connection: "keep-alive",
};
