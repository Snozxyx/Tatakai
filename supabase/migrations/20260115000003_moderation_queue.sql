-- Moderation queue for admin review

CREATE TABLE IF NOT EXISTS public.moderation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('comment', 'playlist', 'tier_list', 'forum_post', 'profile')),
  entity_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'flagged')),
  flagged_by uuid REFERENCES auth.users(id),
  flagged_reason text,
  flagged_at timestamptz DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(entity_type, entity_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_moderation_queue_status ON public.moderation_queue(status);
CREATE INDEX IF NOT EXISTS idx_moderation_queue_entity ON public.moderation_queue(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_moderation_queue_flagged_at ON public.moderation_queue(flagged_at DESC);

-- Enable RLS
ALTER TABLE public.moderation_queue ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins and moderators can view all moderation items" ON public.moderation_queue
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND (profiles.is_admin = true OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'moderator'
      ))
    )
  );

CREATE POLICY "Users can flag content" ON public.moderation_queue
  FOR INSERT WITH CHECK (auth.uid() = flagged_by);

CREATE POLICY "Admins and moderators can review items" ON public.moderation_queue
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND (profiles.is_admin = true OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'moderator'
      ))
    )
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_moderation_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_moderation_queue_updated_at ON public.moderation_queue;
CREATE TRIGGER trigger_update_moderation_queue_updated_at
  BEFORE UPDATE ON public.moderation_queue
  FOR EACH ROW EXECUTE FUNCTION update_moderation_queue_updated_at();
