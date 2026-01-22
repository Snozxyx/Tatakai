-- Table to store user push notification tokens
CREATE TABLE IF NOT EXISTS user_notification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    token TEXT UNIQUE NOT NULL,
    platform TEXT,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_notification_tokens ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their own tokens" ON user_notification_tokens
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all tokens" ON user_notification_tokens
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.is_admin = true
        )
    );

-- Index for lookup
CREATE INDEX IF NOT EXISTS idx_user_notification_tokens_user_id ON user_notification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notification_tokens_token ON user_notification_tokens(token);
