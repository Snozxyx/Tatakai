-- RPC for active leaderboard
CREATE OR REPLACE FUNCTION get_leaderboard_active(p_limit integer DEFAULT 50)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  score bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH user_activity AS (
    -- Count watched episodes (completed)
    SELECT wh.user_id, COUNT(*)::bigint * 3 as points
    FROM public.watch_history wh
    WHERE wh.completed = true
    GROUP BY wh.user_id
    
    UNION ALL
    
    -- Count ratings
    SELECT r.user_id, COUNT(*)::bigint * 2 as points
    FROM public.ratings r
    GROUP BY r.user_id
    
    UNION ALL
    
    -- Count comments
    SELECT c.user_id, COUNT(*)::bigint * 1 as points
    FROM public.comments c
    GROUP BY c.user_id
  ),
  aggregated_scores AS (
    SELECT ua.user_id, SUM(ua.points) as total_score
    FROM user_activity ua
    GROUP BY ua.user_id
  )
  SELECT 
    p.user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    ascore.total_score
  FROM aggregated_scores ascore
  JOIN public.profiles p ON p.user_id = ascore.user_id
  ORDER BY ascore.total_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
