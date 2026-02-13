-- Enable email verification for new users
-- This must be configured in Supabase Dashboard:
-- Authentication > Settings > Email Auth > Enable Email Confirmations

-- Add moderator and broadcast permissions
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_moderator boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS can_broadcast boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS banned_at timestamptz,
ADD COLUMN IF NOT EXISTS ban_reason text;

-- Add banned_by column if it doesn't exist (it should already exist in the schema)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS banned_by uuid;

-- The banned_by column should reference auth.users(id) to match existing schema
-- No need to modify the existing foreign key constraint

-- Create broadcast messages table
CREATE TABLE IF NOT EXISTS broadcast_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success')),
  is_active boolean DEFAULT true,
  expires_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES profiles(id)
);

-- Create ban history table
CREATE TABLE IF NOT EXISTS ban_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  banned_by uuid REFERENCES profiles(id) NOT NULL,
  reason text NOT NULL,
  duration_hours integer, -- null = permanent
  expires_at timestamptz,
  unbanned_at timestamptz,
  unbanned_by uuid REFERENCES profiles(id)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_active ON broadcast_messages(is_active, expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ban_history_user ON ban_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_banned ON profiles(banned_at) WHERE banned_at IS NOT NULL;

-- RLS Policies

-- Broadcast messages: Everyone can read active messages
ALTER TABLE broadcast_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active broadcasts" ON broadcast_messages;
CREATE POLICY "Public can view active broadcasts"
  ON broadcast_messages FOR SELECT
  USING (
    is_active = true 
    AND deleted_at IS NULL 
    AND (expires_at IS NULL OR expires_at > now())
  );

DROP POLICY IF EXISTS "Moderators can create broadcasts" ON broadcast_messages;
CREATE POLICY "Moderators can create broadcasts"
  ON broadcast_messages FOR INSERT
  WITH CHECK (
    created_by IN (
      SELECT id FROM profiles 
      WHERE user_id = auth.uid() 
      AND (is_moderator = true OR can_broadcast = true)
    )
  );

DROP POLICY IF EXISTS "Admins can delete broadcasts" ON broadcast_messages;
CREate POLICY "Admins can delete broadcasts"
  ON broadcast_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.user_id = auth.uid() 
      AND profiles.is_admin = true
    )
  );

-- Ban history: Users can view their own, moderators can view all
ALTER TABLE ban_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ban history" ON ban_history;
CREATE POLICY "Users can view own ban history"
  ON ban_history FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Moderators can view all bans" ON ban_history;
CREATE POLICY "Moderators can view all bans"
  ON ban_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.user_id = auth.uid() 
      AND (profiles.is_moderator = true OR profiles.is_admin = true)
    )
  );

DROP POLICY IF EXISTS "Moderators can ban users" ON ban_history;
CREATE POLICY "Moderators can ban users"
  ON ban_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.user_id = auth.uid() 
      AND (profiles.is_moderator = true OR profiles.is_admin = true)
    )
  );

DROP POLICY IF EXISTS "Moderators can unban users" ON ban_history;
CREATE POLICY "Moderators can unban users"
  ON ban_history FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.user_id = auth.uid() 
      AND (profiles.is_moderator = true OR profiles.is_admin = true)
    )
  );

-- Function to ban a user
CREATE OR REPLACE FUNCTION ban_user(
  target_user_id uuid,
  reason text,
  duration_hours integer DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  expires timestamp;
  caller_profile_id uuid;
  target_profile_id uuid;
BEGIN
  -- Get caller's profile ID
  SELECT id INTO caller_profile_id 
  FROM profiles 
  WHERE user_id = auth.uid();

  IF caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  -- Check if caller is moderator or admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND (role = 'admin' OR role = 'moderator' OR is_moderator = true OR is_admin = true)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only moderators can ban users';
  END IF;

  -- Get target user's profile ID
  SELECT id INTO target_profile_id 
  FROM profiles 
  WHERE user_id = target_user_id;

  IF target_profile_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- Calculate expiration
  IF duration_hours IS NOT NULL THEN
    expires := now() + (duration_hours || ' hours')::interval;
  END IF;

  -- Update profile - use auth.uid() for banned_by to match existing schema
  UPDATE profiles 
  SET 
    is_banned = true,
    banned_at = now(),
    banned_by = auth.uid(),
    ban_reason = reason
  WHERE user_id = target_user_id;

  -- Create ban history record - use profile IDs for ban_history table
  INSERT INTO ban_history (user_id, banned_by, reason, duration_hours, expires_at)
  VALUES (target_profile_id, caller_profile_id, reason, duration_hours, expires);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unban a user
CREATE OR REPLACE FUNCTION unban_user(target_user_id uuid)
RETURNS void AS $$
DECLARE
  caller_profile_id uuid;
  target_profile_id uuid;
BEGIN
  -- Get caller's profile ID
  SELECT id INTO caller_profile_id 
  FROM profiles 
  WHERE user_id = auth.uid();

  IF caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  -- Check if caller is moderator or admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND (role = 'admin' OR role = 'moderator' OR is_moderator = true OR is_admin = true)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only moderators can unban users';
  END IF;

  -- Get target user's profile ID
  SELECT id INTO target_profile_id 
  FROM profiles 
  WHERE user_id = target_user_id;

  IF target_profile_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- Update profile
  UPDATE profiles 
  SET 
    is_banned = false,
    banned_at = NULL,
    banned_by = NULL,
    ban_reason = NULL
  WHERE user_id = target_user_id;

  -- Update ban history - use profile IDs
  UPDATE ban_history
  SET 
    unbanned_at = now(),
    unbanned_by = caller_profile_id
  WHERE user_id = target_profile_id 
    AND unbanned_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to delete broadcast (admin only)
CREATE OR REPLACE FUNCTION delete_broadcast(broadcast_id uuid)
RETURNS void AS $$
DECLARE
  caller_profile_id uuid;
BEGIN
  -- Get caller's profile ID
  SELECT id INTO caller_profile_id 
  FROM profiles 
  WHERE user_id = auth.uid();

  IF caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND (role = 'admin' OR is_admin = true)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can delete broadcasts';
  END IF;

  -- Soft delete broadcast - use profile ID
  UPDATE broadcast_messages
  SET 
    deleted_at = now(),
    deleted_by = caller_profile_id,
    is_active = false
  WHERE id = broadcast_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-expire bans function (run via cron or trigger)
CREATE OR REPLACE FUNCTION expire_bans()
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET 
    is_banned = false,
    banned_at = NULL,
    banned_by = NULL,
    ban_reason = NULL
  WHERE banned_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM ban_history
      WHERE ban_history.user_id = profiles.id
        AND ban_history.expires_at IS NOT NULL
        AND ban_history.expires_at < now()
        AND ban_history.unbanned_at IS NULL
    );
END;
$$ LANGUAGE plpgsql;
