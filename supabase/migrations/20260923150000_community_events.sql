-- ============================================================
-- Migration: Community events (item 10)
-- Date: 2026-09-23
-- Purpose:
--   Back the Schedule tab of /community. Admins/moderators post upcoming
--   events (streams, watch-alongs, releases, contests); everyone can read
--   them. Writes are gated by RLS using the same staff check as
--   set_post_pinned (has_role admin/moderator OR profiles.is_admin).
--
--   Additive + idempotent, matching the earlier feed migrations
--   (20260922150000 / 20260923093000): IF NOT EXISTS on tables/columns,
--   DROP POLICY IF EXISTS before each policy, explicit GRANTs to anon /
--   authenticated / service_role.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.community_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz,
  location    text,
  link        text,
  image_url   text,
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_events_starts_at
  ON public.community_events (starts_at);

ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;

-- Keep updated_at fresh on every edit.
CREATE OR REPLACE FUNCTION public.community_events_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_events_touch ON public.community_events;
CREATE TRIGGER trg_community_events_touch
  BEFORE UPDATE ON public.community_events
  FOR EACH ROW EXECUTE FUNCTION public.community_events_touch_updated_at();

-- Staff predicate reused across the write policies.
--   has_role(uid,'admin' | 'moderator') OR profiles.is_admin — both models exist.
-- Read: everyone (including anon) sees the schedule.
DROP POLICY IF EXISTS "Anyone can read community events" ON public.community_events;
CREATE POLICY "Anyone can read community events" ON public.community_events
  FOR SELECT USING (true);

-- Insert: staff only, and only as themselves.
DROP POLICY IF EXISTS "Staff can create community events" ON public.community_events;
CREATE POLICY "Staff can create community events" ON public.community_events
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'moderator')
      OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_admin = true)
    )
  );

-- Update: staff only.
DROP POLICY IF EXISTS "Staff can update community events" ON public.community_events;
CREATE POLICY "Staff can update community events" ON public.community_events
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'moderator')
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'moderator')
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_admin = true)
  );

-- Delete: staff only.
DROP POLICY IF EXISTS "Staff can delete community events" ON public.community_events;
CREATE POLICY "Staff can delete community events" ON public.community_events
  FOR DELETE USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'moderator')
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_admin = true)
  );

GRANT SELECT ON public.community_events TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.community_events TO authenticated;
GRANT ALL ON public.community_events TO service_role;
