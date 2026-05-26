import "server-only";
import type { MessageDTO } from "@workspace/shared";
import { redisKeys } from "@workspace/shared";
import { acquireLock, releaseLock } from "@/lib/redis/locks";
import { nextMessageSeq } from "@/lib/redis/sequence";
import { checkAiRateLimit } from "@/lib/redis/ratelimit";
import { clearRunAbort, isRunAborted } from "@/lib/redis/run-control";
import { publishToWorkspace } from "@/lib/realtime/publish";
import { toMessageDTO } from "@/lib/db/mappers";
import { Errors } from "@/lib/api/errors";
import {
  AI_STREAM_PERSIST_INTERVAL_MS,
  CONVERSATION_LOCK_TTL_SECONDS,
} from "@/config/constants";
import { embedMessage } from "@/features/memory/server/memory.service";
import { extractMemoryItems } from "@/features/memory/server/extractor.service";
import {
  completeAiRun,
  completeMessage,
  createAiRun,
  createMessage,
  failAiRun,
  failMessage,
  findMessageByClientId,
  updateStreamingContent,
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
 * Discriminated union of events emitted by the SSE streaming generator.
 * The route handler maps each to an `event: <type>` SSE frame; the browser
 * dispatches each one onto the workspace store the same way the socket
 * listeners used to.
 */
export type AiStreamEvent =
  | { type: "user_message"; message: MessageDTO }
  | { type: "ai_started"; runId: string; messageId: string }
  | { type: "ai_delta"; runId: string; token: string }
  | { type: "ai_completed"; runId: string; message: MessageDTO }
  | { type: "ai_error"; runId: string; error: string };

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
      // Team Memory: embed the user message in the background. Idempotent;
      // a reconnect retry that finds the existing message skips embedding.
      void embedMessage(userMessage.id).catch((err) =>
        console.error(`[memory] embed user msg ${userMessage!.id} failed:`, err),
      );
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

/**
 * SSE-based streaming entrypoint — the one the browser actually calls in
 * the new architecture. Unlike `runAiTurn` (which detaches the stream and
 * fans out via Redis to a separate socket server), this generator does
 * everything inline and yields events the route handler maps directly to
 * `text/event-stream` frames.
 *
 * The contract: exhaust this generator to drive the full AI turn. The
 * generator is responsible for its own cleanup (lock release, embedding,
 * extraction, summary refresh) via a finally block — the caller must not
 * forget to do those for it.
 *
 * `signal` should be the route's `req.signal`. When the client disconnects
 * mid-stream we stop pulling tokens, persist whatever we captured, and
 * skip the natural-completion path so a partial reply isn't marked
 * COMPLETE.
 */
export async function* runAiTurnStream(
  input: RunAiTurnInput,
  signal?: AbortSignal,
): AsyncGenerator<AiStreamEvent, void, void> {
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

  // We always need these for cleanup even on early failures.
  let assistantMessageId: string | null = null;
  let runId: string | null = null;
  let accumulated = "";
  let finalized = false; // true once the message row has reached its terminal state

  try {
    // (1) Persist user message idempotently. A reconnect that re-POSTs the
    // same clientMsgId returns the same row — never duplicates.
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
      // Fire-and-forget embed for memory. Catches its own errors.
      const newUserMsgId = userMessage.id;
      void embedMessage(newUserMsgId).catch((err) =>
        console.error(`[memory] embed user msg ${newUserMsgId} failed:`, err),
      );
    }

    yield { type: "user_message", message: toMessageDTO(userMessage) };

    // (2) Create assistant placeholder + AiRun.
    const assistantSeq = await nextMessageSeq(conversationId);
    const assistantMessage = await createMessage({
      conversationId,
      role: "ASSISTANT",
      authorId: null,
      content: "",
      status: "STREAMING",
      serverSeq: assistantSeq,
    });
    assistantMessageId = assistantMessage.id;
    const run = await createAiRun({
      conversationId,
      messageId: assistantMessage.id,
      model: aiProviderInfo().model,
    });
    runId = run.id;

    yield {
      type: "ai_started",
      runId: run.id,
      messageId: assistantMessage.id,
    };

    // (3) Stream tokens from the provider, persist checkpoints periodically,
    // and yield each delta as an SSE event. Aborts (client disconnect OR
    // explicit stop via Redis flag) just break the loop — the finally
    // block persists what we have.
    const context = await buildContext(conversationId, workspaceId);
    const generator = streamCompletion(context);

    const ABORT_POLL_MS = 250;
    let lastAbortCheck = Date.now();
    let lastPersistAt = Date.now();
    let persisting: Promise<unknown> | null = null;

    let result = await generator.next();
    while (!result.done) {
      // Stop conditions: client closed the SSE connection, or the legacy
      // /stop endpoint flipped the Redis abort flag.
      if (signal?.aborted) break;
      if (Date.now() - lastAbortCheck > ABORT_POLL_MS) {
        lastAbortCheck = Date.now();
        if (await isRunAborted(run.id)) break;
      }

      const token = result.value;
      accumulated += token;
      yield { type: "ai_delta", runId: run.id, token };

      // Fire-and-forget DB checkpoint — never await on the hot path. A
      // slow write must not gate the next token.
      if (!persisting && Date.now() - lastPersistAt >= AI_STREAM_PERSIST_INTERVAL_MS) {
        lastPersistAt = Date.now();
        const snapshot = accumulated;
        const msgId = assistantMessage.id;
        persisting = updateStreamingContent(msgId, snapshot)
          .catch((err) =>
            console.error(`[orchestrator] checkpoint failed for ${msgId}:`, err),
          )
          .finally(() => {
            persisting = null;
          });
      }

      result = await generator.next();
    }

    // Let any in-flight checkpoint settle before the final write, so the
    // completion overwrite definitely wins.
    if (persisting) await persisting;

    // We finalize on every non-error exit, including user-pressed-Stop and
    // Redis-flag aborts — the partial reply is still a valid result, and
    // emitting `ai_completed` is what tells the UI to stop showing
    // "generating". Only a client-disconnect (signal aborted) skips the
    // yield because there's nobody to receive it; the message is still
    // marked COMPLETE in the finally block.
    const naturalEnd = result.done;
    const usage = naturalEnd ? (result.value?.usage ?? null) : null;
    const finalMessage = await completeMessage(
      assistantMessage.id,
      accumulated,
      usage,
    );
    await completeAiRun(assistantMessage.id);
    finalized = true;
    if (!signal?.aborted) {
      yield {
        type: "ai_completed",
        runId: run.id,
        message: toMessageDTO(finalMessage),
      };
    }
  } catch (err) {
    console.error(`[ai-orchestrator] SSE run failed:`, err);
    if (assistantMessageId) {
      await failMessage(assistantMessageId, accumulated).catch(() => {});
      await failAiRun(assistantMessageId, String(err)).catch(() => {});
      finalized = true;
    }
    if (runId) {
      yield {
        type: "ai_error",
        runId,
        error: "The AI response failed. Please try again.",
      };
    }
    // Don't re-throw — the SSE channel is the user-facing surface; the
    // error event already informed them.
  } finally {
    await releaseLock(lock).catch(() => {});

    // Belt-and-braces: only finalize-as-complete in the finally if neither
    // the try-block (natural / stop) nor the catch-block (error) already
    // landed the row in a terminal state. Without this guard, a STREAMING
    // row left behind by an unexpected exception would persist forever.
    if (assistantMessageId && !finalized) {
      await completeMessage(assistantMessageId, accumulated, null).catch(() => {});
      await completeAiRun(assistantMessageId).catch(() => {});
    }

    if (runId) {
      await clearRunAbort(runId).catch(() => {});
    }
    if (assistantMessageId) {
      const msgId = assistantMessageId;
      void embedMessage(msgId).catch((err) =>
        console.error(`[memory] embed assistant msg ${msgId} failed:`, err),
      );
      void extractMemoryItems(msgId);
    }
    void maybeRefreshSummary(conversationId);
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
    // Team Memory: embed whatever the assistant produced (partial on abort
    // or error is fine — the buffer already persisted to the message row).
    void embedMessage(messageId).catch((err) =>
      console.error(`[memory] embed assistant msg ${messageId} failed:`, err),
    );
    // Extract structured memory items (decisions/questions/action items) from
    // the user→assistant exchange. Swallows its own errors.
    void extractMemoryItems(messageId);
    // Roll the shared conversation memory forward — never blocks completion.
    void maybeRefreshSummary(conversationId);
  }
}
