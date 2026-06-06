/** Redis key helpers. Shared so every reader/writer agrees on the strings. */

/** Redis keys for ephemeral coordination state. */
export const redisKeys = {
  conversationLock: (conversationId: string) =>
    `lock:conversation:${conversationId}`,
  messageSeq: (conversationId: string) => `seq:conversation:${conversationId}`,
  rateLimit: (userId: string) => `ratelimit:ai:${userId}`,
};
