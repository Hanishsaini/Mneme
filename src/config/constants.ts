/** Tunable application constants. Pure values — safe in any bundle. */

export const APP_NAME = "Mneme";
/** Tagline shown on auth screens + future landing. The narrative wedge:
 *  this is a memory product, not a chat tool. */
export const APP_TAGLINE = "The memory layer for your team.";

/**
 * Token-optimization budget. Free-tier models have small context windows and
 * rate caps, so context assembly is deliberately lean:
 *  - only the last N messages go to the model verbatim
 *  - each one is truncated to a char cap (prevents one giant paste blowing
 *    the budget)
 *  - the canvas digest is capped to a handful of blocks
 *  - completions are hard-capped so a runaway response can't burn the quota
 * Everything older than the window is represented by the rolling summary.
 */
export const AI_CONTEXT_MESSAGE_WINDOW = 10;
export const AI_MAX_MESSAGE_CHARS = 1200;
export const AI_CANVAS_DIGEST_BLOCKS = 10;
export const AI_CANVAS_DIGEST_CHARS = 600;
export const AI_MAX_OUTPUT_TOKENS = 1024;
export const AI_SUMMARY_MAX_OUTPUT_TOKENS = 512;

/** Regenerate the rolling conversation summary every N messages. */
export const AI_SUMMARY_INTERVAL = 16;

/** Per-user AI requests allowed inside the rate-limit window. */
export const AI_RATE_LIMIT_MAX = 20;
export const AI_RATE_LIMIT_WINDOW_SECONDS = 60;

/** A conversation lock auto-expires after this many seconds (deadlock guard). */
export const CONVERSATION_LOCK_TTL_SECONDS = 120;

/**
 * Token buffering. Raw model deltas are coalesced before fan-out: a publish
 * fires when the pending segment reaches the char threshold OR the interval
 * elapses, whichever comes first. Small enough to still feel token-by-token,
 * large enough to cut Redis publishes + socket emits on fast streams.
 */
export const AI_STREAM_PUBLISH_INTERVAL_MS = 60;
export const AI_STREAM_PUBLISH_CHAR_THRESHOLD = 24;

/**
 * Incremental persistence. The streaming buffer flushes its full accumulated
 * content to Postgres at most this often, so an interrupted run (crash,
 * function timeout) leaves a partial-but-saved message instead of nothing.
 */
export const AI_STREAM_PERSIST_INTERVAL_MS = 1500;

/** Presence entry TTL — refreshed by client heartbeats. */
export const PRESENCE_TTL_SECONDS = 30;
export const PRESENCE_HEARTBEAT_MS = 12_000;

/** Client throttles cursor broadcasts to this interval. */
export const CURSOR_THROTTLE_MS = 50;

/** Realtime auth token lifetime. */
export const REALTIME_TOKEN_TTL_SECONDS = 300;

/** How long a freshly-minted invite link stays valid. 7 days is the standard
 *  Slack/Notion default — long enough for someone to act on a DM'd link,
 *  short enough that a leaked link doesn't grant access indefinitely. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const CURSOR_COLORS = [
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
];
