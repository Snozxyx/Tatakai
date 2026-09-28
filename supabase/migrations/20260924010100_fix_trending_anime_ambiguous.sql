-- ─────────────────────────────────────────────────────────────────────────────
-- Fix get_trending_anime 42702 "column reference \"anime_id\" is ambiguous"
--
-- The function's RETURNS TABLE(...) declares an OUT column named `anime_id`,
-- which becomes an in-scope plpgsql variable. Bare `anime_id` references inside
-- the `favs` CTE, the `USING (anime_id)` join, and the `spark` subquery were
-- therefore ambiguous between that OUT variable and the real table column,
-- raising 42702 at call time.
--
-- Fix: add `#variable_conflict use_column` (prefer the column on ambiguity) and
-- table-qualify every bare `anime_id`, replacing `USING (anime_id)` with an
-- explicit ON clause. Behaviour is otherwise identical to 20260113000001.
-- ─────────────────────────────────────────────────────────────────────────────

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
#variable_conflict use_column
DECLARE
  v_window_views integer;
  v_mean numeric;
  v_std numeric;
BEGIN
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
    SELECT w.anime_id, COUNT(*) as favorites_count
    FROM public.watchlist w
    WHERE w.status = 'plan_to_watch'
    GROUP BY w.anime_id
  ),
  metrics AS (
    SELECT
      b.anime_id,
      b.views_today,
      b.views_week,
      b.views_month,
      b.total_views,
      COALESCE(f.favorites_count, 0) as favorites_count,
      (SELECT COALESCE(AVG(v.watch_duration), 0) FROM public.anime_views v WHERE v.anime_id = b.anime_id AND v.viewed_at > now() - interval '30 days') as avg_watch_duration,
      (SELECT COALESCE(AVG(CASE WHEN v.completed THEN 1.0 ELSE 0 END), 0) FROM public.anime_views v WHERE v.anime_id = b.anime_id AND v.viewed_at > now() - interval '30 days') as completion_rate
    FROM base b
    LEFT JOIN favs f ON f.anime_id = b.anime_id
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
      jsonb_agg( jsonb_build_object('date', to_char(v.day, 'YYYY-MM-DD'), 'count', v.cnt) ORDER BY v.day ) as series
    FROM (
      SELECT av.anime_id, date_trunc('day', av.viewed_at) as day, COUNT(*) as cnt
      FROM public.anime_views av
      WHERE av.viewed_at > now() - interval '7 days'
      GROUP BY av.anime_id, date_trunc('day', av.viewed_at)
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
