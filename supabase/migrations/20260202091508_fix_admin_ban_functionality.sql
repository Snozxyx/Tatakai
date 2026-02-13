-- Fix admin ban functionality
-- This migration fixes issues with the ban_user and unban_user functions

-- Drop and recreate ban_user function with correct logic
DROP FUNCTION IF EXISTS ban_user(uuid, text, integer);
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

-- Drop and recreate unban_user function with correct logic
DROP FUNCTION IF EXISTS unban_user(uuid);
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

-- Update RLS policy for ban history to work with profile IDs
DROP POLICY IF EXISTS "Users can view own ban history" ON ban_history;
CREATE POLICY "Users can view own ban history"
  ON ban_history FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Fix broadcast messages RLS policy for creation
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
