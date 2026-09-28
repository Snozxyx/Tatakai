-- ============================================================
-- Migration: Community-scoped pin permissions (item 8)
-- Date: 2026-09-24
-- Purpose:
--   Enforce the pin authorization matrix the product requires:
--     * A GENERAL post (community_id IS NULL) can be pinned by a platform admin
--       OR a platform moderator (these are the "global" pins surfaced first in
--       the /community feed).
--     * A COMMUNITY post can be pinned by platform staff (admin / moderator /
--       profiles.is_admin) OR that community's own OWNER / MOD.
--
--   set_post_pinned() shipped in 20260923093000_community_phase_b.sql gated on
--   platform staff only (admin OR moderator OR is_admin) for every post, and had
--   no community-owner/mod path. This CREATE OR REPLACE re-derives permission
--   from the post's own community_id so a community mod can pin only within their
--   community, and a platform moderator can no longer pin general posts.
--
--   Display is already community-scoped client-side: useFeed only floats a
--   pinned post when a communityId filter is set (FeedList scopePins), and the
--   "Pinned" flair is gated on the viewing community (PostCard contextCommunityId),
--   so a post pinned in a community does NOT float or show as pinned in the
--   aggregate feed.
--
--   Idempotent (CREATE OR REPLACE); no schema change, no new grant (EXECUTE was
--   already granted to authenticated for this signature).
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_post_pinned(p_post_id uuid, p_pinned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_community_id uuid;
  v_is_platform_admin boolean;
  v_is_platform_mod boolean;
  v_allowed boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT community_id INTO v_community_id FROM forum_posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_platform_admin :=
    public.has_role(v_uid, 'admin')
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = v_uid AND is_admin = true);
  v_is_platform_mod := public.has_role(v_uid, 'moderator');

  IF v_community_id IS NULL THEN
    -- General (global) feed: platform admin or moderator.
    v_allowed := v_is_platform_admin OR v_is_platform_mod;
  ELSE
    -- Community post: platform admin / moderator, or this community's owner / mod.
    v_allowed :=
      v_is_platform_admin
      OR v_is_platform_mod
      OR EXISTS (
        SELECT 1
        FROM community_members cm
        WHERE cm.community_id = v_community_id
          AND cm.user_id = v_uid
          AND cm.role IN ('owner', 'mod')
      );
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE forum_posts SET is_pinned = p_pinned, updated_at = now() WHERE id = p_post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_post_pinned(uuid, boolean) TO authenticated;
