-- ============================================================
-- Migration: Soft-delete tombstones for comments / forum content
-- Date: 2026-09-23
-- Purpose:
--   Give public.comments (anime/episode comments), public.forum_comments, and
--   public.forum_posts a soft-delete pair (is_deleted / deleted_at) so the UI
--   can keep thread structure intact and render a "[DELETED By User]" tombstone
--   instead of ripping a row (and its replies / quotes) out of the tree.
--
--   Design:
--     * A delete is a plain owner UPDATE (is_deleted = true, deleted_at = now()),
--       so it rides the EXISTING "Users can update own comments/posts" UPDATE
--       policies (see 20251231031018 / 20260110000001). No new policy needed.
--     * SELECT policies are intentionally NOT changed: deleted rows still come
--       back so the client can draw the tombstone. Filtering deleted content is
--       a client concern.
--
--   Additive + idempotent, matching the feed migrations (…150000 / …180000 /
--   093000): ADD COLUMN IF NOT EXISTS, and defensive column-level GRANTs.
--
--   Grant note: unlike public.profiles (which has column-level UPDATE grants,
--   see 20260902000003 — a new column there is NOT writable without an explicit
--   grant), these three tables rely on blanket table privileges, so a new column
--   is already covered. The column-level GRANTs below are belt-and-suspenders:
--   harmless where a table grant already covers them, and correct if any of
--   these tables is ever narrowed to column-level grants.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.forum_comments
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.forum_posts
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.comments.is_deleted IS
  'Soft-delete flag. Row is kept so replies/threads survive; UI renders a "[DELETED By User]" tombstone.';
COMMENT ON COLUMN public.forum_comments.is_deleted IS
  'Soft-delete flag. Row is kept so replies/threads survive; UI renders a "[DELETED By User]" tombstone.';
COMMENT ON COLUMN public.forum_posts.is_deleted IS
  'Soft-delete flag. Row is kept so quotes/reposts survive; UI renders a "[DELETED By User]" tombstone.';

-- ---------------------------------------------------------------------------
-- 2. Defensive grants for the new columns (see grant note above)
-- ---------------------------------------------------------------------------
GRANT SELECT (is_deleted, deleted_at) ON public.comments        TO anon, authenticated;
GRANT SELECT (is_deleted, deleted_at) ON public.forum_comments  TO anon, authenticated;
GRANT SELECT (is_deleted, deleted_at) ON public.forum_posts     TO anon, authenticated;

GRANT UPDATE (is_deleted, deleted_at) ON public.comments        TO authenticated;
GRANT UPDATE (is_deleted, deleted_at) ON public.forum_comments  TO authenticated;
GRANT UPDATE (is_deleted, deleted_at) ON public.forum_posts     TO authenticated;
