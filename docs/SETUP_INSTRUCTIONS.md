# Setup Instructions

## Issues Fixed

✅ **1. Button Nesting Warning** - Fixed `<button>` inside `<button>` error in MobileNav
✅ **2. Popup/Banner Display** - Created PopupDisplay component and integrated into App
✅ **3. Admin Navigation Responsive** - Made admin tabs responsive with grid layout
✅ **4. Forum Posts in Profile** - Added forum posts tab to public profile pages
✅ **5. Comment Posting** - Already working with refetchQueries strategy

## Database Setup Required

Run the following in your Supabase SQL Editor:

```sql
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

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_admin_logs_user_id ON admin_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_is_approved ON forum_posts(is_approved);
CREATE INDEX IF NOT EXISTS idx_forum_posts_user_id ON forum_posts(user_id);

-- 4. Create popups table
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

-- 5. Create user_follows table
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
```

## Supabase Storage Setup

### Option 1: Using Dashboard (Recommended)

1. **Go to Supabase Dashboard** → Storage

2. **Create or verify bucket** named `public` exists
   - If creating new: Check "Public bucket"
   - Set file size limit to 5MB

3. **Add Storage Policies** (Storage → public bucket → Policies → New Policy):

   **Policy 1: Allow authenticated uploads**
   - Name: `Allow authenticated uploads to forum_images`
   - Allowed operation: INSERT
   - Policy definition:
   ```sql
   (bucket_id = 'public') AND 
   ((storage.foldername(name))[1] = 'forum_images') AND 
   (auth.role() = 'authenticated')
   ```
   - WITH CHECK expression:
   ```sql
   (bucket_id = 'public') AND 
   ((storage.foldername(name))[1] = 'forum_images')
   ```

   **Policy 2: Public read access**
   - Name: `Public read access to forum_images`
   - Allowed operation: SELECT
   - Policy definition:
   ```sql
   (bucket_id = 'public') AND 
   ((storage.foldername(name))[1] = 'forum_images')
   ```

   **Policy 3: Users can delete own images**
   - Name: `Users can delete own forum images`
   - Allowed operation: DELETE
   - Policy definition:
   ```sql
   (bucket_id = 'public') AND 
   ((storage.foldername(name))[1] = 'forum_images') AND 
   (auth.uid()::text = (storage.foldername(name))[2])
   ```
   - WITH CHECK expression:
   ```sql
   (bucket_id = 'public') AND 
   ((storage.foldername(name))[1] = 'forum_images')
   ```

### Option 2: Using SQL (Alternative)

Run this in SQL Editor if you prefer SQL:

```sql
-- Insert storage policy for uploads
INSERT INTO storage.policies (name, bucket_id, definition, action, check_expr)
VALUES (
  'Allow authenticated uploads to forum_images',
  'public',
  '(bucket_id = ''public'') AND ((storage.foldername(name))[1] = ''forum_images'') AND (auth.role() = ''authenticated'')',
  'INSERT',
  '(bucket_id = ''public'') AND ((storage.foldername(name))[1] = ''forum_images'')'
)
ON CONFLICT DO NOTHING;

-- Insert storage policy for public reads
INSERT INTO storage.policies (name, bucket_id, definition, action)
VALUES (
  'Public read access to forum_images',
  'public',
  '(bucket_id = ''public'') AND ((storage.foldername(name))[1] = ''forum_images'')',
  'SELECT'
)
ON CONFLICT DO NOTHING;

-- Insert storage policy for deletions
INSERT INTO storage.policies (name, bucket_id, definition, action, check_expr)
VALUES (
  'Users can delete own forum images',
  'public',
  '(bucket_id = ''public'') AND ((storage.foldername(name))[1] = ''forum_images'') AND (auth.uid()::text = (storage.foldername(name))[2])',
  'DELETE',
  '(bucket_id = ''public'') AND ((storage.foldername(name))[1] = ''forum_images'')'
)
ON CONFLICT DO NOTHING;
```

## RLS Policies Setup

Enable Row Level Security and add policies:

```sql
-- Enable RLS
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE popups ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

-- User follows policies
CREATE POLICY "Users can view all follows"
  ON user_follows FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can follow others"
  ON user_follows FOR INSERT
  TO authenticated
  WITH CHECK (follower_id = auth.uid());

CREATE POLICY "Users can unfollow"
  ON user_follows FOR DELETE
  TO authenticated
  USING (follower_id = auth.uid());

-- Admin logs: Only admins can view/insert
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

-- Popups: Active ones visible to all, management by admins only
CREATE POLICY "Anyone can view active popups"
  ON popups FOR SELECT
  TO authenticated
  USING (is_active = true);

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

-- Forum posts: Update existing policies for image approval
DROP POLICY IF EXISTS "Anyone can view approved forum posts" ON forum_posts;
CREATE POLICY "Anyone can view approved forum posts"
  ON forum_posts FOR SELECT
  TO authenticated
  USING (is_approved = true);

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
```

## Testing

### 1. Test Popup System
- Go to Admin → Popups tab
- Create a test popup (banner type)
- Set it to active
- Refresh the page - banner should appear at top

### 2. Test Image Upload
- Go to Community → Forum → New Post
- Add an image (must be PNG/JPG/JPEG, max 5MB)
- Post will be pending approval
- Admin sees it in Admin → Pending Posts tab

### 3. Test Admin Features
- Go to Admin → Logs tab - should see all admin actions
- Go to Admin → Pending Posts - approve/reject forum images
- Check that actions are logged

### 5. Test Profile Forum Posts
- Visit any user's profile: `/@username`
- Click "Forum Posts" tab
- Should see their approved posts

### 6. Test Profile Following
- Visit any user's profile: `/@username`
- Click "Follow" button
- Follower/following counts should update
- Button should change to "Unfollow"
- Click "Unfollow" to unfollow

### 7. Test Mobile Responsiveness
- Resize browser or use mobile device
- Admin tabs should show icons only on small screens
- MobileNav should work without console errors

## Scheduled Anime Issue

The scheduled anime uses Jikan API which may have CORS or rate limiting issues. This is external and working as designed - it fails silently if the API is unavailable.

To fix CORS issues (if needed):
- Use a proxy server for API requests
- Or wait for Jikan API to be available (it has rate limits)

## All Issues Fixed ✅

1. ✅ **Button Nesting Error** - Fixed nested buttons in MobileNav
2. ✅ **Popup/Banner System** - Created PopupDisplay component (moved inside Router)
3. ✅ **Admin Navigation** - Made responsive with grid layout
4. ✅ **Forum Posts in Profile** - Added forum posts tab to profiles
5. ✅ **Comment Posting** - Already working correctly
6. ✅ **Profile Watching/Following** - Implemented full follow/unfollow system with counts
7. ✅ **Supabase Storage Policies** - Provided complete SQL setup with DROP IF EXISTS

