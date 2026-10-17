-- Extend release metadata only; preserve existing RLS and per-platform latest indexes.
BEGIN;
ALTER TABLE public.app_releases DROP CONSTRAINT IF EXISTS app_releases_platform_check;
ALTER TABLE public.app_releases ADD CONSTRAINT app_releases_platform_check
  CHECK (platform IN ('win', 'mac', 'linux', 'android', 'android-tv'));
COMMIT;
