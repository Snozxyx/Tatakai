-- Per-chapter manga comments.
--
-- The unified comments table (20260923120000_unify_comments.sql) added
-- `episode_id` as an anime-only sub-thread scope, enforced by
-- `comments_episode_scope_check CHECK (episode_id IS NULL OR entity_type = 'anime')`.
-- Manga needs the same sub-thread mechanism so each chapter has its own comment
-- thread alongside the per-manga global thread, exactly like anime episodes.
--
-- For manga, `episode_id` holds the CANONICAL CHAPTER NUMBER (as text) — not a
-- provider-specific chapterKey. Chapter numbers are provider-independent, so the
-- same "Chapter 1" thread is shown regardless of which source (MangaDex, Atsu,
-- WeebCentral, …) the reader loaded pages from. Using chapterKey would fragment
-- one logical chapter's discussion across every provider.
--
-- Relax the CHECK to allow episode_id for manga too. The composite index
-- (entity_type, entity_id, episode_id) from the unify migration already covers
-- the per-chapter lookup, so no new index is required.

ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_episode_scope_check;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_episode_scope_check
  CHECK (episode_id IS NULL OR entity_type IN ('anime','manga'));
