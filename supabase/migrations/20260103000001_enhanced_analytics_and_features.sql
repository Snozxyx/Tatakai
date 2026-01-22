-- Enhanced Analytics & Features Migration
-- Adds visitor tracking, watch time analytics, public profiles, tier lists, and integrations

-- ============================================
-- 1. VISITOR/ANALYTICS TRACKING
-- ============================================

-- Page visits tracking (including guests)
CREATE TABLE IF NOT EXISTS public.page_visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id text NOT NULL,
    ip_address inet,
    country text,
    city text,
    user_agent text,
    page_path text NOT NULL,
    referrer text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Watch session tracking
CREATE TABLE IF NOT EXISTS public.watch_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id text NOT NULL,
    anime_id text NOT NULL,
    episode_id text NOT NULL,
    anime_name text,
    anime_poster text,
    genres text[],
    start_time timestamp with time zone DEFAULT now() NOT NULL,
    end_time timestamp with time zone,
    watch_duration_seconds integer DEFAULT 0,
    ip_address inet,
    country text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Daily aggregated stats (for faster querying)
CREATE TABLE IF NOT EXISTS public.daily_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    date date NOT NULL UNIQUE,
    total_visitors integer DEFAULT 0,
    unique_visitors integer DEFAULT 0,
    guest_visitors integer DEFAULT 0,
    logged_in_visitors integer DEFAULT 0,
    total_page_views integer DEFAULT 0,
    total_watch_time_seconds bigint DEFAULT 0,
    new_users integer DEFAULT 0,
    new_comments integer DEFAULT 0,
    new_ratings integer DEFAULT 0,
    top_countries jsonb DEFAULT '[]'::jsonb,
    top_genres jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ============================================
-- 2. ENHANCED PROFILES
-- ============================================

-- Add new columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS banner_url text,
ADD COLUMN IF NOT EXISTS total_watch_time_seconds bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS showcase_anime_ids text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS mal_user_id text,
ADD COLUMN IF NOT EXISTS mal_access_token text,
ADD COLUMN IF NOT EXISTS mal_refresh_token text,
ADD COLUMN IF NOT EXISTS mal_token_expires_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS anilist_user_id text,
ADD COLUMN IF NOT EXISTS anilist_access_token text,
ADD COLUMN IF NOT EXISTS anilist_token_expires_at timestamp with time zone;

-- ============================================
-- 3. TIER LISTS
-- ============================================

CREATE TABLE IF NOT EXISTS public.tier_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    is_public boolean DEFAULT true,
    items jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Each item: { "anime_id": "...", "anime_title": "...", "anime_image": "...", "tier": "S", "position": 0 }
    share_code text UNIQUE,
    likes_count integer DEFAULT 0,
    views_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tier_list_likes (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tier_list_id uuid NOT NULL REFERENCES public.tier_lists(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(user_id, tier_list_id)
);

-- ============================================
-- 4. ADMIN VIDEO SERVERS
-- ============================================

CREATE TABLE IF NOT EXISTS public.custom_video_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    anime_id text NOT NULL,
    anime_title text NOT NULL DEFAULT 'Unknown',
    episode_number integer NOT NULL,
    server_name text NOT NULL,
    video_url text NOT NULL,
    quality text DEFAULT '1080p',
    priority integer DEFAULT 1,
    subtitles jsonb DEFAULT '[]'::jsonb,
    headers jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(anime_id, episode_number, server_name)
);

-- ============================================
-- 5. INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_page_visits_session ON public.page_visits(session_id);
CREATE INDEX IF NOT EXISTS idx_page_visits_user ON public.page_visits(user_id);
CREATE INDEX IF NOT EXISTS idx_page_visits_created ON public.page_visits(created_at);
CREATE INDEX IF NOT EXISTS idx_page_visits_country ON public.page_visits(country);

CREATE INDEX IF NOT EXISTS idx_watch_sessions_user ON public.watch_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_sessions_anime ON public.watch_sessions(anime_id);
CREATE INDEX IF NOT EXISTS idx_watch_sessions_created ON public.watch_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_watch_sessions_country ON public.watch_sessions(country);

