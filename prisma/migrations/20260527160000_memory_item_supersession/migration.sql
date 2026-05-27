-- AlterTable
ALTER TABLE "MemoryItem" ADD COLUMN "embedding" vector(768);
ALTER TABLE "MemoryItem" ADD COLUMN "supersededById" TEXT;
ALTER TABLE "MemoryItem" ADD COLUMN "supersededReason" TEXT;

-- CreateIndex
CREATE INDEX "MemoryItem_supersededById_idx" ON "MemoryItem"("supersededById");

-- AddForeignKey: a superseded item points UP at the newer item that replaced
-- it. On delete of the newer item we null this out rather than chain-
-- deleting the older one (we want the older fact to keep existing as a
-- standalone live item once its successor goes away).
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "MemoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- HNSW index for fast cosine-similarity search across the workspace's
-- existing items — the dedup retrieval step runs this on every fact the
-- extractor produces.
CREATE INDEX "MemoryItem_embedding_hnsw_idx" ON "MemoryItem" USING hnsw (embedding vector_cosine_ops);
