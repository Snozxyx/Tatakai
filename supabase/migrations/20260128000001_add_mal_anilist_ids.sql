-- Add MAL and AniList IDs to watchlist and watch_history tables
-- This enables proper MyAnimeList syncing and cross-platform tracking

-- ============================================
-- 1. ADD COLUMNS TO WATCHLIST
-- ============================================

ALTER TABLE public.watchlist
ADD COLUMN IF NOT EXISTS mal_id integer,
ADD COLUMN IF NOT EXISTS anilist_id integer;

-- Create indexes for fast lookups by MAL/AniList ID
CREATE INDEX IF NOT EXISTS idx_watchlist_mal_id ON public.watchlist(mal_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_anilist_id ON public.watchlist(anilist_id);

-- ============================================
-- 2. ADD COLUMNS TO WATCH_HISTORY
-- ============================================

ALTER TABLE public.watch_history
ADD COLUMN IF NOT EXISTS mal_id integer,
ADD COLUMN IF NOT EXISTS anilist_id integer;

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_watch_history_mal_id ON public.watch_history(mal_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_anilist_id ON public.watch_history(anilist_id);

-- ============================================
-- 3. COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN public.watchlist.mal_id IS 'MyAnimeList ID for this anime, sourced from HiAnime API episode sources endpoint';
COMMENT ON COLUMN public.watchlist.anilist_id IS 'AniList ID for this anime, sourced from HiAnime API episode sources endpoint';
COMMENT ON COLUMN public.watch_history.mal_id IS 'MyAnimeList ID for this anime, sourced from HiAnime API episode sources endpoint';
COMMENT ON COLUMN public.watch_history.anilist_id IS 'AniList ID for this anime, sourced from HiAnime API episode sources endpoint';
