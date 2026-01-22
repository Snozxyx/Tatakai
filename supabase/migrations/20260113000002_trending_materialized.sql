-- Materialized table to store computed trending scores for fast reads
CREATE TABLE IF NOT EXISTS public.anime_trending_scores (
  anime_id text PRIMARY KEY,
  trending_score numeric,
  last_computed timestamp with time zone DEFAULT now(),
  views_window integer,
  favorites_count integer,
  avg_watch_duration numeric,
  completion_rate numeric,
  sparkline jsonb
);

CREATE INDEX IF NOT EXISTS idx_anime_trending_scores_score ON public.anime_trending_scores(trending_score DESC);

-- Refresh function that computes scores using the get_trending_anime RPC and writes to the materialized table
CREATE OR REPLACE FUNCTION public.refresh_trending_scores(p_limit integer DEFAULT 100)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
BEGIN
  -- Use the improved RPC to compute top results for recent window
  FOR rec IN SELECT * FROM public.get_trending_anime(p_limit) LOOP
    INSERT INTO public.anime_trending_scores (anime_id, trending_score, last_computed, views_window, favorites_count, avg_watch_duration, completion_rate, sparkline)
    VALUES (rec.anime_id, rec.trending_score, now(), rec.views_week, rec.favorites_count, rec.avg_watch_duration, rec.completion_rate, rec.sparkline)
    ON CONFLICT (anime_id) DO UPDATE SET
      trending_score = EXCLUDED.trending_score,
      last_computed = EXCLUDED.last_computed,
      views_window = EXCLUDED.views_window,
      favorites_count = EXCLUDED.favorites_count,
      avg_watch_duration = EXCLUDED.avg_watch_duration,
      completion_rate = EXCLUDED.completion_rate,
      sparkline = EXCLUDED.sparkline;
  END LOOP;
END;
$$;

-- Convenience function: get precomputed trending scores
CREATE OR REPLACE FUNCTION public.get_trending_scores(p_limit integer DEFAULT 20)
RETURNS TABLE(anime_id text, trending_score numeric, sparkline jsonb)
LANGUAGE sql STABLE
AS $$
  SELECT anime_id, trending_score, sparkline FROM public.anime_trending_scores ORDER BY trending_score DESC LIMIT p_limit;
$$;

-- If you use pg_cron, schedule this to run hourly:
-- SELECT cron.schedule('refresh_trending_scores_hourly', '0 * * * *', $$SELECT public.refresh_trending_scores(200);$$);

-- Allow read access to precomputed scores
-- Some Postgres versions don't support `IF NOT EXISTS` on CREATE POLICY
DROP POLICY IF EXISTS "Anyone can read trending scores" ON public.anime_trending_scores;
CREATE POLICY "Anyone can read trending scores" ON public.anime_trending_scores FOR SELECT USING (true);
