-- =============================================================================
-- tracked_shows — user-pinned shows for the Tatakai Calendar (docs/Plans.md §6)
--
-- A show a user pins from the anime info page so it appears on /calendar with a
-- countdown to its next episode. Distinct from `watchlist` (a status list: plan
-- to watch / watching / …) — tracking is specifically "surface this on my
-- calendar and remind me when it airs". Airing times themselves are fetched live
-- (AniList `nextAiringEpisode` / ani.zip / Jikan broadcast), never stored here.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tracked_shows (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anime_id   TEXT        NOT NULL,
  anilist_id INTEGER,
  title      TEXT,
  image_url  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, anime_id)
);

CREATE INDEX IF NOT EXISTS idx_tracked_shows_user_created
  ON public.tracked_shows (user_id, created_at DESC);

ALTER TABLE public.tracked_shows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own tracked shows" ON public.tracked_shows;
CREATE POLICY "Users read own tracked shows"
  ON public.tracked_shows FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own tracked shows" ON public.tracked_shows;
CREATE POLICY "Users insert own tracked shows"
  ON public.tracked_shows FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own tracked shows" ON public.tracked_shows;
CREATE POLICY "Users delete own tracked shows"
  ON public.tracked_shows FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.tracked_shows TO authenticated;
GRANT ALL ON public.tracked_shows TO service_role;
