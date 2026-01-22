-- Add admin status if it doesn't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Add ban status and timestamps to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS banned_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS ban_reason TEXT;

-- Make gabhastigirisinha@gmail.com an admin
UPDATE public.profiles 
SET is_admin = true 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'gabhastigirisinha@gmail.com'
);

-- Create maintenance mode table
CREATE TABLE IF NOT EXISTS public.maintenance_mode (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  message TEXT NOT NULL,
  enabled_at TIMESTAMPTZ,
  enabled_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default maintenance row if table is empty
INSERT INTO public.maintenance_mode (is_active, message)
SELECT FALSE, 'We are currently performing maintenance. Please check back soon!'
WHERE NOT EXISTS (SELECT 1 FROM public.maintenance_mode);

-- Create admin messages table for broadcasting or individual messages
CREATE TABLE IF NOT EXISTS public.admin_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('broadcast', 'individual')),
  recipient_id UUID REFERENCES auth.users(id), -- NULL for broadcast
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  is_read BOOLEAN DEFAULT FALSE,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_messages_recipient ON public.admin_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_created_at ON public.admin_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_messages_type ON public.admin_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_profiles_banned ON public.profiles(is_banned);
CREATE INDEX IF NOT EXISTS idx_profiles_admin ON public.profiles(is_admin);

-- Enable RLS
ALTER TABLE public.maintenance_mode ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

-- Maintenance mode policies (everyone can read, only admins can modify)
DROP POLICY IF EXISTS "Anyone can view maintenance status" ON public.maintenance_mode;
CREATE POLICY "Anyone can view maintenance status"
ON public.maintenance_mode
FOR SELECT
TO PUBLIC
USING (true);

DROP POLICY IF EXISTS "Only admins can update maintenance mode" ON public.maintenance_mode;
CREATE POLICY "Only admins can update maintenance mode"
ON public.maintenance_mode
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.is_admin = true
  )
);

-- Admin messages policies
DROP POLICY IF EXISTS "Users can view their own messages and broadcasts" ON public.admin_messages;
CREATE POLICY "Users can view their own messages and broadcasts"
ON public.admin_messages
FOR SELECT
TO authenticated
USING (
  message_type = 'broadcast' 
  OR recipient_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.is_admin = true
  )
);

DROP POLICY IF EXISTS "Only admins can create messages" ON public.admin_messages;
CREATE POLICY "Only admins can create messages"
ON public.admin_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.is_admin = true
  )
);

DROP POLICY IF EXISTS "Users can update read status of their messages" ON public.admin_messages;
CREATE POLICY "Users can update read status of their messages"
ON public.admin_messages
FOR UPDATE
TO authenticated
USING (recipient_id = auth.uid() OR message_type = 'broadcast')
WITH CHECK (recipient_id = auth.uid() OR message_type = 'broadcast');

DROP POLICY IF EXISTS "Admins can delete messages" ON public.admin_messages;
CREATE POLICY "Admins can delete messages"
ON public.admin_messages
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.is_admin = true
  )
);

-- Function to check if user is banned
CREATE OR REPLACE FUNCTION public.check_user_banned()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND is_banned = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.check_user_banned() TO authenticated;

-- Comments for documentation
COMMENT ON COLUMN public.profiles.is_admin IS 'Whether the user has admin privileges';
COMMENT ON COLUMN public.profiles.is_banned IS 'Whether the user is banned from the platform';
COMMENT ON COLUMN public.profiles.banned_at IS 'Timestamp when user was banned';
COMMENT ON COLUMN public.profiles.banned_by IS 'Admin who banned the user';
COMMENT ON COLUMN public.profiles.ban_reason IS 'Reason for banning the user';
COMMENT ON TABLE public.maintenance_mode IS 'System-wide maintenance mode status';
COMMENT ON TABLE public.admin_messages IS 'Messages from admins to users (broadcast or individual)';

-- Allow admins to update any profile (for banning, making admin, etc.)
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles AS admin_profile
    WHERE admin_profile.user_id = auth.uid()
    AND admin_profile.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles AS admin_profile
    WHERE admin_profile.user_id = auth.uid()
    AND admin_profile.is_admin = true
  )
);
