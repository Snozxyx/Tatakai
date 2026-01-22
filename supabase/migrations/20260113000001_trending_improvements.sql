-- Improve trending algorithm and add metrics
-- Adds favorites_count, avg_watch_duration, completion_rate, sparkline and trending_score

CREATE OR REPLACE FUNCTION public.get_trending_anime(
    p_limit integer DEFAULT 20,
    p_window text DEFAULT 'week', -- 'today' | 'week' | 'month' | 'all'
    p_weight_views numeric DEFAULT 1.0,
    p_weight_completion numeric DEFAULT 0.5,
    p_weight_favorites numeric DEFAULT 0.7
)
RETURNS TABLE(
  anime_id text,
  views_window integer,
  views_today integer,
  views_week integer,
  views_month integer,
  total_views integer,
  favorites_count integer,
  avg_watch_duration numeric,
  completion_rate numeric,
  trending_score numeric,
  sparkline jsonb
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_window_views integer;
  v_mean numeric;
  v_std numeric;
BEGIN
  -- Compute basic aggregates and per-anime metrics
  RETURN QUERY
  WITH base AS (
    SELECT
      a.anime_id,
      a.views_today,
      a.views_week,
      a.views_month,
      a.total_views
    FROM public.anime_view_counts a
  ),
  favs AS (
    SELECT anime_id, COUNT(*) as favorites_count FROM public.watchlist WHERE status = 'plan_to_watch' GROUP BY anime_id
  ),
  metrics AS (
    SELECT
      b.anime_id,
      b.views_today,
      b.views_week,
      b.views_month,
      b.total_views,
      COALESCE(f.favorites_count, 0) as favorites_count,
      (SELECT COALESCE(AVG(watch_duration), 0) FROM public.anime_views v WHERE v.anime_id = b.anime_id AND v.viewed_at > now() - interval '30 days') as avg_watch_duration,
      (SELECT COALESCE(AVG(CASE WHEN completed THEN 1.0 ELSE 0 END), 0) FROM public.anime_views v WHERE v.anime_id = b.anime_id AND v.viewed_at > now() - interval '30 days') as completion_rate
    FROM base b
    LEFT JOIN favs f USING (anime_id)
  ),
  with_window AS (
    SELECT
      m.*,
      CASE
        WHEN lower(p_window) = 'today' THEN m.views_today
        WHEN lower(p_window) = 'month' THEN m.views_month
        WHEN lower(p_window) = 'all' THEN m.total_views
        ELSE m.views_week
      END as views_window
    FROM metrics m
  ),
  norm AS (
    SELECT
      AVG(views_window) as mean_v,
      STDDEV_POP(views_window) as std_v
    FROM with_window
  ),
  spark AS (
    SELECT
      v.anime_id,
      jsonb_agg( jsonb_build_object('date', to_char(day, 'YYYY-MM-DD'), 'count', cnt) ORDER BY day ) as series
    FROM (
      SELECT anime_id, date_trunc('day', viewed_at) as day, COUNT(*) as cnt
      FROM public.anime_views
      WHERE viewed_at > now() - interval '7 days'
      GROUP BY anime_id, date_trunc('day', viewed_at)
    ) v
    GROUP BY v.anime_id
  )
  SELECT
    w.anime_id,
    w.views_window,
    w.views_today,
    w.views_week,
    w.views_month,
    w.total_views,
    w.favorites_count,
    round(w.avg_watch_duration::numeric, 2) as avg_watch_duration,
    round(w.completion_rate::numeric, 3) as completion_rate,
    -- trending score: normalized views + weighted completion + weighted log(favorites)
    (CASE WHEN n.std_v IS NULL OR n.std_v = 0 THEN (w.views_window) ELSE ((w.views_window - n.mean_v) / NULLIF(n.std_v,0)) END) * p_weight_views
      + (w.completion_rate * p_weight_completion)
      + (LN(1 + GREATEST(w.favorites_count,0)) * p_weight_favorites) AS trending_score,
    COALESCE(s.series, '[]'::jsonb) as sparkline
  FROM with_window w
  CROSS JOIN norm n
  LEFT JOIN spark s ON s.anime_id = w.anime_id
  ORDER BY trending_score DESC NULLS LAST
  LIMIT p_limit;

END;
$$;

-- Add a metrics function to return aggregated stats for a single anime
CREATE OR REPLACE FUNCTION public.get_anime_metrics(p_anime_id text)
RETURNS TABLE(
  anime_id text,
  total_views integer,
  views_today integer,
  views_week integer,
  views_month integer,
  favorites_count integer,
  avg_watch_duration numeric,
  completion_rate numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    a.anime_id,
    a.total_views,
    a.views_today,
    a.views_week,
    a.views_month,
    COALESCE(f.count, 0) as favorites_count,
    COALESCE((SELECT AVG(watch_duration) FROM public.anime_views v WHERE v.anime_id = a.anime_id AND v.viewed_at > now() - interval '30 days'), 0) as avg_watch_duration,
    COALESCE((SELECT AVG(CASE WHEN completed THEN 1.0 ELSE 0 END) FROM public.anime_views v WHERE v.anime_id = a.anime_id AND v.viewed_at > now() - interval '30 days'), 0) as completion_rate
  FROM public.anime_view_counts a
  LEFT JOIN (SELECT anime_id, COUNT(*) FROM public.watchlist WHERE status = 'plan_to_watch' GROUP BY anime_id) f ON f.anime_id = a.anime_id
  WHERE a.anime_id = p_anime_id;
$$;

-- Expose recommendations by simple co-occurrence on watchlist
CREATE OR REPLACE FUNCTION public.get_recommendations_for_user(p_user_id uuid, p_limit integer DEFAULT 10)
RETURNS TABLE(anime_id text, score numeric)
LANGUAGE sql STABLE
AS $$
  WITH user_favs AS (
    SELECT anime_id FROM public.watchlist WHERE user_id = p_user_id
  ),
  co AS (
    SELECT w.anime_id, COUNT(*) as cnt
    FROM public.watchlist w
    JOIN user_favs uf ON uf.anime_id <> w.anime_id
    WHERE w.user_id NOT IN (p_user_id)
    GROUP BY w.anime_id
  )
  SELECT anime_id, cnt::numeric as score FROM co ORDER BY score DESC LIMIT p_limit;
$$;

-- Add read policy for watchlist counts (public ok)
-- Note: some Postgres versions do not support `IF NOT EXISTS` for CREATE POLICY, so create it without that clause.
DROP POLICY IF EXISTS "Anyone can read watchlist" ON public.watchlist;
CREATE POLICY "Anyone can read watchlist" ON public.watchlist FOR SELECT USING (true);
