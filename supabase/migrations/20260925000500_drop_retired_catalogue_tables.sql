-- =============================================================================
-- Drop retired-section backing tables (admin overhaul, Phase 2 cleanup)
--
-- These four tables backed admin-only catalogue sections that are being removed
-- from the dashboard. Audited repo-wide (2026-09-25): their ONLY consumers are
-- the admin panels being deleted in the same change, plus the already-dead
-- src/components/anime/LanguagesSection.tsx (defined, never rendered).
--
--   * custom_sources         — only CustomSourceManager (admin)
--   * custom_video_sources   — only VideoServerManager  (admin)
--   * custom_languages       — LanguageManager (admin) + dead LanguagesSection
--   * custom_language_anime  — child of custom_languages (FK), same consumers
--
-- Deliberately NOT dropped (back live, non-admin features — only their admin UI
-- is removed): marketplace_items (WatchPage MarketplaceSubmitModal),
-- extension_manifests / extensions / extension_audit_logs (public /extensions
-- hub + TatakaiAPI), watch_sessions / playback_telemetry (shared analytics).
--
-- DESTRUCTIVE. WRITTEN, NOT APPLIED — repo standing rule. Dropping a table also
-- drops its indexes, RLS policies, grants and constraints; the child table is
-- dropped before its parent so no CASCADE is needed.
-- =============================================================================

DROP TABLE IF EXISTS public.custom_language_anime;
DROP TABLE IF EXISTS public.custom_languages;
DROP TABLE IF EXISTS public.custom_video_sources;
DROP TABLE IF EXISTS public.custom_sources;
