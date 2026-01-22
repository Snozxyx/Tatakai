-- Add shareable playlist fields and moderation metadata
ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS share_slug text,
  ADD COLUMN IF NOT EXISTS share_description text,
  ADD COLUMN IF NOT EXISTS embed_allowed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_flagged boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged_by uuid,
  ADD COLUMN IF NOT EXISTS flagged_reason text,
  ADD COLUMN IF NOT EXISTS flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS flag_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_reviewed boolean DEFAULT false;

-- Unique index on share_slug for short links
CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_share_slug ON public.playlists(share_slug);

-- Admins should be able to update flagged fields and manage playlists
-- Allow admins (profiles.is_admin) to UPDATE playlists
-- Note: keep existing "Users can update own playlists" policy; policies are ORed
DROP POLICY IF EXISTS "Admins can update playlists" ON public.playlists;
CREATE POLICY "Admins can update playlists" ON public.playlists
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Expose public playlists (already exists) — no change needed, but ensure index for lookups by slug+is_public
CREATE INDEX IF NOT EXISTS idx_playlists_share_slug_public ON public.playlists(share_slug, is_public);

-- Guarantee updated_at updated on modification
CREATE OR REPLACE FUNCTION update_playlists_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_playlists_updated_at ON public.playlists;
CREATE TRIGGER trigger_update_playlists_updated_at
  BEFORE UPDATE ON public.playlists
  FOR EACH ROW EXECUTE FUNCTION update_playlists_updated_at();
