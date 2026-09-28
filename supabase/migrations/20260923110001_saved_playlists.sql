-- =============================================================================
-- saved_playlists — users "follow"/save a playlist into their library (Inventory)
--
-- Modeled on tracked_shows. A saved playlist appears in the user's library with a
-- progress bar (progress is computed client-side from watchlist/manga_readlist
-- completion, not stored here). A user may only see and manage their OWN saves,
-- and may only save a playlist they can actually see (public, or their own).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.saved_playlists (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playlist_id UUID        NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, playlist_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_playlists_user     ON public.saved_playlists (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_playlists_playlist ON public.saved_playlists (playlist_id);

ALTER TABLE public.saved_playlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own saved playlists" ON public.saved_playlists;
CREATE POLICY "Users read own saved playlists"
  ON public.saved_playlists FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users save visible playlists" ON public.saved_playlists;
CREATE POLICY "Users save visible playlists"
  ON public.saved_playlists FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_id
        AND (p.is_public = true OR p.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users unsave playlists" ON public.saved_playlists;
CREATE POLICY "Users unsave playlists"
  ON public.saved_playlists FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.saved_playlists TO authenticated;
GRANT ALL ON public.saved_playlists TO service_role;
