-- Add analytics columns to user_analytics table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_analytics') THEN
    -- Add new columns for enhanced analytics
    ALTER TABLE user_analytics 
      ADD COLUMN IF NOT EXISTS referrer_source TEXT CHECK (referrer_source IN ('direct', 'google', 'social', 'external', 'qr', 'app')),
      ADD COLUMN IF NOT EXISTS utm_source TEXT,
      ADD COLUMN IF NOT EXISTS utm_medium TEXT,
      ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
      ADD COLUMN IF NOT EXISTS country TEXT,
      ADD COLUMN IF NOT EXISTS city TEXT,
      ADD COLUMN IF NOT EXISTS device_type TEXT CHECK (device_type IN ('mobile', 'desktop', 'tablet', 'smart-tv')),
      ADD COLUMN IF NOT EXISTS browser TEXT,
      ADD COLUMN IF NOT EXISTS os TEXT,
      ADD COLUMN IF NOT EXISTS screen_size TEXT;
  ELSE
    -- Create analytics_events table if user_analytics doesn't exist
    CREATE TABLE analytics_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      referrer_source TEXT CHECK (referrer_source IN ('direct', 'google', 'social', 'external', 'qr', 'app')),
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      country TEXT,
      city TEXT,
      device_type TEXT CHECK (device_type IN ('mobile', 'desktop', 'tablet', 'smart-tv')),
      browser TEXT,
      os TEXT,
      screen_size TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    
    CREATE INDEX idx_analytics_events_user_id ON analytics_events(user_id);
    CREATE INDEX idx_analytics_events_created_at ON analytics_events(created_at);
    CREATE INDEX idx_analytics_events_event_type ON analytics_events(event_type);
  END IF;
END $$;