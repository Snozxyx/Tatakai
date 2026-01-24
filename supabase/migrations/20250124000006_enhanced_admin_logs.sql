-- Update admin_logs table with enhanced fields
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_logs') THEN
    -- Add new columns to existing admin_logs table
    ALTER TABLE admin_logs 
      ADD COLUMN IF NOT EXISTS action_category TEXT CHECK (action_category IN ('user', 'content', 'system', 'notification', 'settings')),
      ADD COLUMN IF NOT EXISTS action_type TEXT CHECK (action_type IN ('create', 'update', 'delete', 'ban', 'unban')),
      ADD COLUMN IF NOT EXISTS affected_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS affected_resource_type TEXT CHECK (affected_resource_type IN ('user', 'post', 'comment', 'stream')),
      ADD COLUMN IF NOT EXISTS affected_resource_id UUID,
      ADD COLUMN IF NOT EXISTS changes JSONB,
      ADD COLUMN IF NOT EXISTS ip_address INET,
      ADD COLUMN IF NOT EXISTS user_agent TEXT;
  ELSE
    -- Create admin_logs table if it doesn't exist
    CREATE TABLE admin_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      action_category TEXT NOT NULL CHECK (action_category IN ('user', 'content', 'system', 'notification', 'settings')),
      action_type TEXT NOT NULL CHECK (action_type IN ('create', 'update', 'delete', 'ban', 'unban')),
      description TEXT,
      affected_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      affected_resource_type TEXT CHECK (affected_resource_type IN ('user', 'post', 'comment', 'stream')),
      affected_resource_id UUID,
      changes JSONB,
      ip_address INET,
      user_agent TEXT,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    
    -- Create indexes
    CREATE INDEX idx_admin_logs_admin_id ON admin_logs(admin_id);
    CREATE INDEX idx_admin_logs_timestamp ON admin_logs(timestamp);
    CREATE INDEX idx_admin_logs_affected_user_id ON admin_logs(affected_user_id);
    CREATE INDEX idx_admin_logs_action_category ON admin_logs(action_category);
    
    -- Enable Row Level Security
    ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
    
    -- Create RLS policies
    CREATE POLICY "Admins can view all logs"
      ON admin_logs 
      FOR SELECT 
      USING (true);
    
    CREATE POLICY "Admins can create logs"
      ON admin_logs 
      FOR INSERT 
      WITH CHECK (auth.uid() = admin_id);
    
    CREATE POLICY "Admins can update their own logs"
      ON admin_logs 
      FOR UPDATE 
      USING (auth.uid() = admin_id);
    
    CREATE POLICY "Admins can delete their own logs"
      ON admin_logs 
      FOR DELETE 
      USING (auth.uid() = admin_id);
  END IF;
END $$;