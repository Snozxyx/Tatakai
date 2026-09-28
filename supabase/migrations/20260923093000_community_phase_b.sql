-- ============================================================
-- Migration: Community platform — Phase B
-- Date: 2026-09-23
-- Purpose:
--   Complete the feed-first community platform (Phase B). Adds the data layer
--   for: per-option poll images, tag-interest tracking + For You ranking,
--   post edit tracking, an admin pin RPC, and an "official / bot" profile flag
--   for the News account.
--
--   Reply notifications (item 2) are NOT here: community comments live in the
--   polymorphic public.comments table, and 20260923120000_unify_comments.sql's
--   notify_on_comment() already delivers reply + mention notifications there and
--   drops the legacy public.forum_comments. A trigger on forum_comments would be
--   both redundant and broken (that relation no longer exists).
--
--   Additive + idempotent, matching the style of the earlier feed migrations
--   (20260922150000 / …160000 / …180000): IF NOT EXISTS on tables/columns,
--   DROP POLICY IF EXISTS before each policy, explicit GRANTs to authenticated
--   and service_role, and SECURITY DEFINER RPCs for anything RLS blocks a
--   client from doing directly.
--
--   Notes on existing schema (verified against main.sql):
--     * forum_posts.is_pinned already exists (+ idx, + admin UPDATE policy from
--       20260111000001) — this migration only adds the gated RPC, not the column.
--     * forum_posts already has a "Users can update own posts" UPDATE policy, so
--       editing content/metadata/flair/is_spoiler is a direct UPDATE; we only add
--       an edited_at column to record it.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Poll option images (item 6)
--    post_polls.options is already jsonb (20260922150000). No column change.
--    Convention going forward: each option is an object
--        { "text": string, "image": string | null }
--    instead of a bare string. Readers (tallyPoll / Poll.tsx) fall back to
--    treating a string element as { text: <string>, image: null } so old rows
--    keep rendering. Documented here so the shape has a home in version control.
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.post_polls.options IS
  'jsonb array of { text: string, image: string|null }. Legacy rows may store bare strings; readers coerce.';

-- ---------------------------------------------------------------------------
-- 2. Tag interests (item 9) — powers For You ranking.
--    One row per (user, tag); weight grows as the user engages with that tag.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_tag_interests (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag        text NOT NULL,
  weight     integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_user_tag_interests_user
  ON public.user_tag_interests (user_id, weight DESC);

ALTER TABLE public.user_tag_interests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Self read tag interests" ON public.user_tag_interests;
CREATE POLICY "Self read tag interests" ON public.user_tag_interests
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Self insert tag interest" ON public.user_tag_interests;
CREATE POLICY "Self insert tag interest" ON public.user_tag_interests
  FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Self update tag interest" ON public.user_tag_interests;
CREATE POLICY "Self update tag interest" ON public.user_tag_interests
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_tag_interests TO authenticated;
GRANT ALL ON public.user_tag_interests TO service_role;

-- bump_tag_interest: upsert +1 weight for each tag the caller engages with.
-- SECURITY DEFINER so a single call can upsert many rows without the client
-- juggling per-row RLS; still scoped to auth.uid() so it can only touch the
-- caller's own interests.
CREATE OR REPLACE FUNCTION public.bump_tag_interest(p_tags text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tag text;
BEGIN
  IF v_uid IS NULL OR p_tags IS NULL THEN
    RETURN;
  END IF;
  FOREACH v_tag IN ARRAY p_tags LOOP
    v_tag := lower(trim(v_tag));
    CONTINUE WHEN v_tag = '';
    INSERT INTO user_tag_interests (user_id, tag, weight, updated_at)
    VALUES (v_uid, v_tag, 1, now())
    ON CONFLICT (user_id, tag)
      DO UPDATE SET weight = user_tag_interests.weight + 1, updated_at = now();
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_tag_interest(text[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reply notifications (item 2) — intentionally omitted.
--    Community comments are rows in the polymorphic public.comments table
--    (Comments entityType="forum_post"), NOT the legacy public.forum_comments.
--    20260923120000_unify_comments.sql owns comment notifications: its
--    notify_on_comment() trigger on public.comments already notifies the parent
--    comment's author on a reply (and mentioned users), then drops
--    forum_comments. Adding a trigger here would double-fire or fail.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 4. Post edit (item 3)
--    "Users can update own posts" UPDATE policy already exists (20260110000001),
--    so editing is a direct UPDATE. Add edited_at so the UI can show "edited".
-- ---------------------------------------------------------------------------
ALTER TABLE public.forum_posts
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- ---------------------------------------------------------------------------
-- 5. Pin (item 3, admin) — forum_posts.is_pinned already exists.
--    Gated SECURITY DEFINER RPC so pin/unpin is a single explicit call rather
--    than a raw UPDATE; accepts either the has_role('admin'/'moderator') model
--    or the profiles.is_admin flag (both exist in this schema).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_post_pinned(p_post_id uuid, p_pinned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'admin')
    OR public.has_role(v_uid, 'moderator')
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = v_uid AND is_admin = true)
  ) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE forum_posts SET is_pinned = p_pinned, updated_at = now() WHERE id = p_post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_post_pinned(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Official / bot profile flag (item 12)
--    profiles has no official/bot boolean. Add one so the News bot profile can
--    render a verified tick. The bot's auth.users row is NOT created here —
--    there is no auth.users-insert precedent in this repo; TatakaiAPI's
--    service-role Admin API creates it and then flips this flag (see Group 9).
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_official boolean DEFAULT false;
