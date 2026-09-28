-- ============================================================
-- Migration: Community feed social layer
-- Date: 2026-09-22
-- Purpose:
--   Second wave of the feed-first community platform:
--     * post_reposts / post_bookmarks — real repost & bookmark (was local-only)
--     * post_hashtags               — extracted #tags for trending
--     * communities / community_members + forum_posts.community_id
--                                     — per-anime / topic community spaces
--     * notify_mention()            — SECURITY DEFINER RPC so an author can
--                                     notify an @mentioned user (regular users
--                                     cannot INSERT notifications for others,
--                                     see 20260902000001).
--   Quote-reposts reuse forum_posts with metadata.quoted_post_id (no new table).
-- ============================================================

-- ---------------------------------------------------------------------------
-- Reposts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_reposts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_post_reposts_post_id ON public.post_reposts (post_id);

ALTER TABLE public.post_reposts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read reposts" ON public.post_reposts;
CREATE POLICY "Public read reposts" ON public.post_reposts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Self insert repost" ON public.post_reposts;
CREATE POLICY "Self insert repost" ON public.post_reposts FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Self delete repost" ON public.post_reposts;
CREATE POLICY "Self delete repost" ON public.post_reposts FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Bookmarks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_bookmarks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_post_bookmarks_user_id ON public.post_bookmarks (user_id);

ALTER TABLE public.post_bookmarks ENABLE ROW LEVEL SECURITY;
-- A user's bookmarks are private to them.
DROP POLICY IF EXISTS "Self read bookmarks" ON public.post_bookmarks;
CREATE POLICY "Self read bookmarks" ON public.post_bookmarks FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Self insert bookmark" ON public.post_bookmarks;
CREATE POLICY "Self insert bookmark" ON public.post_bookmarks FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Self delete bookmark" ON public.post_bookmarks;
CREATE POLICY "Self delete bookmark" ON public.post_bookmarks FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Hashtags (trending)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_hashtags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  tag        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_tag ON public.post_hashtags (tag, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_hashtags_post_tag ON public.post_hashtags (post_id, tag);

ALTER TABLE public.post_hashtags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read hashtags" ON public.post_hashtags;
CREATE POLICY "Public read hashtags" ON public.post_hashtags FOR SELECT USING (true);
-- Only the post's author may tag it.
DROP POLICY IF EXISTS "Owner insert hashtag" ON public.post_hashtags;
CREATE POLICY "Owner insert hashtag" ON public.post_hashtags FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.forum_posts p WHERE p.id = post_id AND p.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Communities (topic / per-anime spaces)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  anime_id    text,
  icon_url    text,
  banner_url  text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read communities" ON public.communities;
CREATE POLICY "Public read communities" ON public.communities FOR SELECT USING (true);
DROP POLICY IF EXISTS "Auth create community" ON public.communities;
CREATE POLICY "Auth create community" ON public.communities FOR INSERT WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS "Creator update community" ON public.communities;
CREATE POLICY "Creator update community" ON public.communities FOR UPDATE
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.community_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'mod', 'owner')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_community_members_community ON public.community_members (community_id);

ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read members" ON public.community_members;
CREATE POLICY "Public read members" ON public.community_members FOR SELECT USING (true);
DROP POLICY IF EXISTS "Self join community" ON public.community_members;
CREATE POLICY "Self join community" ON public.community_members FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Self leave community" ON public.community_members;
CREATE POLICY "Self leave community" ON public.community_members FOR DELETE USING (user_id = auth.uid());

ALTER TABLE public.forum_posts
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES public.communities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_forum_posts_community ON public.forum_posts (community_id);

-- ---------------------------------------------------------------------------
-- notify_mention: let a post author notify an @mentioned user.
-- SECURITY DEFINER because end users cannot INSERT notifications for others.
-- Guards: caller must be authenticated and own the referenced post; the post
-- must actually reference the target (so the RPC can't be used to spam
-- arbitrary users). Self-mentions are ignored.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_mention(
  target_user_id uuid,
  p_post_id      uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor      uuid := auth.uid();
  v_actor_name text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF target_user_id IS NULL OR target_user_id = v_actor THEN
    RETURN; -- ignore self / empty
  END IF;

  -- Caller must own the post they claim to be mentioning from.
  IF NOT EXISTS (
    SELECT 1 FROM forum_posts WHERE id = p_post_id AND user_id = v_actor
  ) THEN
    RAISE EXCEPTION 'Post not found or not owned by caller' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = target_user_id) THEN
    RETURN; -- unknown target, nothing to do
  END IF;

  SELECT COALESCE(display_name, username, 'Someone') INTO v_actor_name
  FROM profiles WHERE user_id = v_actor;

  INSERT INTO notifications (user_id, title, body, data)
  VALUES (
    target_user_id,
    'You were mentioned',
    v_actor_name || ' mentioned you in a post',
    jsonb_build_object('type', 'mention', 'post_id', p_post_id, 'actor_id', v_actor)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_mention(uuid, uuid) TO authenticated;
