-- ============================================================
-- Migration: Manual user achievements
-- Date: 2026-02-28
-- Purpose: Allow admins to manually grant/revoke achievements
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id text NOT NULL,
  granted_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at    timestamptz NOT NULL DEFAULT now(),
  note          text,
  UNIQUE (user_id, achievement_id)
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id
  ON public.user_achievements (user_id);

-- Enable RLS
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- Only the user themselves can read their own achievements
CREATE POLICY "Users can read own achievements"
  ON public.user_achievements FOR SELECT
  USING (auth.uid() = user_id);

-- Anyone can read any user's achievements (for public profile rank display)
CREATE POLICY "Public read user achievements"
  ON public.user_achievements FOR SELECT
  USING (true);

-- Only admins can insert / update / delete
CREATE POLICY "Admins can manage achievements"
  ON public.user_achievements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );
