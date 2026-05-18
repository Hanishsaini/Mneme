import "server-only";
import { redisKeys } from "@workspace/shared";
import { acquireLock, releaseLock } from "@/lib/redis/locks";
import { nextMessageSeq } from "@/lib/redis/sequence";
import { checkAiRateLimit } from "@/lib/redis/ratelimit";
import { clearRunAbort, isRunAborted } from "@/lib/redis/run-control";
import { publishToWorkspace } from "@/lib/realtime/publish";
import { toMessageDTO } from "@/lib/db/mappers";
import { Errors } from "@/lib/api/errors";
import { CONVERSATION_LOCK_TTL_SECONDS } from "@/config/constants";
import {
  completeAiRun,
  completeMessage,
  createAiRun,
  createMessage,
  failAiRun,
  failMessage,
  findMessageByClientId,
} from "@/features/conversation/server/message.repository";
import { buildContext } from "./context-builder";
import { aiProviderInfo, streamCompletion } from "./ai-service";
import { StreamBuffer } from "./stream-buffer";
import { maybeRefreshSummary } from "./memory";

export interface RunAiTurnInput {
  workspaceId: string;
  conversationId: string;
  userId: string;
  clientMsgId: string;
  text: string;
}

/**
 * The hot path. Invoked by /api/ai/stream. Steps:
 *  1. rate-limit the user
 *  2. acquire a per-conversation lock (one AI run at a time)
 *  3. persist the user message idempotently, broadcast it
 *  4. create the assistant placeholder + AiRun, broadcast ai:run:started
 *  5. stream OpenAI tokens, publishing each delta to the per-run channel
 *  6. persist the final assistant message, broadcast ai:run:completed
 *
 * Tokens travel via Redis — NOT this function's HTTP response — so both
 * workspace members receive an identical stream from a single upstream call,
 * and a disconnect of the submitting client never aborts the run.
 *
 * Returns once the user message + run are committed; streaming continues in
 * a detached task that the caller does not await.
 */
export async function runAiTurn(input: RunAiTurnInput): Promise<{
  runId: string;
  messageId: string;
}> {
  const { workspaceId, conversationId, userId, clientMsgId, text } = input;

  const rate = await checkAiRateLimit(userId);
  if (!rate.allowed) throw Errors.rateLimited();

  const lock = await acquireLock(
    redisKeys.conversationLock(conversationId),
    CONVERSATION_LOCK_TTL_SECONDS,
  );
  if (!lock) {
    throw Errors.conflict("The AI is already responding in this conversation.");
  }

  try {
    // (3) Idempotent user message — a reconnect retry must not double-post.
    let userMessage = await findMessageByClientId(conversationId, clientMsgId);
    if (!userMessage) {
      const seq = await nextMessageSeq(conversationId);
      userMessage = await createMessage({
        conversationId,
        role: "USER",
        authorId: userId,
        content: text,
        status: "COMPLETE",
        serverSeq: seq,
        clientMsgId,
      });
      await publishToWorkspace(workspaceId, "chat:message:created", {
        message: toMessageDTO(userMessage),
      });
    }

    // (4) Assistant placeholder + run record.
    const assistantSeq = await nextMessageSeq(conversationId);
    const assistantMessage = await createMessage({
      conversationId,
      role: "ASSISTANT",
      authorId: null,
      content: "",
      status: "STREAMING",
      serverSeq: assistantSeq,
    });
    // Record which model actually answered — the provider abstraction
    // means this may be groq / gemini / openai / mock depending on env.
    const run = await createAiRun({
      conversationId,
      messageId: assistantMessage.id,
      model: aiProviderInfo().model,
    });

    await publishToWorkspace(workspaceId, "ai:run:started", {
      runId: run.id,
      conversationId,
      messageId: assistantMessage.id,
    });

    // (5) + (6) Detached streaming task. The route handler returns now.
    void streamAndPersist({
      runId: run.id,
      workspaceId,
      conversationId,
      messageId: assistantMessage.id,
      lockKey: lock.key,
      lockToken: lock.token,
    });

    return { runId: run.id, messageId: assistantMessage.id };
  } catch (err) {
    await releaseLock(lock);
    throw err;
  }
}

interface StreamArgs {
  runId: string;
  workspaceId: string;
  conversationId: string;
  messageId: string;
  lockKey: string;
  lockToken: string;
}

/**
 * Streams the model output through a StreamBuffer, which handles both token
 * fan-out (coalesced publishes to the Redis per-run channel) and incremental
 * persistence (periodic DB checkpoints for interrupt-safety). On completion
 * it finalizes the message; on failure it keeps whatever partial content the
 * buffer captured. Either way it releases the lock and kicks off a
 * fire-and-forget shared-memory refresh.
 */
async function streamAndPersist(args: StreamArgs): Promise<void> {
  const { runId, workspaceId, conversationId, messageId } = args;
  const buffer = new StreamBuffer(workspaceId, runId, messageId);

  try {
    const context = await buildContext(conversationId, workspaceId);
    const generator = streamCompletion(context);

    // Poll the Redis abort flag every ~250ms. Can't cancel the upstream HTTP
    // request from here, but breaking the consume loop is enough — the
    // finally block persists whatever the buffer captured. Cheap enough at
    // 4 Redis GETs/sec to fit comfortably in the Upstash free tier.
    const ABORT_POLL_MS = 250;
    let aborted = false;
    let lastAbortCheck = Date.now();
    let result = await generator.next();
    while (!result.done) {
      if (Date.now() - lastAbortCheck > ABORT_POLL_MS) {
        lastAbortCheck = Date.now();
        if (await isRunAborted(runId)) {
          aborted = true;
          break;
        }
      }
      await buffer.push(result.value);
      result = await generator.next();
    }
    // Generator yields are strings (tokens), return value is `{ usage }`. On
    // the natural-completion path `result.done` is true and TS narrows
    // `result.value` to the return type; on the aborted path we broke mid-
    // stream and `result.value` is the last token (a string), so we can't
    // read usage from it.
    const usage =
      !aborted && result.done ? (result.value?.usage ?? null) : null;
    const finalContent = await buffer.finalize();

    const finalMessage = await completeMessage(messageId, finalContent, usage);
    await completeAiRun(messageId);
    await publishToWorkspace(workspaceId, "ai:run:completed", {
      runId,
      message: toMessageDTO(finalMessage),
    });
  } catch (err) {
    console.error(`[ai-orchestrator] run ${runId} failed:`, err);
    // Persist whatever streamed before the failure rather than dropping it.
    await failMessage(messageId, buffer.content).catch(() => {});
    await failAiRun(messageId, String(err)).catch(() => {});
    await publishToWorkspace(workspaceId, "ai:run:error", {
      runId,
      error: "The AI response failed. Please try again.",
    });
  } finally {
    await releaseLock({ key: args.lockKey, token: args.lockToken });
    // Drop any abort signal so a future re-use of this runId (shouldn't
    // happen, but TTL-only cleanup is fragile) doesn't see a stale flag.
    await clearRunAbort(runId).catch(() => {});
    // Roll the shared conversation memory forward — never blocks completion.
    void maybeRefreshSummary(conversationId);
  }
}
