-- Views table to track episode views
CREATE TABLE IF NOT EXISTS public.anime_views (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    anime_id text NOT NULL,
    episode_id text NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id text, -- For anonymous tracking
    ip_hash text, -- Hashed IP for rate limiting
    viewed_at timestamp with time zone DEFAULT now() NOT NULL,
    watch_duration integer DEFAULT 0, -- Seconds watched
    completed boolean DEFAULT false -- If user watched most of it
);

-- Create indexes for efficient querying
CREATE INDEX idx_anime_views_anime_id ON public.anime_views(anime_id);
CREATE INDEX idx_anime_views_episode_id ON public.anime_views(episode_id);
CREATE INDEX idx_anime_views_viewed_at ON public.anime_views(viewed_at);
CREATE INDEX idx_anime_views_user_id ON public.anime_views(user_id);

-- Aggregate view counts table for faster queries
CREATE TABLE IF NOT EXISTS public.anime_view_counts (
    anime_id text PRIMARY KEY,
    total_views integer DEFAULT 0,
    views_today integer DEFAULT 0,
    views_week integer DEFAULT 0,
    views_month integer DEFAULT 0,
    unique_viewers integer DEFAULT 0,
    last_updated timestamp with time zone DEFAULT now()
);

-- Create index for trending queries
CREATE INDEX idx_anime_view_counts_views_week ON public.anime_view_counts(views_week DESC);
CREATE INDEX idx_anime_view_counts_views_today ON public.anime_view_counts(views_today DESC);

-- Function to increment view count
CREATE OR REPLACE FUNCTION public.record_anime_view(
    p_anime_id text,
    p_episode_id text,
    p_user_id uuid DEFAULT NULL,
    p_session_id text DEFAULT NULL,
    p_watch_duration integer DEFAULT 0
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_ip_hash text;
    v_recent_view_count integer;
BEGIN
    -- Rate limit: max 1 view per episode per user/session per hour
    SELECT COUNT(*) INTO v_recent_view_count
    FROM public.anime_views
    WHERE episode_id = p_episode_id
    AND (
        (p_user_id IS NOT NULL AND user_id = p_user_id)
        OR (p_session_id IS NOT NULL AND session_id = p_session_id)
    )
    AND viewed_at > now() - interval '1 hour';
    
    IF v_recent_view_count > 0 THEN
        -- Just update watch duration for existing view
        UPDATE public.anime_views
        SET watch_duration = GREATEST(watch_duration, p_watch_duration),
            completed = (p_watch_duration > 600) -- Mark complete if watched > 10 min
        WHERE episode_id = p_episode_id
        AND (
            (p_user_id IS NOT NULL AND user_id = p_user_id)
            OR (p_session_id IS NOT NULL AND session_id = p_session_id)
        )
        AND viewed_at > now() - interval '1 hour';
        RETURN;
    END IF;
    
    -- Insert new view
    INSERT INTO public.anime_views (anime_id, episode_id, user_id, session_id, watch_duration)
    VALUES (p_anime_id, p_episode_id, p_user_id, p_session_id, p_watch_duration);
    
    -- Update aggregate counts
    INSERT INTO public.anime_view_counts (anime_id, total_views, views_today, views_week, views_month, unique_viewers)
    VALUES (p_anime_id, 1, 1, 1, 1, 1)
    ON CONFLICT (anime_id) DO UPDATE SET
        total_views = anime_view_counts.total_views + 1,
        views_today = anime_view_counts.views_today + 1,
        views_week = anime_view_counts.views_week + 1,
        views_month = anime_view_counts.views_month + 1,
        last_updated = now();
END;
$$;

-- Function to get view count for an anime
CREATE OR REPLACE FUNCTION public.get_anime_view_count(p_anime_id text)
RETURNS integer
LANGUAGE sql STABLE
AS $$
    SELECT COALESCE(total_views, 0) FROM public.anime_view_counts WHERE anime_id = p_anime_id;
$$;

-- Function to get trending anime (by weekly views)
CREATE OR REPLACE FUNCTION public.get_trending_anime(p_limit integer DEFAULT 20)
RETURNS TABLE(anime_id text, views_week integer, views_today integer, total_views integer)
LANGUAGE sql STABLE
AS $$
    SELECT anime_id, views_week, views_today, total_views
    FROM public.anime_view_counts
    ORDER BY views_week DESC, views_today DESC
    LIMIT p_limit;
$$;

-- Scheduled function to reset daily/weekly/monthly counts (run via cron)
CREATE OR REPLACE FUNCTION public.reset_view_counts()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    -- Reset daily counts
    UPDATE public.anime_view_counts SET views_today = 0;
    
    -- Reset weekly counts every Sunday
    IF EXTRACT(DOW FROM now()) = 0 THEN
        UPDATE public.anime_view_counts SET views_week = 0;
    END IF;
    
    -- Reset monthly counts on 1st of month
    IF EXTRACT(DAY FROM now()) = 1 THEN
        UPDATE public.anime_view_counts SET views_month = 0;
    END IF;
END;
$$;

-- RLS Policies
ALTER TABLE public.anime_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anime_view_counts ENABLE ROW LEVEL SECURITY;

-- Anyone can read view counts
CREATE POLICY "Anyone can read view counts" ON public.anime_view_counts
    FOR SELECT USING (true);

-- Views are insert-only for authenticated or anonymous users (via function)
CREATE POLICY "Insert views via function" ON public.anime_views
    FOR INSERT WITH CHECK (true);

-- Users can see their own views
CREATE POLICY "Users can see their own views" ON public.anime_views
    FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
