-- =============================================================================
-- playlist_likes — users can "like" a playlist (docs Playlist Visual Upgradation)
--
-- Likes are a single up-only signal (no dislikes). The aggregate is denormalized
-- onto playlists.likes_count via trigger so any viewer sees the total without
-- being able to read other users' like rows. A user may only read their OWN like
-- rows (to render the filled/empty heart) and may only like a playlist they can
-- actually see (public, or their own).
-- =============================================================================

ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.playlist_likes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID        NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_playlist_likes_playlist ON public.playlist_likes (playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_likes_user     ON public.playlist_likes (user_id);

ALTER TABLE public.playlist_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own playlist likes" ON public.playlist_likes;
CREATE POLICY "Users read own playlist likes"
  ON public.playlist_likes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users like visible playlists" ON public.playlist_likes;
CREATE POLICY "Users like visible playlists"
  ON public.playlist_likes FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_id
        AND (p.is_public = true OR p.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users unlike playlists" ON public.playlist_likes;
CREATE POLICY "Users unlike playlists"
  ON public.playlist_likes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.playlist_likes TO authenticated;
GRANT ALL ON public.playlist_likes TO service_role;

-- Keep playlists.likes_count in sync.
CREATE OR REPLACE FUNCTION public.update_playlist_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.playlists SET likes_count = likes_count + 1 WHERE id = NEW.playlist_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.playlists SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.playlist_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_playlist_likes_count ON public.playlist_likes;
CREATE TRIGGER trg_playlist_likes_count
AFTER INSERT OR DELETE ON public.playlist_likes
FOR EACH ROW EXECUTE FUNCTION public.update_playlist_likes_count();
