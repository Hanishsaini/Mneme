-- Enable the Postgres extensions the schema depends on, BEFORE any migration
-- that references their types.
--
-- pgvector was originally enabled by hand on the hosted database, so it was
-- never part of migration history. That worked on the real database but
-- broke `prisma migrate dev`: the shadow database is created fresh and
-- replays every migration in filename order, and the first vector migration
-- (20260525083958_team_memory_embeddings) failed with `type "vector" does
-- not exist`. This migration is named to sort just before it, so the
-- extension exists by the time any `vector(768)` column is created.
--
-- `IF NOT EXISTS` keeps it idempotent — applying it to the existing hosted
-- database (where the extensions are already present) is a no-op.

CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
