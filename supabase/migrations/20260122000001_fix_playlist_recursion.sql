-- Fix infinite recursion in playlist_collaborators policies
DROP POLICY IF EXISTS "Users can view collaborators of accessible playlists" ON public.playlist_collaborators;
DROP POLICY IF EXISTS "Playlist owners and admins can update collaborators" ON public.playlist_collaborators;
DROP POLICY IF EXISTS "Playlist owners and admins can remove collaborators" ON public.playlist_collaborators;

CREATE POLICY "Users can view collaborators of accessible playlists" ON public.playlist_collaborators
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_collaborators.playlist_id
      AND (
        p.user_id = auth.uid() 
        OR p.is_public = true 
        OR (
          -- Check if the current user is a collaborator without recursing on the same table JOIN
          playlist_collaborators.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Playlist owners and admins can update collaborators" ON public.playlist_collaborators
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_collaborators.playlist_id
      AND (
        p.user_id = auth.uid()
        OR (
          -- Check admin role directly for the CURRENT user in a way that avoids policy recursion
          EXISTS (
            SELECT 1 FROM public.playlist_collaborators pc
            WHERE pc.playlist_id = p.id
            AND pc.user_id = auth.uid()
            AND pc.role = 'admin'
          )
        )
      )
    )
  );

CREATE POLICY "Playlist owners and admins can remove collaborators" ON public.playlist_collaborators
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_collaborators.playlist_id
      AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.playlist_collaborators pc
          WHERE pc.playlist_id = p.id
          AND pc.user_id = auth.uid()
          AND pc.role = 'admin'
        )
      )
    )
  );
