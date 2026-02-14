-- Fix leaderboard queries for most active, most comments, most watched

-- Most Active Users (by total activity)
CREATE OR REPLACE VIEW leaderboard_most_active AS
SELECT 
  p.id,
  p.username,
  p.avatar_url,
  COALESCE(comment_count, 0) as activity_score,
  COALESCE(comment_count, 0) as total_comments
FROM profiles p
LEFT JOIN (
  SELECT user_id, COUNT(*) as comment_count
  FROM comments
  GROUP BY user_id
) c ON c.user_id = p.id
WHERE p.banned_at IS NULL
ORDER BY activity_score DESC
LIMIT 100;

-- Most Comments (top commenters)
CREATE OR REPLACE VIEW leaderboard_most_comments AS
SELECT 
  p.id,
  p.username,
  p.avatar_url,
  COUNT(c.id) as total_comments,
  COUNT(DISTINCT c.anime_id) as unique_anime_commented,
  MAX(c.created_at) as last_comment_at
FROM profiles p
INNER JOIN comments c ON c.user_id = p.id
WHERE p.banned_at IS NULL
GROUP BY p.id, p.username, p.avatar_url
HAVING COUNT(c.id) > 0
ORDER BY total_comments DESC
LIMIT 100;

-- Most Watched (by watch history)
CREATE OR REPLACE VIEW leaderboard_most_watched AS
SELECT 
  p.id,
  p.username,
  p.avatar_url,
  COUNT(DISTINCT wh.anime_id) as unique_anime_watched,
  COUNT(wh.id) as total_episodes_watched,
  SUM(CASE WHEN wh.completed THEN 1 ELSE 0 END) as completed_anime,
  MAX(wh.last_watched_at) as last_watch_at
FROM profiles p
INNER JOIN watch_history wh ON wh.user_id = p.id
WHERE p.banned_at IS NULL
GROUP BY p.id, p.username, p.avatar_url
HAVING COUNT(DISTINCT wh.anime_id) > 0
ORDER BY unique_anime_watched DESC, total_episodes_watched DESC
LIMIT 100;

-- Grant access to views
GRANT SELECT ON leaderboard_most_active TO authenticated, anon;
GRANT SELECT ON leaderboard_most_comments TO authenticated, anon;
GRANT SELECT ON leaderboard_most_watched TO authenticated, anon;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_comments_user_id_active ON comments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_watch_history_user_anime ON watch_history(user_id, anime_id, last_watched_at DESC);
