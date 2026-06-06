-- Drop the shared-canvas and presence tables. These backed the real-time
-- collaboration features (live canvas/notes + presence/cursors) that were
-- retired when the product pivoted to the agent decision audit trail. The
-- app no longer references them; this migration removes the dead tables and
-- their enum types so the schema matches the running code.

-- Drop tables (FKs cascade-drop their own constraints).
DROP TABLE IF EXISTS "CanvasOperation";
DROP TABLE IF EXISTS "CanvasDocument";
DROP TABLE IF EXISTS "PresenceState";

-- Drop the now-unused enum types these tables owned.
DROP TYPE IF EXISTS "CanvasType";
DROP TYPE IF EXISTS "PresenceStatus";
