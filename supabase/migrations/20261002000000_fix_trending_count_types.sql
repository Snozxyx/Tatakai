-- ─────────────────────────────────────────────────────────────────────────────
-- Fix get_trending_anime 42804 "Returned type bigint does not match expected
-- type integer in column 7" (and the same latent mismatch in get_anime_metrics)
--
-- COUNT(*) always returns bigint. The `favs` aggregates flowed into declared-
-- integer OUT columns (`favorites_count`) via COALESCE, so EVERY call failed
-- with 42804 and /trending rendered empty. Fix: cast the counts to integer at
-- the source CTE. Signatures and RETURNS TABLE shapes are byte-identical, so
-- plain CREATE OR REPLACE is safe (no DROP/CASCADE needed).
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
    -- COUNT(*) is bigint; the OUT column is integer — cast at the source.
    SELECT w.anime_id, COUNT(*)::integer AS favorites_count
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

-- Same latent 42804 in get_anime_metrics: its favorites subquery's COUNT(*)
-- (bigint) flows into declared-integer `favorites_count` (column 6). Cast it
-- and name it explicitly instead of relying on the implicit `count` label.
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
  LEFT JOIN (SELECT anime_id, COUNT(*)::integer AS count FROM public.watchlist WHERE status = 'plan_to_watch' GROUP BY anime_id) f ON f.anime_id = a.anime_id
  WHERE a.anime_id = p_anime_id;
$$;
