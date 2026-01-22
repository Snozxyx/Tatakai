-- Create playlists table
CREATE TABLE IF NOT EXISTS public.playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  cover_image text,
  is_public boolean DEFAULT false,
  items_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create playlist_items table
CREATE TABLE IF NOT EXISTS public.playlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  anime_id text NOT NULL,
  anime_name text NOT NULL,
  anime_poster text,
  position integer NOT NULL DEFAULT 0,
  added_at timestamptz DEFAULT now(),
  UNIQUE(playlist_id, anime_id)
);

-- Enable RLS
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_items ENABLE ROW LEVEL SECURITY;

-- Playlist policies
CREATE POLICY "Users can view own playlists" ON public.playlists
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view public playlists" ON public.playlists
FOR SELECT USING (is_public = true);

CREATE POLICY "Users can create own playlists" ON public.playlists
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own playlists" ON public.playlists
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own playlists" ON public.playlists
FOR DELETE USING (auth.uid() = user_id);

-- Playlist items policies
CREATE POLICY "Users can view items in own playlists" ON public.playlist_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.playlists
    WHERE playlists.id = playlist_items.playlist_id
    AND playlists.user_id = auth.uid()
  )
);

CREATE POLICY "Users can view items in public playlists" ON public.playlist_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.playlists
    WHERE playlists.id = playlist_items.playlist_id
    AND playlists.is_public = true
  )
);

CREATE POLICY "Users can add items to own playlists" ON public.playlist_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.playlists
    WHERE playlists.id = playlist_items.playlist_id
    AND playlists.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update items in own playlists" ON public.playlist_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.playlists
    WHERE playlists.id = playlist_items.playlist_id
    AND playlists.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete items from own playlists" ON public.playlist_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.playlists
    WHERE playlists.id = playlist_items.playlist_id
    AND playlists.user_id = auth.uid()
  )
);

-- Function to update items_count
CREATE OR REPLACE FUNCTION update_playlist_items_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.playlists SET items_count = items_count + 1, updated_at = now()
    WHERE id = NEW.playlist_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.playlists SET items_count = items_count - 1, updated_at = now()
    WHERE id = OLD.playlist_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update items_count
CREATE TRIGGER update_playlist_count
AFTER INSERT OR DELETE ON public.playlist_items
FOR EACH ROW EXECUTE FUNCTION update_playlist_items_count();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON public.playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_id ON public.playlist_items(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_position ON public.playlist_items(playlist_id, position);
