-- ============================================================
-- Migration: Admin-gated community creation + verified badge + delete
-- Date: 2026-09-24
-- Purpose:
--   1. communities.is_verified — a blue-tick shown next to the community name.
--      Set true for communities created by a platform admin.
--   2. create_community (CREATE OR REPLACE): restrict creation to PLATFORM
--      ADMINS only (has_role 'admin' OR profiles.is_admin) and stamp
--      is_verified = true on the new row. Still enrolls the creator as 'owner'.
--   3. delete_community(p_id): let the community owner (community_members.role =
--      'owner'), the creator, or platform staff delete a community. FKs handle
--      cascade — community_members ON DELETE CASCADE, forum_posts.community_id
--      ON DELETE SET NULL (20260922160000) — so posts survive un-attributed.
--
--   Additive + idempotent. Mirrors the auth patterns in
--   20260922180000_community_grants_and_rpc.sql +
--   20260924000100_community_info_and_moderation.sql.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Verified flag
-- ---------------------------------------------------------------------------
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.communities.is_verified IS
  'Official/verified community (blue tick). Set true when created by a platform admin.';

-- ---------------------------------------------------------------------------
-- 2. create_community — platform admins only, stamps is_verified.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_community(
  p_name        text,
  p_slug        text,
  p_description text DEFAULT NULL,
  p_icon_url    text DEFAULT NULL,
  p_banner_url  text DEFAULT NULL,
  p_anime_id    text DEFAULT NULL
)
RETURNS public.communities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_row public.communities;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_is_admin := public.has_role(v_uid, 'admin')
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = v_uid AND is_admin = true);

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only platform admins can create communities'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 OR p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RAISE EXCEPTION 'Name and slug are required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF EXISTS (SELECT 1 FROM communities WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'That slug is already taken' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO communities (slug, name, description, anime_id, icon_url, banner_url, created_by, is_verified)
  VALUES (p_slug, p_name, p_description, p_anime_id, p_icon_url, p_banner_url, v_uid, true)
  RETURNING * INTO v_row;

  INSERT INTO community_members (community_id, user_id, role)
  VALUES (v_row.id, v_uid, 'owner')
  ON CONFLICT (community_id, user_id) DO NOTHING;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_community(text, text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. delete_community — community owner | creator | platform staff.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_community(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_created_by uuid;
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
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = v_uid AND is_admin = true)
    OR EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.community_id = p_id
        AND cm.user_id = v_uid
        AND cm.role = 'owner'
    )
  ) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- FKs cascade: community_members ON DELETE CASCADE; forum_posts.community_id
  -- ON DELETE SET NULL — posts survive, un-attributed.
  DELETE FROM communities WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_community(uuid) TO authenticated;
