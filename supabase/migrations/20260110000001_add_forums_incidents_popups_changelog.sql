-- Tatakai Platform Feature Migration
-- Adds Forums, Status Page Incidents, Popups/Banners, and Admin Changelog

-- ============================================
-- 1. FORUMS SYSTEM (Reddit-style)
-- ============================================

-- Forum posts table
CREATE TABLE IF NOT EXISTS public.forum_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL,
    content text NOT NULL,
    content_type text DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'link', 'poll')),
    -- References to anime content (optional)
    anime_id text,
    anime_name text,
    anime_poster text,
    playlist_id uuid REFERENCES public.playlists(id) ON DELETE SET NULL,
    tierlist_id uuid REFERENCES public.tier_lists(id) ON DELETE SET NULL,
    character_id text,
    character_name text,
    -- Forum metadata
    flair text,
    is_pinned boolean DEFAULT false,
    is_locked boolean DEFAULT false,
    is_spoiler boolean DEFAULT false,
    is_nsfw boolean DEFAULT false,
    -- Stats
    upvotes integer DEFAULT 0,
    downvotes integer DEFAULT 0,
    comments_count integer DEFAULT 0,
    views_count integer DEFAULT 0,
    -- Timestamps
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Forum comments table  
CREATE TABLE IF NOT EXISTS public.forum_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    post_id uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_id uuid REFERENCES public.forum_comments(id) ON DELETE CASCADE,
    content text NOT NULL,
    is_spoiler boolean DEFAULT false,
    -- Stats
    upvotes integer DEFAULT 0,
    downvotes integer DEFAULT 0,
    -- Timestamps
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Forum votes table (for posts and comments)
CREATE TABLE IF NOT EXISTS public.forum_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id uuid REFERENCES public.forum_posts(id) ON DELETE CASCADE,
    comment_id uuid REFERENCES public.forum_comments(id) ON DELETE CASCADE,
    vote_type smallint NOT NULL CHECK (vote_type IN (-1, 1)), -- -1 = downvote, 1 = upvote
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vote_target_check CHECK (
        (post_id IS NOT NULL AND comment_id IS NULL) OR 
        (post_id IS NULL AND comment_id IS NOT NULL)
    ),
    UNIQUE(user_id, post_id),
    UNIQUE(user_id, comment_id)
);

-- ============================================
-- 2. STATUS PAGE INCIDENTS
-- ============================================

CREATE TABLE IF NOT EXISTS public.status_incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    title text NOT NULL,
    description text NOT NULL,
    status text NOT NULL CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
    severity text NOT NULL CHECK (severity IN ('minor', 'major', 'critical')),
    affected_services text[] DEFAULT '{}',
    is_active boolean DEFAULT true,
    created_by uuid NOT NULL REFERENCES auth.users(id),
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Incident updates
CREATE TABLE IF NOT EXISTS public.status_incident_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    incident_id uuid NOT NULL REFERENCES public.status_incidents(id) ON DELETE CASCADE,
    message text NOT NULL,
    status text NOT NULL CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
    created_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ============================================
-- 3. POPUP/BANNER BUILDER
-- ============================================

