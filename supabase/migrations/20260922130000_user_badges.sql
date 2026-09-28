-- ============================================================
-- Migration: User badges (role + collectible families)
-- Date: 2026-09-22
-- Purpose:
--   A single grant table for two badge families:
--     * role/entitlement badges (owner, developer, booster, partner,
--       premium-go/pro/ultra) — admin-granted;
--     * collectible badges (OG, genre-affinity, etc.) — auto-computed
--       from analytics (source='auto') with admin override (source='admin').
--   admin/moderator badges are NOT stored here — they are derived at read time
--   from profiles.is_admin / is_moderator so they can never drift from the role.
--
-- Mirrors user_achievements (20260228000001): public read for profile display,
-- writes only via SECURITY DEFINER RPCs so the locked-down profiles column
-- pattern (20260902000003) is preserved and grants are forge-proof.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_badges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_key  text NOT NULL,
  -- 'auto'  = written by recompute_user_badges from data rules
  -- 'admin' = written by grant_badge (manual override, never overwritten by auto)
  source     text NOT NULL DEFAULT 'admin' CHECK (source IN ('auto', 'admin')),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  note       text,
  UNIQUE (user_id, badge_key)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id
  ON public.user_badges (user_id);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- Anyone can read any user's badges (public profile + comment display).
DROP POLICY IF EXISTS "Public read user badges" ON public.user_badges;
CREATE POLICY "Public read user badges"
  ON public.user_badges FOR SELECT
  USING (true);

-- Direct writes are blocked for everyone: all mutations go through the RPCs
-- below. (No INSERT/UPDATE/DELETE policy = no direct client writes under RLS.)

-- -----------------------------------------------------------------------------
-- grant_badge / revoke_badge: manual admin override.
-- Authorization mirrors set_staff_role (20260902000003): admin OR moderator,
-- inlined rather than via has_role so a staffer whose status lives in `role`
-- is not locked out.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_badge(
  target_user_id uuid,
  p_badge_key    text,
  p_note         text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_badge_key IS NULL OR length(trim(p_badge_key)) = 0 THEN
    RAISE EXCEPTION 'p_badge_key is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
      AND (is_admin = true OR is_moderator = true OR role IN ('admin', 'moderator'))
  ) THEN
    RAISE EXCEPTION 'Unauthorized: staff only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = target_user_id) THEN
    RAISE EXCEPTION 'Target user not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO user_badges (user_id, badge_key, source, granted_by, note)
  VALUES (target_user_id, p_badge_key, 'admin', auth.uid(), p_note)
  ON CONFLICT (user_id, badge_key)
  DO UPDATE SET source     = 'admin',
               granted_by = auth.uid(),
               granted_at = now(),
               note       = EXCLUDED.note;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_badge(
  target_user_id uuid,
  p_badge_key    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
      AND (is_admin = true OR is_moderator = true OR role IN ('admin', 'moderator'))
  ) THEN
    RAISE EXCEPTION 'Unauthorized: staff only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM user_badges
  WHERE user_id = target_user_id AND badge_key = p_badge_key;
END;
$$;

-- -----------------------------------------------------------------------------
-- recompute_user_badges: derive source='auto' collectible badges from data.
--
-- Only rules with data available today are implemented:
--   * og            — one of the first 100 accounts by profiles.created_at
--   * centurion     — 100+ episodes in watch_history
--   * millennium    — 1000+ episodes
--   * explorer      — 50+ distinct anime
--   * marathoner    — 30+ day longest streak
-- Genre-affinity badges (harem, action, isekai, …) need a genre source that
-- watch_history does not store; those stay admin-granted until a genre join
-- exists. This function only touches source='auto' rows, so admin overrides and
-- admin-granted collectibles are never clobbered.
--
-- SECURITY DEFINER + a self-or-staff check: a user may recompute their own
-- badges; staff may recompute anyone's.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_user_badges(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_created_at   timestamptz;
  v_signup_rank  integer;
  v_episodes     integer;
  v_unique_anime integer;
  v_earned       text[] := ARRAY[]::text[];
BEGIN
  IF p_user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
      AND (is_admin = true OR is_moderator = true OR role IN ('admin', 'moderator'))
  ) THEN
    RAISE EXCEPTION 'Unauthorized'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT created_at INTO v_created_at FROM profiles WHERE user_id = p_user_id;
  IF v_created_at IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- OG: among the earliest 100 accounts.
  SELECT count(*) + 1 INTO v_signup_rank
  FROM profiles
  WHERE created_at < v_created_at;
  IF v_signup_rank <= 100 THEN
    v_earned := array_append(v_earned, 'og');
  END IF;

  -- Volume/exploration badges from watch_history.
  SELECT count(*), count(DISTINCT anime_id)
    INTO v_episodes, v_unique_anime
  FROM watch_history
  WHERE user_id = p_user_id;

  IF v_episodes >= 100  THEN v_earned := array_append(v_earned, 'centurion');  END IF;
  IF v_episodes >= 1000 THEN v_earned := array_append(v_earned, 'millennium'); END IF;
  IF v_unique_anime >= 50 THEN v_earned := array_append(v_earned, 'explorer'); END IF;

  -- Upsert earned auto badges.
  IF array_length(v_earned, 1) IS NOT NULL THEN
    INSERT INTO user_badges (user_id, badge_key, source)
    SELECT p_user_id, key, 'auto'
    FROM unnest(v_earned) AS key
    ON CONFLICT (user_id, badge_key) DO NOTHING;
  END IF;

  -- Remove auto badges the user no longer qualifies for (leaves admin grants).
  DELETE FROM user_badges
  WHERE user_id = p_user_id
    AND source = 'auto'
    AND NOT (badge_key = ANY (v_earned));
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_badge(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_badge(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_user_badges(uuid) TO authenticated;
