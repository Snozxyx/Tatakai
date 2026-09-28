-- =============================================================================
-- Admin dashboard ban tables
--
-- This file shipped as 0 bytes. Five built admin panels query the tables it was
-- supposed to create, so each one fails its first request:
--
--   IPBanPanel          -> ip_bans
--   DeviceBanPanel      -> device_bans
--   BanTemplatesPanel   -> ban_templates
--   AppReleaseManager   -> app_releases
--   BanDialog templates -> ban_templates
--
-- Column names and types are taken from the panels themselves and from the
-- interfaces in src/types/admin-dashboard.ts, not invented here — anything that
-- disagrees would leave the panels just as broken as an empty file does.
--
-- `banned_by` / `created_by` reference auth.users(id), because that is what the
-- panels write: `banned_by: currentUser.user?.id`. Note this is the opposite id
-- space from ban_history, whose banned_by references profiles(id) — see the
-- 0.10 note in docs/v6-build-plan.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ip_bans
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ip_bans (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- inet, not text: it rejects malformed addresses at the boundary, normalises
  -- IPv6 so the same address cannot be banned twice in two notations, and lines
  -- up with page_visits.ip_address for the server-side capture in 8.1.
  ip_address  INET        NOT NULL UNIQUE,
  reason      TEXT        NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  banned_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ip_bans_created  ON public.ip_bans (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ip_bans_expires  ON public.ip_bans (expires_at)
  WHERE expires_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- device_bans
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_bans (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   TEXT        NOT NULL UNIQUE CHECK (char_length(device_id) BETWEEN 1 AND 255),
  reason      TEXT        NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  banned_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_device_bans_created ON public.device_bans (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_bans_expires ON public.device_bans (expires_at)
  WHERE expires_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- ban_templates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ban_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 100),
  reason          TEXT        NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  -- NULL means permanent. The upper bound matches the 1-8760 range the ban
  -- dialog offers for a custom duration (one year in hours).
  duration_hours  INTEGER     CHECK (duration_hours IS NULL OR duration_hours BETWEEN 1 AND 8760),
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- app_releases
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_releases (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  version     TEXT        NOT NULL CHECK (char_length(version) BETWEEN 1 AND 64),
  platform    TEXT        NOT NULL CHECK (platform IN ('win', 'mac', 'linux', 'android')),
  url         TEXT        NOT NULL,
  notes       TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  is_latest   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, version)
);

-- At most one current release per platform. AppReleaseManager clears the flag on
-- the platform's other rows before writing, but it does so in a second statement
-- with no transaction around it, so the constraint is what actually holds.
CREATE UNIQUE INDEX IF NOT EXISTS app_releases_one_latest_per_platform
  ON public.app_releases (platform)
  WHERE is_latest = true;

CREATE INDEX IF NOT EXISTS idx_app_releases_created ON public.app_releases (created_at DESC);

DROP TRIGGER IF EXISTS trg_app_releases_updated_at ON public.app_releases;

-- Defined here rather than relied upon: the migration that also declares this
-- helper (20260510000001) runs after this one, so on a fresh database the trigger
-- below would have nothing to call.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_app_releases_updated_at
  BEFORE UPDATE ON public.app_releases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- =============================================================================
-- Row Level Security
--
-- has_role() is declared here for the same ordering reason as set_updated_at:
-- 20260510000001 is where it normally lives, and that runs later. The body is
-- identical, so whichever applies last is a no-op.
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

ALTER TABLE public.ip_bans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_bans   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ban_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_releases  ENABLE ROW LEVEL SECURITY;

-- Ban lists are staff-only in both directions. A user who can read ip_bans learns
-- which addresses are blocked, which is exactly the information needed to test
-- whether a new one is; there is no product reason to expose them. Written out
-- longhand rather than generated in a DO block so the grants can be read off the
-- page during review.

DROP POLICY IF EXISTS "Staff manage ip_bans" ON public.ip_bans;
CREATE POLICY "Staff manage ip_bans"
  ON public.ip_bans FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'moderator'))
  WITH CHECK (public.has_role(auth.uid(), 'moderator'));

DROP POLICY IF EXISTS "Staff manage device_bans" ON public.device_bans;
CREATE POLICY "Staff manage device_bans"
  ON public.device_bans FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'moderator'))
  WITH CHECK (public.has_role(auth.uid(), 'moderator'));

DROP POLICY IF EXISTS "Staff manage ban_templates" ON public.ban_templates;
CREATE POLICY "Staff manage ban_templates"
  ON public.ban_templates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'moderator'))
  WITH CHECK (public.has_role(auth.uid(), 'moderator'));

-- Releases are the one table here that has to be world-readable: the desktop app
-- checks for a download with the anon key before anyone has signed in.
DROP POLICY IF EXISTS "Anyone can read app releases" ON public.app_releases;
CREATE POLICY "Anyone can read app releases"
  ON public.app_releases FOR SELECT
  TO anon, authenticated
  USING (true);

-- Publishing a release points every desktop client at a binary, so it is admin
-- only rather than moderator.
DROP POLICY IF EXISTS "Admins manage app releases" ON public.app_releases;
CREATE POLICY "Admins manage app releases"
  ON public.app_releases FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));


