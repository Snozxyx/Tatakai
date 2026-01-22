-- Playlist collaboration: Multiple editors

-- Playlist collaborators table
CREATE TABLE IF NOT EXISTS public.playlist_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('viewer', 'editor', 'admin')),
  added_by uuid NOT NULL REFERENCES auth.users(id),
  added_at timestamptz DEFAULT now(),
  UNIQUE(playlist_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_playlist_collaborators_playlist ON public.playlist_collaborators(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_collaborators_user ON public.playlist_collaborators(user_id);

-- Enable RLS
ALTER TABLE public.playlist_collaborators ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view collaborators of accessible playlists" ON public.playlist_collaborators
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.playlists
      WHERE playlists.id = playlist_collaborators.playlist_id
      AND (
        playlists.user_id = auth.uid() -- Owner
        OR playlists.is_public = true -- Public playlist
        OR EXISTS (
          SELECT 1 FROM public.playlist_collaborators pc
          WHERE pc.playlist_id = playlists.id
          AND pc.user_id = auth.uid()
        ) -- Collaborator
      )
    )
  );

CREATE POLICY "Playlist owners can add collaborators" ON public.playlist_collaborators
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.playlists
      WHERE playlists.id = playlist_collaborators.playlist_id
      AND playlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Playlist owners and admins can update collaborators" ON public.playlist_collaborators
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.playlists
      WHERE playlists.id = playlist_collaborators.playlist_id
      AND (
        playlists.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.playlist_collaborators pc
          WHERE pc.playlist_id = playlists.id
          AND pc.user_id = auth.uid()
          AND pc.role = 'admin'
        )
      )
    )
  );

CREATE POLICY "Playlist owners and admins can remove collaborators" ON public.playlist_collaborators
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.playlists
      WHERE playlists.id = playlist_collaborators.playlist_id
      AND (
        playlists.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.playlist_collaborators pc
          WHERE pc.playlist_id = playlists.id
          AND pc.user_id = auth.uid()
          AND pc.role = 'admin'
        )
      )
    )
  );

-- Update playlists RLS to allow collaborators to edit
DROP POLICY IF EXISTS "Users can update own playlists" ON public.playlists;
CREATE POLICY "Users can update own playlists" ON public.playlists
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.playlist_collaborators
      WHERE playlist_collaborators.playlist_id = playlists.id
      AND playlist_collaborators.user_id = auth.uid()
      AND playlist_collaborators.role IN ('editor', 'admin')
    )
  );

-- Update playlist_items RLS to allow collaborators to edit
DROP POLICY IF EXISTS "Users can add items to own playlists" ON public.playlist_items;
CREATE POLICY "Users can add items to own playlists" ON public.playlist_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.playlists
      WHERE playlists.id = playlist_items.playlist_id
      AND (
        playlists.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.playlist_collaborators
          WHERE playlist_collaborators.playlist_id = playlists.id
          AND playlist_collaborators.user_id = auth.uid()
          AND playlist_collaborators.role IN ('editor', 'admin')
        )
      )
    )
  );

DROP POLICY IF EXISTS "Users can remove items from own playlists" ON public.playlist_items;
CREATE POLICY "Users can remove items from own playlists" ON public.playlist_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.playlists
      WHERE playlists.id = playlist_items.playlist_id
      AND (
        playlists.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.playlist_collaborators
          WHERE playlist_collaborators.playlist_id = playlists.id
          AND playlist_collaborators.user_id = auth.uid()
          AND playlist_collaborators.role IN ('editor', 'admin')
        )
      )
    )
  );
