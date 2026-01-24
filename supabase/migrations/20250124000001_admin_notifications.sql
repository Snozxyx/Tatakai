-- Create admin_notifications table
CREATE TABLE admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('system', 'warning', 'error', 'info')),
  priority INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 5),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX idx_admin_notifications_created_at ON admin_notifications(created_at);
CREATE INDEX idx_admin_notifications_admin_id ON admin_notifications(admin_id);
CREATE INDEX idx_admin_notifications_is_read ON admin_notifications(is_read);

-- Enable Row Level Security
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for admin access
CREATE POLICY "Admins can view their own notifications"
  ON admin_notifications 
  FOR SELECT 
  USING (auth.uid() = admin_id);

CREATE POLICY "Admins can create their own notifications"
  ON admin_notifications 
  FOR INSERT 
  WITH CHECK (auth.uid() = admin_id);

CREATE POLICY "Admins can update their own notifications"
  ON admin_notifications 
  FOR UPDATE 
  USING (auth.uid() = admin_id)
  WITH CHECK (auth.uid() = admin_id);

CREATE POLICY "Admins can delete their own notifications"
  ON admin_notifications 
  FOR DELETE 
  USING (auth.uid() = admin_id);

-- Create a trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_admin_notification_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_admin_notification_timestamp_trigger
  BEFORE UPDATE ON admin_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_admin_notification_timestamp();