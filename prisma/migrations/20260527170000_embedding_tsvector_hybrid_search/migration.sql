-- Hybrid retrieval — add a Postgres-maintained tsvector column for BM25-
-- style keyword ranking that complements the existing pgvector cosine
-- search. At query time we fuse the two via reciprocal rank fusion
-- (k=60) so semantic recall and proper-noun precision both contribute.
--
-- STORED generated column: Postgres recomputes `to_tsvector('english',
-- content)` only when `content` changes, which is never in our usage
-- (Embedding rows are immutable once written). Existing rows get
-- backfilled automatically by the ALTER. GIN index over the column is
-- what makes the @@ match operator + ts_rank_cd cheap.

ALTER TABLE "Embedding"
  ADD COLUMN "contentTsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX "Embedding_contentTsv_gin" ON "Embedding" USING GIN ("contentTsv");
