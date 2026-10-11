-- Performance panel support: the `app_version` column that
-- PerformanceInsightsPanel reads (version distribution + stable adoption) was
-- referenced but never created, so both sections errored/emptied. Clients now
-- report their build version on the session heartbeat (useActiveSession), which
-- needs the column-level UPDATE grant (see 20260902000003 §3 — per-column
-- grants are deliberate allowlists).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS app_version text;

-- Clients report their own version on heartbeat; staff already read all profiles.
GRANT UPDATE (app_version) ON public.profiles TO authenticated;

CREATE INDEX IF NOT EXISTS idx_profiles_app_version
  ON public.profiles (app_version);
