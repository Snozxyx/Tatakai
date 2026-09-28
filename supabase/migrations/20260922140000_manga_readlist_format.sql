-- =============================================================================
-- manga_readlist: classify each entry by content format
--
-- Ranks are split into reading tracks (manga / manhwa / comic) alongside anime.
-- manga_readlist previously had no way to tell those apart — only chapter/volume
-- counts, which must NEVER be used to infer the medium (manga and anime ids
-- collide across types; see project memory `tatakai-manga-mapping-cross-type-id-
-- collisions`). This adds an explicit `format` column so the reading tracks are
-- driven by a stored classification, not a guess from counts.
--
-- Values: 'manga' | 'manhwa' | 'comic' | 'unknown'. Default 'unknown' — the app
-- (or the external-metadata sync that populates mal_id/anilist_id, see
-- 20260413001000) sets the real format when it's known. No count-based backfill
-- is attempted here on purpose.
--
-- IF NOT EXISTS keeps the migration idempotent, matching this project's other
-- additive column migrations.
-- =============================================================================
ALTER TABLE public.manga_readlist
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'unknown';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'manga_readlist_format_check'
  ) THEN
    ALTER TABLE public.manga_readlist
      ADD CONSTRAINT manga_readlist_format_check
      CHECK (format = ANY (ARRAY['manga'::text, 'manhwa'::text, 'comic'::text, 'unknown'::text]));
  END IF;
END
$$;

-- Reading-track rank queries group by (user_id, format) and sum chapter counts,
-- so index the pair. Partial index skips the 'unknown' bucket which isn't ranked.
CREATE INDEX IF NOT EXISTS idx_manga_readlist_user_format
  ON public.manga_readlist USING btree (user_id, format)
  WHERE format <> 'unknown';
