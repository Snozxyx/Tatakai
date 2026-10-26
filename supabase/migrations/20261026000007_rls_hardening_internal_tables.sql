-- =============================================================================
-- RLS hardening for internal / admin-configured tables
-- =============================================================================
-- SEC audit finding DB-1.
--
-- Supabase's stock defaults grant `anon` and `authenticated` ALL on every new
-- table in the `public` schema. A table without RLS is therefore not "private by
-- default" — it is fully readable *and writable* by anyone who holds the public
-- anon key, which ships in the web bundle.
--
-- Ten tables created by earlier migrations (and two legacy ones that only exist
-- in the pg_dump snapshot) were in exactly that state. The worst of them is
-- `app_config`:
--
--     src/hooks/ui/useAppConfig.ts → supabase.from('app_config').upsert(...)
--
-- holds `min_supported_version`, `latest_version`, `force_update_message` and
-- `android_download_url`. With no RLS, any unauthenticated client could rewrite
-- `android_download_url` and point the in-app Android updater at an APK of their
-- choosing. `redirects` (in-app redirect targets), `admin_popups`,
-- `analytics_events`, the `api_*` backend caches and the country-policy audit
-- log were exposed the same way.
--
-- This migration is additive and idempotent: reads the app actually performs
-- keep working, writes move to staff-only, and internal tables lose client
-- access entirely. Service-role access (TatakaiAPI) is unaffected — service_role
-- bypasses RLS.
-- =============================================================================

-- Retire permissive legacy write policies before installing the explicit rules.
-- RLS policies are ORed: adding a staff-only policy cannot restrict an older
-- FOR ALL policy that still grants access. Analytics reads must also be staff-only.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname,tablename,policyname FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('app_config','redirects','admin_popups','analytics_events','anime_trending_scores')
      AND (cmd IN ('ALL','INSERT','UPDATE','DELETE') OR tablename='analytics_events')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I',p.policyname,p.schemaname,p.tablename);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1) Staff check, inlined the same way as the rest of the schema
-- ---------------------------------------------------------------------------
-- Matches the convention already used across the schema
-- (see 20260201000001_moderator_permissions.sql).
CREATE OR REPLACE FUNCTION public.security_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND (is_admin = true OR is_moderator = true
           OR role IN ('admin', 'moderator'))
  );
$$;

REVOKE ALL ON FUNCTION public.security_is_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_is_staff() TO authenticated, service_role;

-- app_config drives the in-app updater (android_download_url), so writes are
-- admin-only rather than staff-only.
CREATE OR REPLACE FUNCTION public.security_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND (is_admin = true OR role = 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.security_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_is_admin() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) app_config — public read (version gates must work before login),
--    admin-only write.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_config_public_read ON public.app_config;
CREATE POLICY app_config_public_read ON public.app_config
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS app_config_admin_write ON public.app_config;
CREATE POLICY app_config_admin_write ON public.app_config
  FOR ALL TO authenticated
  USING (public.security_is_admin())
  WITH CHECK (public.security_is_admin());

-- ---------------------------------------------------------------------------
-- 3) redirects — public read (router resolves slugs), staff-only write.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.redirects') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.redirects ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS redirects_public_read ON public.redirects';
  EXECUTE 'CREATE POLICY redirects_public_read ON public.redirects FOR SELECT TO anon, authenticated USING (true)';
  EXECUTE 'DROP POLICY IF EXISTS redirects_staff_write ON public.redirects';
  EXECUTE 'CREATE POLICY redirects_staff_write ON public.redirects FOR ALL TO authenticated USING (public.security_is_staff()) WITH CHECK (public.security_is_staff())';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) admin_popups — public read, staff-only write.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.admin_popups') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.admin_popups ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS admin_popups_public_read ON public.admin_popups';
  EXECUTE 'CREATE POLICY admin_popups_public_read ON public.admin_popups FOR SELECT TO anon, authenticated USING (true)';
  EXECUTE 'DROP POLICY IF EXISTS admin_popups_staff_write ON public.admin_popups';
  EXECUTE 'CREATE POLICY admin_popups_staff_write ON public.admin_popups FOR ALL TO authenticated USING (public.security_is_staff()) WITH CHECK (public.security_is_staff())';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) analytics_events — clients may append their own event rows, nobody but
--    staff may read them. (Client code: src/hooks/auth/useActiveSession.ts)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.analytics_events') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS analytics_events_insert_any ON public.analytics_events';
  EXECUTE 'CREATE POLICY analytics_events_insert_any ON public.analytics_events FOR INSERT TO anon, authenticated WITH CHECK (true)';
  EXECUTE 'DROP POLICY IF EXISTS analytics_events_staff_read ON public.analytics_events';
  EXECUTE 'CREATE POLICY analytics_events_staff_read ON public.analytics_events FOR SELECT TO authenticated USING (public.security_is_staff())';
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) anime_trending_scores — public read (policy already existed, RLS did not),
--    no client writes.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.anime_trending_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read trending scores" ON public.anime_trending_scores;
CREATE POLICY anime_trending_scores_public_read ON public.anime_trending_scores
  FOR SELECT TO anon, authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.anime_trending_scores FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Backend-owned tables — no client access at all.
--    (api_canonical_snapshots / api_source_validation_queue / api_manga_home_daily
--     / api_job_runs / country_policy_audit_log / legacy public.mappings)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'api_canonical_snapshots',
    'api_source_validation_queue',
    'api_manga_home_daily',
    'api_job_runs',
    'country_policy_audit_log',
    -- Legacy id-map table from the original schema dump. Nothing in the app,
    -- the API or the edge functions reads it any more (superseded by the
    -- `mappings` schema), so it gets the same "backend only" treatment rather
    -- than an RLS policy nobody asked for.
    'mappings'
  ]
  LOOP
    IF to_regclass('public.' || target) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
    -- RLS with no policy denies everyone except the owner / service_role.
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', target);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) `mappings` schema — internal id map, created without privilege revokes.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'mappings') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA mappings FROM PUBLIC, anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA mappings FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA mappings FROM anon, authenticated';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9) Keep the existing guard authoritative for the one key it protects.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.app_config IS
  'App-wide configuration. RLS: public SELECT, staff-only writes (see migration 20261026000007). SECURITY: android_download_url / min_supported_version drive the in-app updater — treat as supply-chain material.';
