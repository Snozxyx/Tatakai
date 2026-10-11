-- Original premium cosmetics: authoritative entitlement checks on profile JSON.
-- A legacy is_premium flag, moderator role, or collectible badge does not unlock them.
CREATE OR REPLACE FUNCTION public.enforce_premium_profile_cosmetics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cosmetic_settings jsonb;
  premium_access boolean;
  effect_key text;
  decoration_key text;
  overlay_key text;
  nameplate_key text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.app_settings -> 'profile' IS NOT DISTINCT FROM OLD.app_settings -> 'profile'
      AND NEW.is_admin IS NOT DISTINCT FROM OLD.is_admin
      AND NEW.role IS NOT DISTINCT FROM OLD.role THEN
      RETURN NEW;
    END IF;
  END IF;

  premium_access := COALESCE(NEW.is_admin, false) OR COALESCE(NEW.role = 'admin', false)
    OR EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = NEW.user_id
      AND badge_key IN ('premium-go', 'premium-pro', 'premium-ultra'));
  cosmetic_settings := COALESCE(NEW.app_settings -> 'profile', '{}'::jsonb);
  IF jsonb_typeof(cosmetic_settings) <> 'object' THEN
    RAISE EXCEPTION 'Profile cosmetics must be a JSON object' USING ERRCODE = '22023';
  END IF;

  -- Removing the last source of admin access also removes premium equipment.
  IF TG_OP = 'UPDATE' THEN
    IF (COALESCE(OLD.is_admin, false) OR COALESCE(OLD.role = 'admin', false)) AND NOT premium_access THEN
      cosmetic_settings := cosmetic_settings - 'avatarDecoration' - 'profileEffect' - 'nameplate';
      IF cosmetic_settings ->> 'backgroundEffect' IN ('moonlit', 'prism', 'embers', 'ocean') THEN
        cosmetic_settings := cosmetic_settings || '{"backgroundEffect":"none"}'::jsonb;
      END IF;
      NEW.app_settings := jsonb_set(COALESCE(NEW.app_settings, '{}'::jsonb), '{profile}', cosmetic_settings, true);
    END IF;
  END IF;

  effect_key := COALESCE(cosmetic_settings ->> 'backgroundEffect', 'none');
  decoration_key := COALESCE(cosmetic_settings ->> 'avatarDecoration', 'none');
  overlay_key := COALESCE(cosmetic_settings ->> 'profileEffect', 'none');
  nameplate_key := COALESCE(cosmetic_settings ->> 'nameplate', 'none');
  IF effect_key NOT IN ('none', 'sakura', 'rain', 'blackhole', 'pitch', 'sky', 'stars', 'fireflies', 'snow', 'aurora', 'moonlit', 'prism', 'embers', 'ocean')
    OR decoration_key NOT IN ('none', 'celestial', 'sakura-wreath', 'imperial', 'crystal', 'seraph', 'lotus', 'eclipse', 'starlight')
    OR overlay_key NOT IN ('none', 'constellation', 'blossom', 'spirit', 'hologram')
    OR nameplate_key NOT IN ('none', 'moonstone', 'rose-quartz', 'gilded', 'opal') THEN
    RAISE EXCEPTION 'Unknown profile cosmetic' USING ERRCODE = '22023';
  END IF;
  IF NOT premium_access AND (effect_key IN ('moonlit', 'prism', 'embers', 'ocean')
    OR decoration_key <> 'none' OR overlay_key <> 'none' OR nameplate_key <> 'none') THEN
    RAISE EXCEPTION 'These cosmetics require a Premium Go, Pro, or Ultra badge, or admin access'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_premium_profile_cosmetics() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_premium_profile_cosmetics ON public.profiles;
CREATE TRIGGER enforce_premium_profile_cosmetics
  BEFORE INSERT OR UPDATE OF app_settings, is_admin, role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_premium_profile_cosmetics();

CREATE OR REPLACE FUNCTION public.clear_revoked_profile_cosmetics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.badge_key NOT IN ('premium-go', 'premium-pro', 'premium-ultra') THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = OLD.user_id
    AND badge_key IN ('premium-go', 'premium-pro', 'premium-ultra'))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = OLD.user_id AND (is_admin = true OR role = 'admin')) THEN
    RETURN OLD;
  END IF;
  UPDATE public.profiles
  SET app_settings = jsonb_set(app_settings, '{profile}',
    ((app_settings -> 'profile') - 'avatarDecoration' - 'profileEffect' - 'nameplate')
    || CASE WHEN app_settings #>> '{profile,backgroundEffect}' IN ('moonlit', 'prism', 'embers', 'ocean')
      THEN '{"backgroundEffect":"none"}'::jsonb ELSE '{}'::jsonb END, true)
  WHERE user_id = OLD.user_id AND jsonb_typeof(app_settings -> 'profile') = 'object';
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_revoked_profile_cosmetics() FROM PUBLIC;
DROP TRIGGER IF EXISTS clear_revoked_profile_cosmetics ON public.user_badges;
CREATE TRIGGER clear_revoked_profile_cosmetics
  AFTER DELETE OR UPDATE OF badge_key, user_id ON public.user_badges
  FOR EACH ROW EXECUTE FUNCTION public.clear_revoked_profile_cosmetics();
