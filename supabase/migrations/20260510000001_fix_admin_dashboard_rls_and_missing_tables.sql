-- =============================================================================
-- Fix Admin Dashboard RLS, Missing Tables, and has_role Function
-- This migration fixes "Failed to fetch" errors across all admin panels
-- by:
--   1. Creating the missing has_role() helper function
--   2. Creating the missing reports table
--   3. Fixing analytics table RLS to allow admins AND moderators
--   4. Adding missing columns to ban_history for the audit log panel
--   5. Fixing page_visits / watch_sessions RLS for admin access
-- =============================================================================

-- =============================================================================
-- 1. has_role() helper — used by several RLS policies
-- =============================================================================
CREATE OR REPLACE FUNCTION public.has_role(p_user_id uuid, p_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = p_user_id
    AND (
      CASE p_role
        WHEN 'admin'     THEN is_admin = true
        WHEN 'moderator' THEN (is_moderator = true OR role = 'moderator' OR is_admin = true)
        ELSE false
      END
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, anon;

-- =============================================================================
-- 2. reports table — needed by ReportManager
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type   TEXT        NOT NULL CHECK (target_type IN ('user', 'comment', 'server', 'anime', 'forum_post', 'other')),
  target_id     TEXT        NOT NULL,
  reason        TEXT        NOT NULL,
  details       TEXT,
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'action_taken', 'dismissed')),
  admin_notes   TEXT,
  moderator_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_status    ON public.reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reporter  ON public.reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_target    ON public.reports (target_type, target_id);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can submit a report
DROP POLICY IF EXISTS "Authenticated users can create reports" ON public.reports;
CREATE POLICY "Authenticated users can create reports"
  ON public.reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- Reporters can view their own reports
DROP POLICY IF EXISTS "Users can view own reports" ON public.reports;
CREATE POLICY "Users can view own reports"
  ON public.reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

-- Admins and moderators can view all reports
DROP POLICY IF EXISTS "Staff can view all reports" ON public.reports;
CREATE POLICY "Staff can view all reports"
  ON public.reports FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'moderator'));

-- Admins and moderators can update reports (change status, add notes)
DROP POLICY IF EXISTS "Staff can update reports" ON public.reports;
CREATE POLICY "Staff can update reports"
  ON public.reports FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'moderator'));

-- =============================================================================
-- 3. Fix page_visits RLS — allow admins AND moderators to read
-- =============================================================================
DROP POLICY IF EXISTS "Admins can read page visits" ON public.page_visits;
CREATE POLICY "Staff can read page visits"
  ON public.page_visits FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'moderator'));

-- =============================================================================
-- 4. Fix watch_sessions RLS — allow staff to read all sessions
-- =============================================================================
DROP POLICY IF EXISTS "Users can see own watch sessions" ON public.watch_sessions;
CREATE POLICY "Users can see own watch sessions"
  ON public.watch_sessions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'moderator')
  );

-- =============================================================================
-- 5. Fix daily_analytics RLS — use has_role
-- =============================================================================
DROP POLICY IF EXISTS "Admins can manage daily analytics" ON public.daily_analytics;
CREATE POLICY "Staff can read daily analytics"
  ON public.daily_analytics FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins can manage daily analytics"
  ON public.daily_analytics FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- 6. Ensure ban_history has an 'action' column for BanAuditLogPanel
--    (The panel queries action = 'banned' | 'unbanned')
-- =============================================================================
ALTER TABLE public.ban_history
  ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'banned'
    CHECK (action IN ('banned', 'unbanned'));

-- Backfill: rows with unbanned_at set are 'unbanned', others are 'banned'
UPDATE public.ban_history
SET action = 'unbanned'
WHERE unbanned_at IS NOT NULL AND action = 'banned';

-- =============================================================================
-- 7. Ensure ban_history has a performed_by column for the audit log display
-- =============================================================================
ALTER TABLE public.ban_history
  ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Backfill performed_by = banned_by for ban records
UPDATE public.ban_history
SET performed_by = banned_by
WHERE performed_by IS NULL AND action = 'banned';

UPDATE public.ban_history
SET performed_by = unbanned_by
WHERE performed_by IS NULL AND action = 'unbanned';

-- =============================================================================
-- 8. Moderators need SELECT on profiles for the admin user management
-- =============================================================================
DROP POLICY IF EXISTS "Staff can read all profiles" ON public.profiles;
CREATE POLICY "Staff can read all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()        -- own profile
    OR is_public = true         -- public profiles
    OR public.has_role(auth.uid(), 'moderator')  -- staff sees all
  );

-- =============================================================================
-- 9. Fix playback_telemetry RLS (used by PerformanceInsightsPanel)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'playback_telemetry') THEN
    -- Drop old restrictive policy if exists
    DROP POLICY IF EXISTS "Users can insert telemetry" ON public.playback_telemetry;
    DROP POLICY IF EXISTS "Admins can read telemetry" ON public.playback_telemetry;

    -- Anyone can insert telemetry (anonymous analytics)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'playback_telemetry' AND policyname = 'Anyone can insert telemetry') THEN
      CREATE POLICY "Anyone can insert telemetry"
        ON public.playback_telemetry FOR INSERT
        WITH CHECK (true);
    END IF;

    -- Staff can read telemetry
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'playback_telemetry' AND policyname = 'Staff can read telemetry') THEN
      CREATE POLICY "Staff can read telemetry"
        ON public.playback_telemetry FOR SELECT
        TO authenticated
        USING (public.has_role(auth.uid(), 'moderator'));
    END IF;
  END IF;
END $$;

-- =============================================================================
-- 10. update_policies table RLS (used by UpdateManagementPanel)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'update_policies') THEN
    ALTER TABLE public.update_policies ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Anyone can read active update policies" ON public.update_policies;
    CREATE POLICY "Anyone can read active update policies"
      ON public.update_policies FOR SELECT
      USING (true);  -- public read — the app checks these on startup

    DROP POLICY IF EXISTS "Admins can manage update policies" ON public.update_policies;
    CREATE POLICY "Admins can manage update policies"
      ON public.update_policies FOR ALL
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- =============================================================================
-- 11. comments table — moderators need to delete any comment
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'comments') THEN
    DROP POLICY IF EXISTS "Staff can delete any comment" ON public.comments;
    CREATE POLICY "Staff can delete any comment"
      ON public.comments FOR DELETE
      TO authenticated
      USING (
        user_id = auth.uid()
        OR public.has_role(auth.uid(), 'moderator')
      );
  END IF;
END $$;

-- =============================================================================
-- 12. reports updated_at trigger
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reports_updated_at ON public.reports;
CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
