-- ============================================================
-- Migration: Community feed grants + create_community RPC
-- Date: 2026-09-22
-- Purpose:
--   Fix "new row violates row-level security policy" on community creation.
--   1. This project GRANTs table privileges to `authenticated` explicitly per
--      table (see gif_bookmarks, 20260919120000) rather than relying on default
--      privileges — the feed tables (…150000/…160000) omitted their GRANTs.
--   2. Creating a community is a two-step write (communities + owner membership)
--      that is brittle under RLS; route it through a SECURITY DEFINER RPC that
--      performs both server-side, mirroring the profiles/badges write pattern
--      (20260902000003, 20260922130000).
-- Additive + idempotent: safe to apply after the earlier feed migrations.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_polls        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_poll_votes   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_reposts      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_bookmarks    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_hashtags     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_members TO authenticated;

GRANT ALL ON public.post_polls        TO service_role;
GRANT ALL ON public.post_poll_votes   TO service_role;
GRANT ALL ON public.post_reposts      TO service_role;
GRANT ALL ON public.post_bookmarks    TO service_role;
GRANT ALL ON public.post_hashtags     TO service_role;
GRANT ALL ON public.communities       TO service_role;
GRANT ALL ON public.community_members TO service_role;

-- ---------------------------------------------------------------------------
-- create_community: create a community and enroll the caller as owner in one
-- transaction, as SECURITY DEFINER so it is immune to per-table RLS/grant
-- ordering. Enforces auth + slug uniqueness server-side.
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
  v_row public.communities;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 OR p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RAISE EXCEPTION 'Name and slug are required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF EXISTS (SELECT 1 FROM communities WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'That slug is already taken' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO communities (slug, name, description, anime_id, icon_url, banner_url, created_by)
  VALUES (p_slug, p_name, p_description, p_anime_id, p_icon_url, p_banner_url, v_uid)
  RETURNING * INTO v_row;

  INSERT INTO community_members (community_id, user_id, role)
  VALUES (v_row.id, v_uid, 'owner')
  ON CONFLICT (community_id, user_id) DO NOTHING;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_community(text, text, text, text, text, text) TO authenticated;
