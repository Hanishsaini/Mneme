-- CreateTable
CREATE TABLE "Embedding" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Embedding_messageId_key" ON "Embedding"("messageId");

-- CreateIndex
CREATE INDEX "Embedding_workspaceId_idx" ON "Embedding"("workspaceId");

-- CreateIndex
CREATE INDEX "Embedding_conversationId_idx" ON "Embedding"("conversationId");

-- AddForeignKey
ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- HNSW index for fast cosine similarity search on `embedding`. Prisma
-- doesn't know how to emit `USING hnsw (... vector_cosine_ops)` yet, so
-- this is appended manually. Required for Team Memory retrieval to scale
-- past a few thousand vectors per workspace.
CREATE INDEX "Embedding_embedding_hnsw_idx" ON "Embedding" USING hnsw (embedding vector_cosine_ops);
