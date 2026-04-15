CREATE TABLE IF NOT EXISTS public.manga_readlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    manga_id text NOT NULL,
    manga_title text NOT NULL,
    manga_poster text,
    status text DEFAULT 'plan_to_read'::text NOT NULL,
    last_chapter_key text,
    last_chapter_number numeric,
    last_chapter_title text,
    last_provider text,
    last_language text,
    last_page_index integer DEFAULT 0 NOT NULL,
    total_pages integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT manga_readlist_pkey PRIMARY KEY (id),
    CONSTRAINT manga_readlist_user_id_manga_id_key UNIQUE (user_id, manga_id),
    CONSTRAINT manga_readlist_status_check CHECK (
      status = ANY (
        ARRAY['plan_to_read'::text, 'reading'::text, 'completed'::text, 'on_hold'::text, 'dropped'::text]
      )
    ),
    CONSTRAINT manga_readlist_last_page_index_check CHECK (last_page_index >= 0)
);

CREATE INDEX IF NOT EXISTS idx_manga_readlist_user_id ON public.manga_readlist USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_manga_readlist_updated_at ON public.manga_readlist USING btree (updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'manga_readlist_user_id_fkey'
  ) THEN
    ALTER TABLE public.manga_readlist
      ADD CONSTRAINT manga_readlist_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS update_manga_readlist_updated_at ON public.manga_readlist;
CREATE TRIGGER update_manga_readlist_updated_at
BEFORE UPDATE ON public.manga_readlist
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.manga_readlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own manga readlist" ON public.manga_readlist;
CREATE POLICY "Users can view own manga readlist"
ON public.manga_readlist FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own manga readlist" ON public.manga_readlist;
CREATE POLICY "Users can insert own manga readlist"
ON public.manga_readlist FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own manga readlist" ON public.manga_readlist;
CREATE POLICY "Users can update own manga readlist"
ON public.manga_readlist FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own manga readlist" ON public.manga_readlist;
CREATE POLICY "Users can delete own manga readlist"
ON public.manga_readlist FOR DELETE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow viewing public manga readlist" ON public.manga_readlist;
CREATE POLICY "Allow viewing public manga readlist"
ON public.manga_readlist FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.user_id = manga_readlist.user_id
      AND profiles.is_public = true
      AND COALESCE(profiles.show_watchlist, true) = true
  )
);
