ALTER TABLE public.manga_readlist
  ADD COLUMN IF NOT EXISTS mal_id integer,
  ADD COLUMN IF NOT EXISTS anilist_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'manga_readlist_mal_id_check'
  ) THEN
    ALTER TABLE public.manga_readlist
      ADD CONSTRAINT manga_readlist_mal_id_check
      CHECK (mal_id IS NULL OR mal_id > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'manga_readlist_anilist_id_check'
  ) THEN
    ALTER TABLE public.manga_readlist
      ADD CONSTRAINT manga_readlist_anilist_id_check
      CHECK (anilist_id IS NULL OR anilist_id > 0);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_manga_readlist_user_mal_id
  ON public.manga_readlist USING btree (user_id, mal_id)
  WHERE mal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_manga_readlist_user_anilist_id
  ON public.manga_readlist USING btree (user_id, anilist_id)
  WHERE anilist_id IS NOT NULL;
