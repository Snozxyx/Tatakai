-- =============================================================================
-- manga_readlist: allow the 'novel' reading format
--
-- Novels share the manga_readlist table (same progress shape: chapter key /
-- number / title / provider / paragraph-as-page index). This widens the format
-- check to include 'novel' and indexes it for the reading-track rank queries.
-- Idempotent: drops the old check only when it lacks 'novel'.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'manga_readlist_format_check'
  ) THEN
    ALTER TABLE public.manga_readlist DROP CONSTRAINT manga_readlist_format_check;
  END IF;
  ALTER TABLE public.manga_readlist
    ADD CONSTRAINT manga_readlist_format_check
    CHECK (format = ANY (ARRAY['manga'::text, 'manhwa'::text, 'comic'::text, 'novel'::text, 'unknown'::text]));
END
$$;

DROP INDEX IF EXISTS public.idx_manga_readlist_user_format;
CREATE INDEX IF NOT EXISTS idx_manga_readlist_user_format
  ON public.manga_readlist USING btree (user_id, format)
  WHERE format <> 'unknown';
