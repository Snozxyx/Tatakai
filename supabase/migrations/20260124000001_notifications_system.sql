-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT CHECK(type IN ('info', 'warning', 'error', 'success', 'announcement')),
    priority INT DEFAULT 0,
    read BOOLEAN DEFAULT FALSE,
    data JSONB DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Global popups (admin-created announcements)
CREATE TABLE IF NOT EXISTS global_popups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    popup_type TEXT CHECK(popup_type IN ('info', 'warning', 'alert', 'promotion', 'maintenance')),
    image_url TEXT,
    action_url TEXT,
    action_label TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    show_for_guests BOOLEAN DEFAULT TRUE,
    show_for_logged_in BOOLEAN DEFAULT TRUE,
    priority INT DEFAULT 0,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE,
    display_frequency TEXT CHECK(display_frequency IN ('once', 'daily', 'session', 'always')) DEFAULT 'once',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track popup displays per user
CREATE TABLE IF NOT EXISTS popup_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    popup_id UUID REFERENCES global_popups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT,
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cached recommendations table
CREATE TABLE IF NOT EXISTS cached_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    recommendations JSONB NOT NULL,
    taste_profile JSONB,
    cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
);

-- Admin analytics table
CREATE TABLE IF NOT EXISTS admin_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_type TEXT NOT NULL,
    metric_value NUMERIC,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User engagement table
CREATE TABLE IF NOT EXISTS user_engagement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    total_watch_time INT DEFAULT 0,
    total_episodes_watched INT DEFAULT 0,
    unique_anime_watched INT DEFAULT 0,
    favorite_count INT DEFAULT 0,
    playlist_count INT DEFAULT 0,
    forum_posts_count INT DEFAULT 0,
    last_active_at TIMESTAMP WITH TIME ZONE,
    engagement_score NUMERIC DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin action logs table
CREATE TABLE IF NOT EXISTS admin_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES auth.users(id),
    action_type TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    status TEXT CHECK(status IN ('success', 'failure')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_popups ENABLE ROW LEVEL SECURITY;
ALTER TABLE popup_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE cached_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_action_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notifications
CREATE POLICY "Users see own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins create notifications" ON notifications FOR INSERT WITH CHECK (
    EXISTS(SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_admin = TRUE)
);

-- RLS Policies for global popups
CREATE POLICY "Admins manage popups" ON global_popups FOR ALL USING (
    EXISTS(SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_admin = TRUE)
);
CREATE POLICY "Users view active popups" ON global_popups FOR SELECT USING (
    is_active AND 
    (NOW() >= start_date AND (end_date IS NULL OR NOW() <= end_date)) AND
    (
        (show_for_guests AND auth.uid() IS NULL) OR
        (show_for_logged_in AND auth.uid() IS NOT NULL)
    )
);

-- RLS Policies for popup views
CREATE POLICY "Users track popup views" ON popup_views FOR INSERT WITH CHECK (
    auth.uid() = user_id OR user_id IS NULL
);
CREATE POLICY "Users view own popup views" ON popup_views FOR SELECT USING (
    auth.uid() = user_id OR user_id IS NULL
);

-- RLS Policies for cached recommendations
CREATE POLICY "Users see own recommendations" ON cached_recommendations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage own recommendations" ON cached_recommendations FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for admin analytics
CREATE POLICY "Admins view analytics" ON admin_analytics FOR SELECT USING (
    EXISTS(SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_admin = TRUE)
);

-- RLS Policies for user engagement
CREATE POLICY "Users view own engagement" ON user_engagement FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all engagement" ON user_engagement FOR SELECT USING (
    EXISTS(SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_admin = TRUE)
);

-- RLS Policies for admin action logs
CREATE POLICY "Admins view action logs" ON admin_action_logs FOR SELECT USING (
    EXISTS(SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_admin = TRUE)
);
CREATE POLICY "System logs admin actions" ON admin_action_logs FOR INSERT WITH CHECK (true);

-- Indexes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_global_popups_active ON global_popups(is_active);
CREATE INDEX idx_global_popups_dates ON global_popups(start_date, end_date);
CREATE INDEX idx_popup_views_popup_id ON popup_views(popup_id);
CREATE INDEX idx_popup_views_user_id ON popup_views(user_id);
CREATE INDEX idx_cached_recommendations_user_id ON cached_recommendations(user_id);
CREATE INDEX idx_cached_recommendations_expires_at ON cached_recommendations(expires_at);
CREATE INDEX idx_admin_action_logs_admin_id ON admin_action_logs(admin_id);
CREATE INDEX idx_admin_action_logs_created_at ON admin_action_logs(created_at);
CREATE INDEX idx_user_engagement_user_id ON user_engagement(user_id);
CREATE INDEX idx_admin_analytics_created_at ON admin_analytics(created_at);