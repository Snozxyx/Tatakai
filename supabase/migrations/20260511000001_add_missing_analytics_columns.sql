-- =============================================================================
-- Add missing columns that admin dashboard components query
-- Fixes 400 Bad Request errors from PostgREST
-- =============================================================================

-- profiles: add country column (used by UserStatsPanel top-countries query)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country TEXT;

-- profiles: add role column (used by ban checks and moderator logic)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- watch_sessions: add started_at column (alias/complement to created_at)
ALTER TABLE public.watch_sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now();
-- Backfill started_at from created_at for existing rows
UPDATE public.watch_sessions SET started_at = created_at WHERE started_at IS NULL;

-- watch_sessions: add content_id column (used by download analytics)
ALTER TABLE public.watch_sessions ADD COLUMN IF NOT EXISTS content_id TEXT;
-- Backfill content_id from anime_id where it exists
UPDATE public.watch_sessions SET content_id = anime_id WHERE content_id IS NULL AND anime_id IS NOT NULL;

-- watch_sessions: add completed column (used by download completion rate)
ALTER TABLE public.watch_sessions ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;
-- Backfill: mark as completed if watch_duration_seconds > 0 and end_time is set
UPDATE public.watch_sessions
SET completed = TRUE
WHERE completed = FALSE
  AND end_time IS NOT NULL
  AND watch_duration_seconds > 300; -- consider > 5 min as "completed" for backfill

-- playback_telemetry: add source column (used by StreamingAnalyticsPanel provider breakdown)
ALTER TABLE public.playback_telemetry ADD COLUMN IF NOT EXISTS source TEXT;
-- Backfill source from server_name where it exists
UPDATE public.playback_telemetry SET source = server_name WHERE source IS NULL AND server_name IS NOT NULL;
-- Also backfill from metadata->>'source' where available
UPDATE public.playback_telemetry
SET source = metadata->>'source'
WHERE source IS NULL AND metadata->>'source' IS NOT NULL;

-- page_visits: add country column (in case it doesn't exist from the analytics migration)
ALTER TABLE public.page_visits ADD COLUMN IF NOT EXISTS country TEXT;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_watch_sessions_started_at ON public.watch_sessions (started_at);
CREATE INDEX IF NOT EXISTS idx_watch_sessions_content_id ON public.watch_sessions (content_id);
CREATE INDEX IF NOT EXISTS idx_playback_telemetry_source ON public.playback_telemetry (source) WHERE source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_country ON public.profiles (country) WHERE country IS NOT NULL;
