ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS preferred_manga_language text DEFAULT 'auto';

UPDATE public.profiles
SET preferred_manga_language = 'auto'
WHERE preferred_manga_language IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_preferred_manga_language_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_preferred_manga_language_check
    CHECK (
      preferred_manga_language = ANY (ARRAY['auto'::text, 'jp'::text, 'en'::text, 'kr'::text, 'zh'::text])
    );
  END IF;
END $$;