CREATE INDEX IF NOT EXISTS idx_daily_analytics_date ON public.daily_analytics(date);

CREATE INDEX IF NOT EXISTS idx_tier_lists_user ON public.tier_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_tier_lists_share_code ON public.tier_lists(share_code);
CREATE INDEX IF NOT EXISTS idx_tier_lists_public ON public.tier_lists(is_public);

CREATE INDEX IF NOT EXISTS idx_custom_sources_anime ON public.custom_video_sources(anime_id, episode_number);

-- ============================================
-- 6. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_list_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_video_sources ENABLE ROW LEVEL SECURITY;

-- Page visits - anyone can insert, admins can read
CREATE POLICY "Anyone can insert page visits" ON public.page_visits FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can read page visits" ON public.page_visits FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Watch sessions - anyone can insert, users can see own, admins can see all
CREATE POLICY "Anyone can insert watch sessions" ON public.watch_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can see own watch sessions" ON public.watch_sessions FOR SELECT USING (
    user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Users can update own watch sessions" ON public.watch_sessions FOR UPDATE USING (
    user_id = auth.uid() OR session_id IS NOT NULL
);

-- Daily analytics - admins only
CREATE POLICY "Admins can manage daily analytics" ON public.daily_analytics FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Tier lists - public can view public lists, users can manage own
CREATE POLICY "Anyone can view public tier lists" ON public.tier_lists FOR SELECT USING (is_public = true OR user_id = auth.uid());
CREATE POLICY "Users can create tier lists" ON public.tier_lists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tier lists" ON public.tier_lists FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own tier lists" ON public.tier_lists FOR DELETE USING (user_id = auth.uid());

-- Tier list likes
CREATE POLICY "Anyone can view likes" ON public.tier_list_likes FOR SELECT USING (true);
CREATE POLICY "Users can manage own likes" ON public.tier_list_likes FOR ALL USING (user_id = auth.uid());

-- Custom video sources - admins can manage, anyone can view active
CREATE POLICY "Anyone can view active custom sources" ON public.custom_video_sources FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage custom sources" ON public.custom_video_sources FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- 7. FUNCTIONS
-- ============================================

-- Function to update user's total watch time
CREATE OR REPLACE FUNCTION public.update_user_watch_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.user_id IS NOT NULL AND NEW.watch_duration_seconds > 0 THEN
        UPDATE public.profiles 
        SET total_watch_time_seconds = total_watch_time_seconds + NEW.watch_duration_seconds
        WHERE user_id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$;

-- Trigger for watch time update
DROP TRIGGER IF EXISTS trigger_update_user_watch_time ON public.watch_sessions;
CREATE TRIGGER trigger_update_user_watch_time
    AFTER UPDATE OF watch_duration_seconds ON public.watch_sessions
    FOR EACH ROW
    WHEN (OLD.watch_duration_seconds IS DISTINCT FROM NEW.watch_duration_seconds)
    EXECUTE FUNCTION public.update_user_watch_time();

-- Function to generate unique share code
CREATE OR REPLACE FUNCTION public.generate_share_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    result text := '';
    i integer;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$;

-- Trigger to auto-generate share code for tier lists
CREATE OR REPLACE FUNCTION public.tier_list_set_share_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.share_code IS NULL THEN
        NEW.share_code := public.generate_share_code();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_tier_list_share_code ON public.tier_lists;
CREATE TRIGGER trigger_tier_list_share_code
    BEFORE INSERT ON public.tier_lists
    FOR EACH ROW
    EXECUTE FUNCTION public.tier_list_set_share_code();

-- Function to update tier list likes count
CREATE OR REPLACE FUNCTION public.update_tier_list_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.tier_lists SET likes_count = likes_count + 1 WHERE id = NEW.tier_list_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.tier_lists SET likes_count = likes_count - 1 WHERE id = OLD.tier_list_id;
        RETURN OLD;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trigger_tier_list_likes ON public.tier_list_likes;
CREATE TRIGGER trigger_tier_list_likes
    AFTER INSERT OR DELETE ON public.tier_list_likes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_tier_list_likes_count();
