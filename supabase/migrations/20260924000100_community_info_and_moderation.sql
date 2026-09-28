-- ============================================================
-- Migration: Community information + role-based moderation (items 10, 12)
-- Date: 2026-09-24
-- Purpose:
--   1. Long-form community info: communities.rules / communities.about
--      (edited on the /community/c/:slug/information + settings surfaces).
--   2. Attribution on soft-deletes: forum_posts / comments / forum_comments get
--      deleted_by (uuid) + deleted_by_role (text) so the tombstone can say WHO
--      removed the row ("[Deleted by Admin/Moderator/Owner]" vs the author's own
--      "[DELETED By User]"). is_deleted / deleted_at already exist
--      (20260923100000_soft_delete_tombstones) — NOT re-added here.
--   3. Role-aware SECURITY DEFINER RPCs so community owners/mods (via
--      community_members.role, not only communities.created_by) and platform
--      staff (has_role / profiles.is_admin) can moderate:
--        * soft_delete_post(p_post_id)      — author | community owner/mod | staff
--        * soft_delete_comment(p_comment_id)— author | community owner/mod | staff
--        * update_community(p_id, ...)       — creator | community owner/mod | staff
--      Community authorization is scoped to the row's OWN community_id, so a
--      community mod can only moderate inside their community, never globally.
--
--   Additive + idempotent (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE,
--   defensive column grants), matching the surrounding community migrations.
--   Community authorization mirrors set_post_pinned in
--   20260924000000_community_pin_permissions.sql.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Long-form community info
-- ---------------------------------------------------------------------------
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS rules text,
  ADD COLUMN IF NOT EXISTS about text;

-- ---------------------------------------------------------------------------
-- 2. Soft-delete attribution columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.forum_posts
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_by_role text;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_by_role text;

-- forum_comments was unified into the polymorphic `comments` table and no longer
-- exists in the live DB (the migration history is not replayable — see
-- [[tatakai-migrations-not-replayable]]). Guard the ALTER so this migration
-- applies whether or not the legacy table is present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'forum_comments'
  ) THEN
    ALTER TABLE public.forum_comments
      ADD COLUMN IF NOT EXISTS deleted_by uuid,
      ADD COLUMN IF NOT EXISTS deleted_by_role text;
  END IF;
END $$;

COMMENT ON COLUMN public.forum_posts.deleted_by_role IS
  'Role of the actor who soft-deleted the row: admin | moderator | owner | mod | user. Drives the tombstone label.';
COMMENT ON COLUMN public.comments.deleted_by_role IS
  'Role of the actor who soft-deleted the row: admin | moderator | owner | mod | user. Drives the tombstone label.';

-- Read access for the tombstone; writes flow through the SECURITY DEFINER RPCs
-- below (belt-and-suspenders, matching 20260923100000's grant note).
GRANT SELECT (deleted_by, deleted_by_role) ON public.forum_posts    TO anon, authenticated;
GRANT SELECT (deleted_by, deleted_by_role) ON public.comments       TO anon, authenticated;

-- Only grant on forum_comments when the legacy table still exists (see guard above).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'forum_comments'
  ) THEN
    EXECUTE 'GRANT SELECT (deleted_by, deleted_by_role) ON public.forum_comments TO anon, authenticated';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3a. soft_delete_post: author | community owner/mod (own community) | staff.
--     Sets is_deleted/deleted_at plus deleted_by/deleted_by_role for the label.
--     Self-deletion is always attributed as 'user' (your own content), even for
--     staff/owners, so it reads "[DELETED By User]".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_post(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_author uuid;
  v_community_id uuid;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT user_id, community_id INTO v_author, v_community_id
  FROM forum_posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_uid = v_author THEN
    v_role := 'user';
  ELSIF public.has_role(v_uid, 'admin')
        OR EXISTS (SELECT 1 FROM profiles WHERE user_id = v_uid AND is_admin = true) THEN
    v_role := 'admin';
  ELSIF public.has_role(v_uid, 'moderator') THEN
    v_role := 'moderator';
  ELSIF v_community_id IS NOT NULL THEN
    SELECT cm.role INTO v_role
    FROM community_members cm
    WHERE cm.community_id = v_community_id
      AND cm.user_id = v_uid
      AND cm.role IN ('owner', 'mod');
  END IF;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE forum_posts
     SET is_deleted = true, deleted_at = now(), deleted_by = v_uid, deleted_by_role = v_role
   WHERE id = p_post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_post(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3b. soft_delete_comment: author | community owner/mod of the parent forum
--     post's community | staff. Only forum_post comments carry a community
--     (resolved via comments.entity_id::uuid -> forum_posts.community_id, the
--     same cast the unify-comments trigger uses); other entity types fall back
--     to author/staff only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_comment(p_comment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_author uuid;
  v_entity_type text;
  v_entity_id text;
  v_community_id uuid;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT user_id, entity_type, entity_id INTO v_author, v_entity_type, v_entity_id
  FROM comments WHERE id = p_comment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comment not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_entity_type = 'forum_post' THEN
    SELECT fp.community_id INTO v_community_id
    FROM forum_posts fp
    WHERE fp.id = v_entity_id::uuid;
  END IF;

  IF v_uid = v_author THEN
    v_role := 'user';
  ELSIF public.has_role(v_uid, 'admin')
        OR EXISTS (SELECT 1 FROM profiles WHERE user_id = v_uid AND is_admin = true) THEN
    v_role := 'admin';
  ELSIF public.has_role(v_uid, 'moderator') THEN
    v_role := 'moderator';
  ELSIF v_community_id IS NOT NULL THEN
    SELECT cm.role INTO v_role
    FROM community_members cm
    WHERE cm.community_id = v_community_id
      AND cm.user_id = v_uid
      AND cm.role IN ('owner', 'mod');
  END IF;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE comments
     SET is_deleted = true, deleted_at = now(), deleted_by = v_uid, deleted_by_role = v_role
   WHERE id = p_comment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_comment(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3c. update_community: role-aware edit so non-creator owners/mods can manage
--     the space (serves the Information page + Settings, items 10 + 12).
--     Authorization: creator | community owner/mod | platform staff. NULL args
--     leave a column unchanged (COALESCE); pass '' to clear a text field.
--     communities has no updated_at column, so none is touched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_community(
  p_id          uuid,
  p_name        text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_icon_url    text DEFAULT NULL,
  p_banner_url  text DEFAULT NULL,
  p_rules       text DEFAULT NULL,
  p_about       text DEFAULT NULL
)
RETURNS public.communities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_created_by uuid;
  v_row public.communities;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT created_by INTO v_created_by FROM communities WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Community not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (
    v_created_by = v_uid
    OR public.has_role(v_uid, 'admin')
    OR public.has_role(v_uid, 'moderator')
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = v_uid AND is_admin = true)
    OR EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.community_id = p_id
        AND cm.user_id = v_uid
        AND cm.role IN ('owner', 'mod')
    )
  ) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE communities SET
    name        = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    icon_url    = COALESCE(p_icon_url, icon_url),
    banner_url  = COALESCE(p_banner_url, banner_url),
    rules       = COALESCE(p_rules, rules),
    about       = COALESCE(p_about, about)
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_community(uuid, text, text, text, text, text, text) TO authenticated;



