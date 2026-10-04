-- Migration: Badge Featured Showcase
-- Adds profiles.featured_badge_key (auto-picked "showcase" badge) + RPC to compute it.

-- Add featured_badge_key column (nullable, references the badge key string)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS featured_badge_key text;

COMMENT ON COLUMN profiles.featured_badge_key IS 'Auto-picked showcase badge key (rarest/highest). Computed from user_badges + roles. Null until first badge earned.';

-- Index for featured badge lookups (profiles that have a specific featured badge)
CREATE INDEX IF NOT EXISTS idx_profiles_featured_badge ON profiles (featured_badge_key) WHERE featured_badge_key IS NOT NULL;

-- RPC: recompute_featured_badge(user_id) — auto-pick the rarest badge and store it.
-- Called after granting/revoking badges, or on-demand. Public executable (own profile + staff).
CREATE OR REPLACE FUNCTION recompute_featured_badge(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_featured text;
  v_is_admin boolean;
  v_is_moderator boolean;
  v_badges text[];
  v_badge record;
  v_rarity_order int;
  v_best_rarity int := 999;
  v_best_animated boolean := false;
  v_best_key text := null;
BEGIN
  -- Permission: own profile or staff
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF auth.uid() <> p_user_id THEN
    -- Check staff
    SELECT is_admin, is_moderator INTO v_is_admin, v_is_moderator
    FROM profiles WHERE user_id = auth.uid();
    IF NOT COALESCE(v_is_admin, false) AND NOT COALESCE(v_is_moderator, false) THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  END IF;

  -- Gather stored badges
  SELECT array_agg(badge_key) INTO v_badges
  FROM user_badges
  WHERE user_id = p_user_id;

  -- Add derived role badges (admin/mod)
  SELECT is_admin, is_moderator INTO v_is_admin, v_is_moderator
  FROM profiles WHERE user_id = p_user_id;

  v_badges := COALESCE(v_badges, ARRAY[]::text[]);
  IF COALESCE(v_is_admin, false) THEN
    v_badges := array_append(v_badges, 'admin');
  ELSIF COALESCE(v_is_moderator, false) THEN
    v_badges := array_append(v_badges, 'mod');
  END IF;

  IF array_length(v_badges, 1) IS NULL OR array_length(v_badges, 1) = 0 THEN
    -- No badges → null
    UPDATE profiles SET featured_badge_key = NULL WHERE user_id = p_user_id;
    RETURN NULL;
  END IF;

  -- Pick the best badge: rarity (mythic=0..common=4) > animated > alphabetical.
  -- Hard-coded badge rarities (sync with badges.ts RARITY_ORDER):
  FOR v_badge IN
    SELECT
      unnest(v_badges) AS key,
      CASE unnest(v_badges)
        -- Mythic (0)
        WHEN 'owner' THEN 0
        WHEN 'omniscient' THEN 0
        WHEN 'legend' THEN 0
        WHEN 'og' THEN 0
        WHEN 'bound-dragon-crystal-abyssal' THEN 0
        -- Legendary (1)
        WHEN 'admin' THEN 1
        WHEN 'developer' THEN 1
        WHEN 'premium-ultra' THEN 1
        WHEN 'millennium' THEN 1
        WHEN 'completionist' THEN 1
        WHEN 'diamond' THEN 1
        WHEN 'dragon-crystal-abyssal' THEN 1
        WHEN 'badge-of-valor-temporal-rift' THEN 1
        -- Epic (2)
        WHEN 'mod' THEN 2
        WHEN 'partner' THEN 2
        WHEN 'premium-pro' THEN 2
        WHEN 'explorer' THEN 2
        WHEN 'reputation' THEN 2
        WHEN 'binge-lord' THEN 2
        WHEN 'tastemaker' THEN 2
        WHEN 'manga-sage' THEN 2
        WHEN 'trendsetter' THEN 2
        WHEN 'mithril' THEN 2
        WHEN 'hero-coin' THEN 2
        WHEN 'labyrinth-token' THEN 2
        WHEN 'dragonbone-stamps' THEN 2
        -- Rare (3)
        WHEN 'booster' THEN 3
        WHEN 'premium-go' THEN 3
        WHEN 'centurion' THEN 3
        WHEN 'harem' THEN 3
        WHEN 'action' THEN 3
        WHEN 'isekai' THEN 3
        WHEN 'romance' THEN 3
        WHEN 'critic' THEN 3
        WHEN 'doomer' THEN 3
        WHEN 'guild-coin' THEN 3
        WHEN 'dream-token' THEN 3
        WHEN 'challenger-coin' THEN 3
        WHEN 'gold-sheaf-ticket' THEN 3
        -- Common (4)
        ELSE 4
      END AS rarity_order,
      CASE unnest(v_badges)
        WHEN 'booster' THEN true
        WHEN 'premium-pro' THEN true
        WHEN 'premium-ultra' THEN true
        WHEN 'millennium' THEN true
        WHEN 'omniscient' THEN true
        WHEN 'completionist' THEN true
        WHEN 'legend' THEN true
        WHEN 'diamond' THEN true
        WHEN 'dragon-crystal-abyssal' THEN true
        WHEN 'bound-dragon-crystal-abyssal' THEN true
        WHEN 'badge-of-valor-temporal-rift' THEN true
        ELSE false
      END AS animated
  LOOP
    v_rarity_order := v_badge.rarity_order;
    IF v_rarity_order < v_best_rarity THEN
      v_best_rarity := v_rarity_order;
      v_best_animated := v_badge.animated;
      v_best_key := v_badge.key;
    ELSIF v_rarity_order = v_best_rarity THEN
      IF v_badge.animated AND NOT v_best_animated THEN
        v_best_animated := true;
        v_best_key := v_badge.key;
      ELSIF v_badge.animated = v_best_animated AND v_badge.key < v_best_key THEN
        v_best_key := v_badge.key;
      END IF;
    END IF;
  END LOOP;

  -- Store the result
  UPDATE profiles SET featured_badge_key = v_best_key WHERE user_id = p_user_id;
  RETURN v_best_key;
END;
$$;

COMMENT ON FUNCTION recompute_featured_badge IS 'Auto-pick the user''s showcase badge (rarest/highest) and store in profiles.featured_badge_key. Public: own profile or staff.';

-- Grant execute to authenticated users (permission check inside)
GRANT EXECUTE ON FUNCTION recompute_featured_badge TO authenticated;
