-- Persisted per-user recommendations so the same results appear on every device
-- (desktop app + web). The client computes recommendations and upserts them here;
-- any surface can then read them back without recomputing.
CREATE TABLE IF NOT EXISTS public.user_recommendations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- anime and manga ids can collide (see project notes), so media_type is part
  -- of the key to keep the two catalogs' recommendations separate.
  media_type text NOT NULL DEFAULT 'anime',
  anime_id text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'hybrid',
  model_version text NOT NULL DEFAULT 'v1',
  generated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, media_type, anime_id)
);

CREATE INDEX IF NOT EXISTS idx_user_recommendations_user
  ON public.user_recommendations (user_id, media_type, score DESC);

ALTER TABLE public.user_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own recommendations" ON public.user_recommendations;
CREATE POLICY "Users can view own recommendations"
  ON public.user_recommendations FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own recommendations" ON public.user_recommendations;
CREATE POLICY "Users can insert own recommendations"
  ON public.user_recommendations FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own recommendations" ON public.user_recommendations;
CREATE POLICY "Users can update own recommendations"
  ON public.user_recommendations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own recommendations" ON public.user_recommendations;
CREATE POLICY "Users can delete own recommendations"
  ON public.user_recommendations FOR DELETE USING (auth.uid() = user_id);