CREATE TABLE IF NOT EXISTS public.popups (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    title text NOT NULL,
    content text,
    popup_type text NOT NULL CHECK (popup_type IN ('banner', 'modal', 'toast', 'fullscreen')),
    -- Display settings
    background_color text DEFAULT '#1B1919',
    text_color text DEFAULT '#FFFFFF',
    accent_color text DEFAULT '#FF1493',
    image_url text,
    -- Action settings
    action_text text,
    action_url text,
    dismiss_text text DEFAULT 'Dismiss',
    -- Targeting
    target_pages text[] DEFAULT '{}', -- Empty means all pages
    target_user_type text DEFAULT 'all' CHECK (target_user_type IN ('all', 'guests', 'logged_in', 'premium')),
    show_on_mobile boolean DEFAULT true,
    show_on_desktop boolean DEFAULT true,
    -- Scheduling
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    -- Display frequency
    frequency text DEFAULT 'once' CHECK (frequency IN ('once', 'always', 'daily', 'weekly')),
    priority integer DEFAULT 1,
    is_active boolean DEFAULT true,
    -- Metadata
    created_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Track popup dismissals
CREATE TABLE IF NOT EXISTS public.popup_dismissals (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    popup_id uuid NOT NULL REFERENCES public.popups(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id text,
    dismissed_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(popup_id, user_id),
    UNIQUE(popup_id, session_id)
);

-- ============================================
-- 4. ADMIN CHANGELOG
-- ============================================

CREATE TABLE IF NOT EXISTS public.changelog (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    version text NOT NULL,
    release_date date NOT NULL DEFAULT CURRENT_DATE,
    title text,
    changes jsonb NOT NULL DEFAULT '[]', -- Array of change descriptions
    is_published boolean DEFAULT false,
    is_latest boolean DEFAULT false,
    created_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ============================================
-- 5. MOBILE APP ANALYTICS
-- ============================================

CREATE TABLE IF NOT EXISTS public.mobile_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    device_id text NOT NULL,
    platform text NOT NULL CHECK (platform IN ('android', 'ios')),
    app_version text NOT NULL,
    device_model text,
    os_version text,
    -- Event data
    event_type text NOT NULL,
    event_data jsonb DEFAULT '{}',
    screen_name text,
    -- Session info
    session_id text NOT NULL,
    -- Timestamps
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ============================================
-- 6. INDEXES
-- ============================================

-- Forum indexes
CREATE INDEX IF NOT EXISTS idx_forum_posts_user ON public.forum_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_anime ON public.forum_posts(anime_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_created ON public.forum_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_pinned ON public.forum_posts(is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_comments_post ON public.forum_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_forum_comments_user ON public.forum_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_comments_parent ON public.forum_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_forum_votes_user ON public.forum_votes(user_id);

-- Status page indexes
CREATE INDEX IF NOT EXISTS idx_status_incidents_active ON public.status_incidents(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_incident_updates_incident ON public.status_incident_updates(incident_id);

-- Popup indexes
CREATE INDEX IF NOT EXISTS idx_popups_active ON public.popups(is_active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_popup_dismissals_popup ON public.popup_dismissals(popup_id);
CREATE INDEX IF NOT EXISTS idx_popup_dismissals_user ON public.popup_dismissals(user_id);

-- Changelog indexes
CREATE INDEX IF NOT EXISTS idx_changelog_published ON public.changelog(is_published, release_date DESC);

-- Mobile analytics indexes
CREATE INDEX IF NOT EXISTS idx_mobile_analytics_device ON public.mobile_analytics(device_id);
CREATE INDEX IF NOT EXISTS idx_mobile_analytics_event ON public.mobile_analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_mobile_analytics_created ON public.mobile_analytics(created_at);

-- ============================================
-- 7. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_incident_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popup_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.changelog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_analytics ENABLE ROW LEVEL SECURITY;

-- Forum posts policies
CREATE POLICY "Anyone can view forum posts" ON public.forum_posts FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create posts" ON public.forum_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own posts" ON public.forum_posts FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can delete own posts" ON public.forum_posts FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Forum comments policies
CREATE POLICY "Anyone can view comments" ON public.forum_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment" ON public.forum_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own comments" ON public.forum_comments FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can delete own comments" ON public.forum_comments FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Forum votes policies
CREATE POLICY "Authenticated users can vote" ON public.forum_votes FOR ALL TO authenticated USING (user_id = auth.uid());

-- Status incidents policies (public read, admin write)
CREATE POLICY "Anyone can view incidents" ON public.status_incidents FOR SELECT USING (true);
CREATE POLICY "Admins can manage incidents" ON public.status_incidents FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view incident updates" ON public.status_incident_updates FOR SELECT USING (true);
CREATE POLICY "Admins can manage incident updates" ON public.status_incident_updates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Popup policies
CREATE POLICY "Anyone can view active popups" ON public.popups FOR SELECT USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage popups" ON public.popups FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can insert popup dismissals" ON public.popup_dismissals FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view own dismissals" ON public.popup_dismissals FOR SELECT USING (user_id = auth.uid() OR session_id IS NOT NULL);

-- Changelog policies
CREATE POLICY "Anyone can view published changelog" ON public.changelog FOR SELECT USING (is_published = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage changelog" ON public.changelog FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Mobile analytics policies
CREATE POLICY "Anyone can insert mobile analytics" ON public.mobile_analytics FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view mobile analytics" ON public.mobile_analytics FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- 8. FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update forum post vote counts
CREATE OR REPLACE FUNCTION public.update_forum_post_votes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.post_id IS NOT NULL THEN
        IF NEW.vote_type = 1 THEN
            UPDATE public.forum_posts SET upvotes = upvotes + 1 WHERE id = NEW.post_id;
        ELSE
            UPDATE public.forum_posts SET downvotes = downvotes + 1 WHERE id = NEW.post_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' AND OLD.post_id IS NOT NULL THEN
        IF OLD.vote_type = 1 THEN
            UPDATE public.forum_posts SET upvotes = upvotes - 1 WHERE id = OLD.post_id;
        ELSE
            UPDATE public.forum_posts SET downvotes = downvotes - 1 WHERE id = OLD.post_id;
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' AND NEW.post_id IS NOT NULL THEN
        IF OLD.vote_type = 1 THEN
            UPDATE public.forum_posts SET upvotes = upvotes - 1 WHERE id = NEW.post_id;
        ELSE
            UPDATE public.forum_posts SET downvotes = downvotes - 1 WHERE id = NEW.post_id;
        END IF;
        IF NEW.vote_type = 1 THEN
            UPDATE public.forum_posts SET upvotes = upvotes + 1 WHERE id = NEW.post_id;
        ELSE
            UPDATE public.forum_posts SET downvotes = downvotes + 1 WHERE id = NEW.post_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_forum_post_votes ON public.forum_votes;
CREATE TRIGGER trigger_forum_post_votes
    AFTER INSERT OR UPDATE OR DELETE ON public.forum_votes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_forum_post_votes();

-- Function to update forum comment vote counts
CREATE OR REPLACE FUNCTION public.update_forum_comment_votes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.comment_id IS NOT NULL THEN
        IF NEW.vote_type = 1 THEN
            UPDATE public.forum_comments SET upvotes = upvotes + 1 WHERE id = NEW.comment_id;
        ELSE
            UPDATE public.forum_comments SET downvotes = downvotes + 1 WHERE id = NEW.comment_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' AND OLD.comment_id IS NOT NULL THEN
        IF OLD.vote_type = 1 THEN
            UPDATE public.forum_comments SET upvotes = upvotes - 1 WHERE id = OLD.comment_id;
        ELSE
            UPDATE public.forum_comments SET downvotes = downvotes - 1 WHERE id = OLD.comment_id;
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' AND NEW.comment_id IS NOT NULL THEN
        IF OLD.vote_type = 1 THEN
            UPDATE public.forum_comments SET upvotes = upvotes - 1 WHERE id = NEW.comment_id;
        ELSE
            UPDATE public.forum_comments SET downvotes = downvotes - 1 WHERE id = NEW.comment_id;
        END IF;
        IF NEW.vote_type = 1 THEN
            UPDATE public.forum_comments SET upvotes = upvotes + 1 WHERE id = NEW.comment_id;
        ELSE
            UPDATE public.forum_comments SET downvotes = downvotes + 1 WHERE id = NEW.comment_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_forum_comment_votes ON public.forum_votes;
CREATE TRIGGER trigger_forum_comment_votes
    AFTER INSERT OR UPDATE OR DELETE ON public.forum_votes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_forum_comment_votes();

-- Function to update post comment count
CREATE OR REPLACE FUNCTION public.update_forum_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.forum_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.forum_posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_forum_comment_count ON public.forum_comments;
CREATE TRIGGER trigger_forum_comment_count
    AFTER INSERT OR DELETE ON public.forum_comments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_forum_comment_count();

-- Increment forum post views function
CREATE OR REPLACE FUNCTION public.increment_forum_post_views(post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.forum_posts SET views_count = views_count + 1 WHERE id = post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_forum_post_views(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_forum_post_views(uuid) TO anon;

-- Function to ensure only one latest changelog
CREATE OR REPLACE FUNCTION public.ensure_single_latest_changelog()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.is_latest = true THEN
        UPDATE public.changelog SET is_latest = false WHERE id != NEW.id AND is_latest = true;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_single_latest_changelog ON public.changelog;
CREATE TRIGGER trigger_single_latest_changelog
    BEFORE INSERT OR UPDATE OF is_latest ON public.changelog
    FOR EACH ROW
    WHEN (NEW.is_latest = true)
    EXECUTE FUNCTION public.ensure_single_latest_changelog();
