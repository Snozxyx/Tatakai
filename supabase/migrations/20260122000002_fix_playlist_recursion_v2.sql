-- Fix infinite recursion in playlist_collaborators policies using security definer functions

-- Create a security definer function to check playlist access without recursion
CREATE OR REPLACE FUNCTION public.can_access_playlist_collaborators(playlist_id_param uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.playlists p
    WHERE p.id = playlist_id_param
    AND (
      p.user_id = auth.uid()
      OR p.is_public = true
    )
  );
$$;

-- Create a function to check if user is admin/owner of playlist
CREATE OR REPLACE FUNCTION public.can_manage_playlist_collaborators(playlist_id_param uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.playlists p
    WHERE p.id = playlist_id_param
    AND p.user_id = auth.uid()
  );
$$;

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view collaborators of accessible playlists" ON public.playlist_collaborators;
DROP POLICY IF EXISTS "Playlist owners can add collaborators" ON public.playlist_collaborators;
DROP POLICY IF EXISTS "Playlist owners and admins can update collaborators" ON public.playlist_collaborators;
DROP POLICY IF EXISTS "Playlist owners and admins can remove collaborators" ON public.playlist_collaborators;

-- Create new policies using the security definer functions
CREATE POLICY "Users can view collaborators of accessible playlists" ON public.playlist_collaborators
  FOR SELECT USING (
    can_access_playlist_collaborators(playlist_id)
    OR user_id = auth.uid() -- Can always see their own collaborator entries
  );

CREATE POLICY "Playlist owners can add collaborators" ON public.playlist_collaborators
  FOR INSERT WITH CHECK (
    can_manage_playlist_collaborators(playlist_id)
  );

CREATE POLICY "Playlist owners can update collaborators" ON public.playlist_collaborators
  FOR UPDATE USING (
    can_manage_playlist_collaborators(playlist_id)
  );

CREATE POLICY "Playlist owners can remove collaborators" ON public.playlist_collaborators
  FOR DELETE USING (
    can_manage_playlist_collaborators(playlist_id)
  );