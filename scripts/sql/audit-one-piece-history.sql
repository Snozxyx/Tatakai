-- Read-only audit. Replace the two EXECUTE arguments with the affected auth
-- user UUID and the exact anime_id stored by the import (not its display name).
-- Run through an authorized SQL connection; no account rows are modified.
PREPARE audit_one_piece_history(uuid, text) AS
WITH episodes AS (
  SELECT episode_id, episode_number, completed
  FROM public.watch_history
  WHERE user_id = $1 AND anime_id = $2
)
SELECT
  (SELECT count(*) FROM episodes) AS total_rows,
  (SELECT count(DISTINCT episode_id) FROM episodes) AS distinct_episode_ids,
  (SELECT count(DISTINCT episode_number) FROM episodes) AS distinct_episode_numbers,
  (SELECT count(*) FROM episodes WHERE completed) AS completed_rows,
  ARRAY(
    SELECT n FROM generate_series(1, 1181) AS expected(n)
    WHERE NOT EXISTS (SELECT 1 FROM episodes WHERE episode_number = n)
    ORDER BY n
  ) AS missing_episode_numbers;

-- EXECUTE audit_one_piece_history('00000000-0000-0000-0000-000000000000', 'exact-anime-id');
-- DEALLOCATE audit_one_piece_history;
