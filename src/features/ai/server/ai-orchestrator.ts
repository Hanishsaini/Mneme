import "server-only";
import type { MessageDTO } from "@workspace/shared";
import { redisKeys } from "@workspace/shared";
import { acquireLock, releaseLock } from "@/lib/redis/locks";
import { nextMessageSeq } from "@/lib/redis/sequence";
import { checkAiRateLimit } from "@/lib/redis/ratelimit";
import { clearRunAbort, isRunAborted } from "@/lib/redis/run-control";
import { toMessageDTO } from "@/lib/db/mappers";
import { Errors } from "@/lib/api/errors";
import {
  AI_STREAM_PERSIST_INTERVAL_MS,
  CONVERSATION_LOCK_TTL_SECONDS,
} from "@/config/constants";
import { embedMessage } from "@/features/memory/server/memory.service";
import { extractMemoryItems } from "@/features/memory/server/extractor.service";
import { maybeGenerateTitle } from "@/features/conversation/server/title.service";
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
  | { type: "ai_error"; runId: string; error: string }
  /** First-turn auto-title — fires once per conversation, just after the
   *  first ai_completed. Clients update the sidebar in place. */
  | { type: "conversation_titled"; conversationId: string; title: string };

/**
 * SSE-based streaming entrypoint — the one the browser actually calls.
 * This generator does everything inline and yields events the route handler
 * maps directly to `text/event-stream` frames.
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
  const { conversationId, userId, clientMsgId, text } = input;

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
    const context = await buildContext(conversationId);
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

      // Auto-title the conversation from the first exchange. Inline
      // because we want the title on screen within a second or two of
      // the completion event, but wrapped so a slow/failed generation
      // can never poison the stream — we just skip the event.
      try {
        const newTitle = await maybeGenerateTitle(conversationId);
        if (newTitle) {
          yield {
            type: "conversation_titled",
            conversationId,
            title: newTitle,
          };
        }
      } catch (err) {
        console.error(`[title] post-completion title gen failed:`, err);
      }
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
