-- ============================================================================
-- Drop legacy / orphaned tables  (Tier A — evidence-backed, low risk)
-- ============================================================================
-- Audit method (2026-09-26):
--   * Enumerated all 126 public tables from supabase/main.sql.
--   * Aggregated every supabase-js `.from('<table>')` call across src/,
--     tatakaiapi/, desktop/ (the whole Tatakai app + API + Electron host).
--   * Cross-checked edge functions (supabase/functions), the API's Prisma
--     mirror (separate Media/Character schema, not public), pg_cron
--     (none active), and android/.
--   * Verified inbound foreign keys from supabase/main.sql so nothing is
--     orphaned by these drops.
--
-- Every table below has ZERO `.from()` references, ZERO edge-function refs,
-- and is superseded by a table that IS used (or is a log nothing writes).
--
-- NOT auto-applied. Review, then apply with your normal migration flow.
-- DROP is destructive and not reversible — data in these tables is lost.
-- No CASCADE is used on purpose: if an unforeseen view/function still depends
-- on one of these, the statement fails loudly instead of silently cascading.
-- ============================================================================

BEGIN;

-- Legacy metadata cluster — superseded by content_items + episode_items.
-- episodes.anilist_id FKs to anime_metadata, so drop episodes first.
DROP TABLE IF EXISTS public.episodes;
DROP TABLE IF EXISTS public.anime_metadata;

-- Superseded feedback/suggestion tables.
DROP TABLE IF EXISTS public.suggestions;        -- superseded by user_suggestions
DROP TABLE IF EXISTS public.user_reviews;       -- superseded by ratings

-- Old per-playlist comments — Phase 3 unified all comment systems into the
-- polymorphic public.comments table (entity_type = 'playlist').
DROP TABLE IF EXISTS public.playlist_comments;

-- Superseded provider monitoring — replaced by provider_health_states.
DROP TABLE IF EXISTS public.provider_health;

-- Superseded recommendation storage — replaced by user_recommendations.
DROP TABLE IF EXISTS public.recommendation_scores;
DROP TABLE IF EXISTS public.recommendations_cache;

-- Orphaned log table — no writer anywhere in app, API, functions, or SQL.
DROP TABLE IF EXISTS public.cache_invalidation_log;

-- ----------------------------------------------------------------------------
-- Tier B — verified 0 reads/writes/triggers across app, API, edge functions
-- and SQL migrations (checked INSERT/UPDATE/FROM/JOIN/trigger usage), 0 refs
-- in android/. Kept out of Tier A only because they touch external surfaces;
-- confirmed dead on inspection.
-- ----------------------------------------------------------------------------

-- Mobile push — no writer in app, API, DB functions, or android/.
DROP TABLE IF EXISTS public.push_notifications_log;
DROP TABLE IF EXISTS public.push_tokens;

-- API-key tiering — never read/written by the API (tatakaiapi) or anything else.
DROP TABLE IF EXISTS public.api_keys;

-- Planned-but-unwired rank/badge stat sink — no reader/writer anywhere.
DROP TABLE IF EXISTS public.user_stats;

-- Superseded admin config — home config replaced by curated_home_sections,
-- provider config replaced by provider_health_states.
DROP TABLE IF EXISTS public.admin_home_config;
DROP TABLE IF EXISTS public.admin_provider_config;

-- Unwired community scanlation-group cluster (no code/DB references at all).
-- These five tables carry RLS policies that reference EACH OTHER (e.g. the
-- "Insert community group members" policy on community_group_members reads
-- community_group_invites), so a plain DROP fails on the policy dependency no
-- matter how the tables are ordered — and if the references are mutual it is a
-- dependency cycle that no ordering can resolve. Drop the cluster's own
-- policies first; they are being deleted with their tables regardless. This is
-- NOT a blind CASCADE: it only removes policies that live ON these five doomed
-- tables, so an unforeseen *external* view/function/FK still fails loudly.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'community_group_entries',
        'community_group_invites',
        'community_group_members',
        'community_scan_uploads',
        'community_groups'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Children FK to community_groups, so drop them before the parent.
DROP TABLE IF EXISTS public.community_group_entries;
DROP TABLE IF EXISTS public.community_group_invites;
DROP TABLE IF EXISTS public.community_group_members;
DROP TABLE IF EXISTS public.community_scan_uploads;
DROP TABLE IF EXISTS public.community_groups;

COMMIT;

-- ============================================================================
-- Deliberately KEPT (0 app `.from()` but alive via DB functions / API jobs):
--   mappings, mobile_analytics, broadcast_messages, anime_views,
--   anime_similarity, anime_trending_scores, content_scores, content_overrides,
--   daily_analytics, provider_incidents, security_audit_log, rate_limits,
--   api_job_runs, api_manga_home_daily, api_source_validation_queue.
-- ============================================================================
