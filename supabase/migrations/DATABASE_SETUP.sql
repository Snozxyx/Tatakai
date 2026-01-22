-- =====================================================
-- Database Setup for Forum Images and Admin Features
-- =====================================================

-- 1. Create admin_logs table
CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add columns to forum_posts
ALTER TABLE forum_posts 
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT true;

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_logs_user_id ON admin_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);
CREATE INDEX IF NOT EXISTS idx_forum_posts_is_approved ON forum_posts(is_approved);
CREATE INDEX IF NOT EXISTS idx_forum_posts_user_id ON forum_posts(user_id);

-- 4. Create popups table (if not exists)
CREATE TABLE IF NOT EXISTS popups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  popup_type TEXT NOT NULL CHECK (popup_type IN ('banner', 'modal', 'toast', 'fullscreen')),
  background_color TEXT DEFAULT '#1B1919',
  text_color TEXT DEFAULT '#FFFFFF',
  accent_color TEXT DEFAULT '#FF1493',
  image_url TEXT,
  action_text TEXT,
  action_url TEXT,
  dismiss_text TEXT DEFAULT 'Dismiss',
  target_pages TEXT[] DEFAULT '{}',
  target_user_type TEXT DEFAULT 'all' CHECK (target_user_type IN ('all', 'guests', 'logged_in', 'premium')),
  show_on_mobile BOOLEAN DEFAULT true,
  show_on_desktop BOOLEAN DEFAULT true,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  frequency TEXT DEFAULT 'once' CHECK (frequency IN ('once', 'always', 'daily', 'weekly')),
  priority INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_popups_is_active ON popups(is_active);
CREATE INDEX IF NOT EXISTS idx_popups_priority ON popups(priority DESC);

-- Ensure created_by is nullable for popups
ALTER TABLE popups ALTER COLUMN created_by DROP NOT NULL;

-- 5. Create user_follows table for profile watching/following
CREATE TABLE IF NOT EXISTS user_follows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_created_at ON user_follows(created_at DESC);

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE popups ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

-- User Follows Policies
DROP POLICY IF EXISTS "Users can view all follows" ON user_follows;
CREATE POLICY "Users can view all follows"
  ON user_follows FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can follow others" ON user_follows;
CREATE POLICY "Users can follow others"
  ON user_follows FOR INSERT
  TO authenticated
  WITH CHECK (follower_id = auth.uid());

DROP POLICY IF EXISTS "Users can unfollow" ON user_follows;
CREATE POLICY "Users can unfollow"
  ON user_follows FOR DELETE
  TO authenticated
  USING (follower_id = auth.uid());

-- Admin Logs Policies
DROP POLICY IF EXISTS "Admin users can view all logs" ON admin_logs;
CREATE POLICY "Admin users can view all logs"
  ON admin_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admin users can insert logs" ON admin_logs;
CREATE POLICY "Admin users can insert logs"
  ON admin_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Allow public clients to report frontend client errors (limited insert policy)
DROP POLICY IF EXISTS "Public can insert client errors" ON admin_logs;
CREATE POLICY "Public can insert client errors"
  ON admin_logs FOR INSERT
  TO public
  WITH CHECK (
    action = 'client_error'
    AND entity_type = 'frontend'
    AND details IS NOT NULL
  );

-- Allow admin users to delete logs
DROP POLICY IF EXISTS "Admin users can delete logs" ON admin_logs;
CREATE POLICY "Admin users can delete logs"
  ON admin_logs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Forum Posts Policies (update existing)
DROP POLICY IF EXISTS "Anyone can view approved forum posts" ON forum_posts;
CREATE POLICY "Anyone can view approved forum posts"
  ON forum_posts FOR SELECT
  TO authenticated
  USING (is_approved = true);

DROP POLICY IF EXISTS "Users can view their own posts" ON forum_posts;
CREATE POLICY "Users can view their own posts"
  ON forum_posts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all posts" ON forum_posts;
CREATE POLICY "Admins can view all posts"
  ON forum_posts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can create posts" ON forum_posts;
CREATE POLICY "Users can create posts"
  ON forum_posts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can update posts" ON forum_posts;
CREATE POLICY "Admins can update posts"
  ON forum_posts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Popups Policies
DROP POLICY IF EXISTS "Anyone can view active popups" ON popups;
CREATE POLICY "Anyone can view active popups"
  ON popups FOR SELECT
  TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage popups" ON popups;
CREATE POLICY "Admins can manage popups"
  ON popups FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- =====================================================
-- Supabase Storage Setup
-- =====================================================

-- IMPORTANT: Storage bucket and policies MUST be created via Supabase Dashboard
-- SQL INSERT into storage.buckets and storage.policies does NOT work in hosted Supabase

/*
STEP 1: Create Storage Bucket via Dashboard
--------------------------------------------
1. Go to: Supabase Dashboard → Storage → "Create a new bucket"
2. Configure:
   - Bucket name: forum
   - Public bucket: Toggle ON (enable public access)
   - File size limit: 5242880 (5MB in bytes)
   - Allowed MIME types: image/jpeg, image/jpg, image/png, image/webp

STEP 2: Create Storage Policies via Dashboard
----------------------------------------------
After creating the bucket, go to: Storage → Buckets → public → Policies → "New Policy"

Create these 3 policies:

POLICY 1: Allow authenticated uploads to forum_images
- Policy name: Allow authenticated uploads to forum_images
- Allowed operations: INSERT
- Target roles: authenticated
- USING expression:
  (bucket_id = 'forum') AND ((storage.foldername(name))[1] = 'forum_images') AND (auth.role() = 'authenticated')
  
- WITH CHECK expression:
  (bucket_id = 'forum') AND ((storage.foldername(name))[1] = 'forum_images')

POLICY 2: Public read access to forum_images  
- Policy name: Public read access to forum_images
- Allowed operations: SELECT
- Target roles: Leave empty for public access
- USING expression:
  (bucket_id = 'forum') AND ((storage.foldername(name))[1] = 'forum_images')

POLICY 3: Users can delete own forum images
- Policy name: Users can delete own forum images
- Allowed operations: DELETE
- Target roles: authenticated
- USING expression:
  (bucket_id = 'forum') AND ((storage.foldername(name))[1] = 'forum_images') AND (auth.uid()::text = (storage.foldername(name))[2])
  
- WITH CHE
CK expression:
  (bucket_id = 'forum') AND ((storage.foldername(name))[1] = 'forum_images')
*/

-- =====================================================
-- Verification Queries
-- =====================================================

-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('admin_logs', 'forum_posts', 'popups', 'user_follows');

-- Check forum_posts columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'forum_posts'
AND column_name IN ('image_url', 'is_approved');

-- Check indexes
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('admin_logs', 'forum_posts', 'popups', 'user_follows');

-- Check RLS policies
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('admin_logs', 'forum_posts', 'popups', 'user_follows');

-- =====================================================
-- Sample Data for Testing (Optional)
-- =====================================================

-- Test popup (inactive by default)
INSERT INTO popups (
  title,
  content,
  popup_type,
  background_color,
  text_color,
  accent_color,
  target_user_type,
  frequency,
  priority,
  is_active
) VALUES (
  'Welcome to Tatakai!',
  'Discover thousands of anime series and join our community.',
  'banner',
  '#1B1919',
  '#FFFFFF',
  '#FF1493',
  'all',
  'once',
  1,
  false -- Set to true to activate
)
ON CONFLICT DO NOTHING;
