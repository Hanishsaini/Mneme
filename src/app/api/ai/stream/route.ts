import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/api/handler";
import { getCurrentUser } from "@/lib/auth/session";
import { requireConversationAccess } from "@/lib/auth/authz";
import { Errors } from "@/lib/api/errors";
import { runAiTurnStream } from "@/features/ai/server/ai-orchestrator";
import { encodeSSE, encodeSSEPing, SSE_HEADERS } from "@/lib/sse";

const bodySchema = z.object({
  clientMsgId: z.string().min(1),
  conversationId: z.string().min(1),
  workspaceId: z.string().min(1),
  text: z.string().min(1).max(8000),
});

/**
 * Node runtime — the orchestrator imports Prisma, ioredis, and other
 * Node-only deps. Edge would force a major refactor for no gain.
 */
export const runtime = "nodejs";
/** Vercel caps `nodejs` route handlers at 10s on Hobby and 60s on Pro for
 *  default duration. AI streams routinely run longer; bump to the maximum
 *  allowed for the current plan. The setting is ignored on self-hosted Node. */
export const maxDuration = 60;

/**
 * POST /api/ai/stream — Server-Sent Events
 *
 * The browser POSTs the user's draft; the response is `text/event-stream`
 * carrying the full turn lifecycle: user message echo, AI run start, every
 * token delta, then either completion or error. This replaced the original
 * Redis+socket fan-out so the deployed Next.js app can serve chat without
 * a second long-lived process.
 *
 * Auth comes from the NextAuth session cookie (no service-token path — the
 * socket server is the only caller that ever needed that). `req.signal`
 * propagates client disconnects into the generator so closing the browser
 * tab cleanly terminates the run.
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;
  let userId: string;

  // Validate + authorize synchronously so any failure here returns a
  // normal JSON error instead of a half-formed SSE stream.
  try {
    const user = await getCurrentUser();
    if (!user) throw Errors.unauthorized();
    userId = user.id;
    body = bodySchema.parse(await req.json());
    await requireConversationAccess(userId, body.conversationId, "EDITOR");
  } catch (err) {
    return toErrorResponse(err);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Idle ping — fires every 15s so reverse proxies (Vercel's Nginx,
      // Cloudflare) don't close a quiet socket between prompt and first
      // token. Cheap; doesn't affect the message channel.
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encodeSSEPing());
        } catch {
          clearInterval(pingInterval);
        }
      }, 15_000);

      try {
        const generator = runAiTurnStream(
          {
            workspaceId: body.workspaceId,
            conversationId: body.conversationId,
            userId,
            clientMsgId: body.clientMsgId,
            text: body.text,
          },
          req.signal,
        );

        for await (const event of generator) {
          controller.enqueue(encodeSSE(event.type, event));
        }
      } catch (err) {
        // The generator handles its own errors and emits ai_error frames;
        // anything thrown out here is a setup-time failure (rate limit,
        // lock contention) — surface it as one final SSE error frame so
        // the browser doesn't just see a silent close.
        const message =
          err instanceof Error ? err.message : "Stream failed";
        try {
          controller.enqueue(
            encodeSSE("ai_error", { runId: null, error: message }),
          );
        } catch {
          // controller might already be closed if the client bailed —
          // swallow.
        }
      } finally {
        clearInterval(pingInterval);
        try {
          controller.close();
        } catch {
          // double-close is fine
        }
      }
    },
  });

  return new NextResponse(stream, { headers: SSE_HEADERS });
}
