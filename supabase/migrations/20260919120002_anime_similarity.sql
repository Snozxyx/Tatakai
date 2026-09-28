-- Global collaborative model: an item-item similarity graph trained on the
-- aggregate behaviour of every user. It is recomputed by refresh_anime_similarity()
-- and gets denser/more accurate as more users add lists, ratings and feedback.
--
-- Cross-user data is only ever exposed through the SECURITY DEFINER functions
-- below (which return aggregates, never another user's raw rows), so RLS on the
-- source tables is preserved.

CREATE TABLE IF NOT EXISTS public.anime_similarity (
  anime_id text NOT NULL,
  similar_anime_id text NOT NULL,
  score numeric NOT NULL,
  source text NOT NULL DEFAULT 'cooccurrence',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anime_id, similar_anime_id)
);

CREATE INDEX IF NOT EXISTS idx_anime_similarity_anime
  ON public.anime_similarity (anime_id, score DESC);

ALTER TABLE public.anime_similarity ENABLE ROW LEVEL SECURITY;

-- The similarity graph is derived, non-sensitive aggregate data; readable by all.
DROP POLICY IF EXISTS "Anyone can read anime similarity" ON public.anime_similarity;
CREATE POLICY "Anyone can read anime similarity"
  ON public.anime_similarity FOR SELECT USING (true);

-- Recompute the whole similarity graph from scratch. Definer so it can read
-- across users' watchlists/ratings/feedback regardless of RLS. Keeps the top 40
-- neighbours per anime to bound table size.
CREATE OR REPLACE FUNCTION public.refresh_anime_similarity()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted integer;
BEGIN
  -- Positive seed set per user: strong watchlist statuses, high ratings, likes.
  CREATE TEMP TABLE _prefs ON COMMIT DROP AS
    SELECT user_id, anime_id, MAX(w)::numeric AS w
    FROM (
      SELECT user_id, anime_id,
             CASE WHEN status = 'completed' THEN 1.0
                  WHEN status = 'watching' THEN 0.9
                  WHEN status = 'on_hold' THEN 0.5
                  ELSE 0.4 END AS w
      FROM public.watchlist
      WHERE status IN ('completed', 'watching', 'on_hold', 'plan_to_watch')
      UNION ALL
      SELECT user_id, anime_id, 1.2 FROM public.ratings WHERE rating >= 7
      UNION ALL
      SELECT user_id, anime_id, 1.4 FROM public.recommendation_feedback WHERE feedback = 'like'
    ) s
    GROUP BY user_id, anime_id;

  -- Per-item popularity (weighted user count) for cosine normalization.
  CREATE TEMP TABLE _counts ON COMMIT DROP AS
    SELECT anime_id, SQRT(SUM(w)) AS norm
    FROM _prefs GROUP BY anime_id;

  -- Weighted, symmetric co-occurrence normalized cosine-style.
  CREATE TEMP TABLE _pairs ON COMMIT DROP AS
    SELECT a.anime_id AS aid, b.anime_id AS bid, SUM(a.w * b.w) AS raw, COUNT(*) AS support
    FROM _prefs a
    JOIN _prefs b ON a.user_id = b.user_id AND a.anime_id <> b.anime_id
    GROUP BY a.anime_id, b.anime_id
    HAVING COUNT(*) >= 2;

  DELETE FROM public.anime_similarity;

  WITH ranked AS (
    SELECT p.aid, p.bid,
           p.raw / NULLIF(ca.norm * cb.norm, 0) AS score,
           ROW_NUMBER() OVER (
             PARTITION BY p.aid
             ORDER BY p.raw / NULLIF(ca.norm * cb.norm, 0) DESC
           ) AS rn
    FROM _pairs p
    JOIN _counts ca ON ca.anime_id = p.aid
    JOIN _counts cb ON cb.anime_id = p.bid
  )
  INSERT INTO public.anime_similarity (anime_id, similar_anime_id, score, source, updated_at)
  SELECT aid, bid, score, 'cooccurrence', now()
  FROM ranked
  WHERE rn <= 40 AND score IS NOT NULL AND score > 0;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

-- Aggregate collaborative recommendation scores for one user by propagating the
-- user's own seed anime through the similarity graph. Definer so it can read the
-- shared graph, but it only returns anime ids + scores, never other users' rows.
CREATE OR REPLACE FUNCTION public.get_user_collaborative_scores(p_user_id uuid, p_limit integer DEFAULT 200)
RETURNS TABLE(anime_id text, score numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH seeds AS (
    SELECT anime_id,
           CASE WHEN status = 'completed' THEN 1.0
                WHEN status = 'watching' THEN 0.9
                ELSE 0.5 END AS w
    FROM public.watchlist
    WHERE user_id = p_user_id AND status IN ('completed', 'watching', 'on_hold')
    UNION ALL
    SELECT anime_id, 1.3 FROM public.ratings WHERE user_id = p_user_id AND rating >= 7
    UNION ALL
    SELECT anime_id, 1.5 FROM public.recommendation_feedback WHERE user_id = p_user_id AND feedback = 'like'
  ),
  seen AS (
    SELECT anime_id FROM public.watchlist WHERE user_id = p_user_id
    UNION
    SELECT anime_id FROM public.recommendation_feedback
    WHERE user_id = p_user_id AND feedback IN ('dislike', 'already_seen', 'skip')
  )
  SELECT sim.similar_anime_id AS anime_id, SUM(sim.score * seeds.w) AS score
  FROM seeds
  JOIN public.anime_similarity sim ON sim.anime_id = seeds.anime_id
  WHERE sim.similar_anime_id NOT IN (SELECT anime_id FROM seen)
  GROUP BY sim.similar_anime_id
  ORDER BY score DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_collaborative_scores(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_anime_similarity() TO service_role;
