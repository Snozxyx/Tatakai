-- Persisted taste profile per user (genre/tag/studio/era weights, rating range,
-- diversity). Stored so the web app can render the same profile the desktop app
-- computed, and so we have a snapshot to reason about over time.
CREATE TABLE IF NOT EXISTS public.user_taste_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_size integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_taste_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own taste profile" ON public.user_taste_profiles;
CREATE POLICY "Users can view own taste profile"
  ON public.user_taste_profiles FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own taste profile" ON public.user_taste_profiles;
CREATE POLICY "Users can insert own taste profile"
  ON public.user_taste_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own taste profile" ON public.user_taste_profiles;
CREATE POLICY "Users can update own taste profile"
  ON public.user_taste_profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
