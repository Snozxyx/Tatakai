-- =============================================================================
-- manga_readlist: track volume progress alongside chapter progress
--
-- The tracker sync exports/imports both chapter and volume counts to MAL
-- (num_chapters_read / num_volumes_read) and AniList (progress / progressVolumes),
-- but manga_readlist only stored `last_chapter_number`. This adds the volume
-- counterpart so volume progress round-trips instead of being dropped.
--
-- Numeric to match last_chapter_number (:9 in 20260410000001_add_manga_readlist).
-- IF NOT EXISTS keeps the migration idempotent / re-runnable, matching the rest
-- of this project's additive column migrations.
-- =============================================================================
ALTER TABLE public.manga_readlist
  ADD COLUMN IF NOT EXISTS last_volume_number numeric;
