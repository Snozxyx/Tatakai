-- Favorite anime characters, so users can pin characters to their profile.
-- Mirrors the manga_readlist migration: same RLS shape (own CRUD + public read
-- gated on profiles.is_public) and updated_at trigger. Keyed on user_id
-- (= auth.uid()), never profiles.id.

CREATE TABLE IF NOT EXISTS public.character_favorites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    character_id text NOT NULL,
    character_name text NOT NULL,
    character_image text,
    character_native_name text,
    source text DEFAULT 'anilist'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT character_favorites_pkey PRIMARY KEY (id),
    CONSTRAINT character_favorites_user_id_character_id_key UNIQUE (user_id, character_id)
);

CREATE INDEX IF NOT EXISTS idx_character_favorites_user_id ON public.character_favorites USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_character_favorites_created_at ON public.character_favorites USING btree (created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'character_favorites_user_id_fkey'
  ) THEN
    ALTER TABLE public.character_favorites
      ADD CONSTRAINT character_favorites_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS update_character_favorites_updated_at ON public.character_favorites;
CREATE TRIGGER update_character_favorites_updated_at
BEFORE UPDATE ON public.character_favorites
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.character_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own character favorites" ON public.character_favorites;
CREATE POLICY "Users can view own character favorites"
ON public.character_favorites FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own character favorites" ON public.character_favorites;
CREATE POLICY "Users can insert own character favorites"
ON public.character_favorites FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own character favorites" ON public.character_favorites;
CREATE POLICY "Users can update own character favorites"
ON public.character_favorites FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own character favorites" ON public.character_favorites;
CREATE POLICY "Users can delete own character favorites"
ON public.character_favorites FOR DELETE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow viewing public character favorites" ON public.character_favorites;
CREATE POLICY "Allow viewing public character favorites"
ON public.character_favorites FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.user_id = character_favorites.user_id
      AND profiles.is_public = true
  )
);
