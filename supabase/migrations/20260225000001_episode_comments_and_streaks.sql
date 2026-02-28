-- ============================================================
-- Migration: Episode Comments + Watch Streaks feature support
-- Date: 2026-02-25
-- Features: EpisodeComments, WatchStreaks, WrappedPage, PiP
-- ============================================================

-- -----------------------------------------------------------
-- 1. Episode-level comments
--    The `comments` table already has `episode_id`, `is_spoiler`,
--    `is_pinned`. Just ensure the indexes are in place.
-- -----------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_comments_episode_id
  ON public.comments (episode_id)
  WHERE episode_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comments_anime_episode
  ON public.comments (anime_id, episode_id, created_at DESC);

-- Full-text search on comment content (used by episode comments filter)
CREATE INDEX IF NOT EXISTS idx_comments_content_search
  ON public.comments USING gin (to_tsvector('english', content));

-- -----------------------------------------------------------
-- 2. Watch Streaks & Stats (WrappedPage / WatchStreaks component)
--    Computed entirely from `watch_history`. Add composite indexes
--    that make streak queries (group by day) fast.
-- -----------------------------------------------------------

-- Index for fetching a user's history ordered by date (streak calc)
CREATE INDEX IF NOT EXISTS idx_watch_history_user_watched_at
  ON public.watch_history (user_id, watched_at DESC);

-- Index for stat aggregations: unique anime per user
CREATE INDEX IF NOT EXISTS idx_watch_history_user_anime
  ON public.watch_history (user_id, anime_id);

-- Index for completed episodes count
CREATE INDEX IF NOT EXISTS idx_watch_history_user_completed
  ON public.watch_history (user_id, completed)
  WHERE completed = true;

-- -----------------------------------------------------------
-- 3. Helper function: get_user_streak
--    Returns current streak days for a given user.
--    Used optionally for future server-side streak verification.
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_streak(p_user_id uuid)
RETURNS TABLE (
  current_streak  integer,
  longest_streak  integer,
  total_days      integer,
  last_watch_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_days        date[];
  v_current     integer := 0;
  v_longest     integer := 0;
  v_temp        integer := 1;
  v_check_day   date;
  v_today       date := CURRENT_DATE;
  v_yesterday   date := CURRENT_DATE - 1;
  i             integer;
BEGIN
  -- Get sorted unique watch days for the user
  SELECT ARRAY_AGG(DISTINCT DATE(watched_at) ORDER BY DATE(watched_at))
  INTO v_days
  FROM public.watch_history
  WHERE user_id = p_user_id;

  IF v_days IS NULL OR array_length(v_days, 1) = 0 THEN
    RETURN QUERY SELECT 0, 0, 0, NULL::date;
    RETURN;
  END IF;

  -- Longest streak calculation
  FOR i IN 2 .. array_length(v_days, 1) LOOP
    IF v_days[i] = v_days[i - 1] + 1 THEN
      v_temp := v_temp + 1;
      IF v_temp > v_longest THEN v_longest := v_temp; END IF;
    ELSE
      v_temp := 1;
    END IF;
  END LOOP;
  IF v_longest = 0 THEN v_longest := 1; END IF;

  -- Current streak from today or yesterday backwards
  v_check_day := CASE
    WHEN v_days[array_length(v_days, 1)] = v_today    THEN v_today
    WHEN v_days[array_length(v_days, 1)] = v_yesterday THEN v_yesterday
    ELSE NULL
  END;

  IF v_check_day IS NOT NULL THEN
    FOR i IN REVERSE array_length(v_days, 1) .. 1 LOOP
      IF v_days[i] = v_check_day THEN
        v_current := v_current + 1;
        v_check_day := v_check_day - 1;
      ELSIF v_days[i] < v_check_day THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY SELECT
    v_current,
    v_longest,
    array_length(v_days, 1),
    v_days[array_length(v_days, 1)];
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_streak(uuid) TO authenticated;

-- -----------------------------------------------------------
-- 4. Helper function: get_user_wrapped_stats
--    Returns aggregated yearly stats for WrappedPage.
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_wrapped_stats(
  p_user_id uuid,
  p_year    integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
    'total_episodes',    COUNT(*),
    'completed_episodes', COUNT(*) FILTER (WHERE completed = true),
    'total_hours',       ROUND(SUM(COALESCE(duration_seconds, 0)) / 3600.0, 1),
    'unique_anime',      COUNT(DISTINCT anime_id),
    'unique_days',       COUNT(DISTINCT DATE(watched_at)),
    'top_anime', (
      SELECT json_agg(t ORDER BY t.episode_count DESC)
      FROM (
        SELECT anime_id, MAX(anime_name) AS anime_name, MAX(anime_poster) AS anime_poster,
               COUNT(*) AS episode_count
        FROM public.watch_history
        WHERE user_id = p_user_id
          AND EXTRACT(YEAR FROM watched_at) = p_year
        GROUP BY anime_id
        ORDER BY episode_count DESC
        LIMIT 5
      ) t
    ),
    'monthly_activity', (
      SELECT json_agg(m ORDER BY m.month)
      FROM (
        SELECT EXTRACT(MONTH FROM watched_at)::integer AS month,
               COUNT(*) AS episodes
        FROM public.watch_history
        WHERE user_id = p_user_id
          AND EXTRACT(YEAR FROM watched_at) = p_year
        GROUP BY month
      ) m
    )
  )
  INTO v_result
  FROM public.watch_history
  WHERE user_id = p_user_id
    AND EXTRACT(YEAR FROM watched_at) = p_year;

  RETURN COALESCE(v_result, '{}'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_wrapped_stats(uuid, integer) TO authenticated;

-- -----------------------------------------------------------
-- 5. Ensure comment_likes has an index for user_liked lookups
-- -----------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_comment_likes_user_comment
  ON public.comment_likes (user_id, comment_id);
