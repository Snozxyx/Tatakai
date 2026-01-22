-- Add pin functionality to comments and forum posts/comments
-- Allows admins to pin important comments and forum content

-- Add is_pinned to comments table
ALTER TABLE public.comments 
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;

-- Add is_pinned to forum_comments table
ALTER TABLE public.forum_comments 
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;

-- Create index for pinned content
CREATE INDEX IF NOT EXISTS idx_comments_is_pinned ON public.comments(is_pinned) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_forum_comments_is_pinned ON public.forum_comments(is_pinned) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_forum_posts_is_pinned ON public.forum_posts(is_pinned) WHERE is_pinned = true;

-- Admin can pin/unpin any comments
DROP POLICY IF EXISTS "Admins can update any comment" ON public.comments;
CREATE POLICY "Admins can update any comment"
ON public.comments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.is_admin = true
  )
);

-- Admin can pin/unpin forum comments
DROP POLICY IF EXISTS "Admins can update any forum comment" ON public.forum_comments;
CREATE POLICY "Admins can update any forum comment"
ON public.forum_comments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.is_admin = true
  )
);

-- Admin can update forum posts (including pinning)
DROP POLICY IF EXISTS "Admins can update any forum post" ON public.forum_posts;
CREATE POLICY "Admins can update any forum post"
ON public.forum_posts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.is_admin = true
  )
);

-- Add comments
COMMENT ON COLUMN public.comments.is_pinned IS 'Whether the comment is pinned by an admin';
COMMENT ON COLUMN public.forum_comments.is_pinned IS 'Whether the forum comment is pinned by an admin';
COMMENT ON COLUMN public.forum_posts.is_pinned IS 'Whether the forum post is pinned by an admin';
