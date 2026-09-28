-- Add tracked_shows.anilist_id for calendars deployed before the column existed.
--
-- The base table (20260919120005) was already applied without this column on the
-- live database, so inserts carrying `anilist_id` fail with
-- "Could not find the 'anilist_id' column ... in the schema cache". This adds it
-- idempotently and asks PostgREST to reload its schema cache so the column is
-- queryable without waiting for the periodic refresh / a restart.

ALTER TABLE public.tracked_shows
  ADD COLUMN IF NOT EXISTS anilist_id INTEGER;

NOTIFY pgrst, 'reload schema';
