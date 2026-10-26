-- Expand launch ownership to every current custom theme and grow the cosmetic collection.
BEGIN;
ALTER TABLE public.profile_theme_grants DROP CONSTRAINT profile_theme_grants_theme_id_check;
ALTER TABLE public.profile_theme_grants ADD CONSTRAINT profile_theme_grants_theme_id_check
 CHECK(theme_id IN ('midnight-lofi','komorebi','uchiha','sekaipop','gothic-empress'));
-- Existing launch claimants receive the expanded collection without consuming another slot.
INSERT INTO public.profile_theme_grants(user_id,theme_id)
 SELECT claims.user_id,themes.id FROM public.profile_theme_launch_claims claims
 CROSS JOIN (VALUES ('uchiha'),('sekaipop'),('gothic-empress')) themes(id)
 ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.claim_profile_theme_launch()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); used integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to claim the collection' USING ERRCODE='42501'; END IF;
 -- Serialize allocations across accounts and duplicate requests, including the last slot.
 SELECT claimed INTO used FROM public.profile_theme_launch_campaign WHERE id='japanese-launch' FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.profile_theme_launch_claims WHERE user_id=uid) THEN RETURN public.profile_theme_launch_status(); END IF;
 -- Lock the account before reading eligibility; profile saves use the same row lock.
 PERFORM 1 FROM public.profiles WHERE user_id=uid FOR UPDATE;
 IF NOT public.profile_theme_launch_eligible(uid) THEN
  RAISE EXCEPTION 'This offer is for accounts without Premium or existing collection access' USING ERRCODE='42501';
 END IF;
 IF used >= 200 THEN RAISE EXCEPTION 'All 200 free collections have been claimed' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.profile_theme_launch_claims(user_id,slot) VALUES(uid,used+1);
 INSERT INTO public.profile_theme_grants(user_id,theme_id) VALUES(uid,'midnight-lofi'),(uid,'komorebi'),(uid,'uchiha'),(uid,'sekaipop'),(uid,'gothic-empress') ON CONFLICT DO NOTHING;
 UPDATE public.profile_theme_launch_campaign SET claimed=used+1 WHERE id='japanese-launch';
 RETURN public.profile_theme_launch_status();
END;
$$;
REVOKE ALL ON FUNCTION public.claim_profile_theme_launch() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_profile_theme_launch() TO authenticated;


CREATE OR REPLACE FUNCTION public.enforce_profile_themes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p jsonb; old_p jsonb := '{}'::jsonb; k text; preset jsonb; access boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN old_p := COALESCE(OLD.app_settings->'profileThemes','{}'::jsonb); END IF;
  p := NEW.app_settings->'profileThemes';
  access := COALESCE(NEW.is_admin,false) OR COALESCE(NEW.role = 'admin',false)
    OR EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = NEW.user_id AND badge_key IN ('booster','premium-pro','premium-ultra'));
  -- A role revocation returns to Default without destroying the saved scrapbook.
  IF TG_OP = 'UPDATE' AND NOT access AND (COALESCE(OLD.is_admin,false) OR COALESCE(OLD.role = 'admin',false)) AND p->>'selected' <> 'default' AND NOT public.owns_profile_theme(NEW.user_id,p->>'selected') THEN
    p := jsonb_set(p,'{selected}','"default"'::jsonb);
    NEW.app_settings := jsonb_set(NEW.app_settings,'{profileThemes}',p);
  END IF;
  IF p IS NOT DISTINCT FROM old_p OR (p IS NULL AND old_p = '{}'::jsonb) THEN RETURN NEW; END IF;
  IF p IS NULL THEN
    IF old_p <> '{}'::jsonb THEN RAISE EXCEPTION 'Preserve saved profile themes when updating app settings' USING ERRCODE = '22023'; END IF;
    RETURN NEW;
  END IF;
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM '1'
    OR COALESCE(p->>'selected','') NOT IN ('default','sekaipop','uchiha','gothic-empress','midnight-lofi','komorebi')
    OR jsonb_typeof(p->'configurations') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p->'presets') IS DISTINCT FROM 'array' OR octet_length(p::text) > 524288 THEN
    RAISE EXCEPTION 'Invalid profile theme preferences' USING ERRCODE = '22023';
  END IF;
  IF NOT access AND ((p->>'selected' <> 'default' AND NOT public.owns_profile_theme(NEW.user_id,p->>'selected'))
    OR (NOT public.owns_profile_theme(NEW.user_id,'sekaipop') AND p->'presets' IS DISTINCT FROM COALESCE(old_p->'presets','[]'::jsonb))) THEN
    RAISE EXCEPTION 'Claim this theme or unlock custom profile access first' USING ERRCODE='42501';
  END IF;
  IF NOT access AND EXISTS(SELECT 1 FROM jsonb_object_keys(COALESCE(old_p->'configurations','{}'::jsonb)) AS keys(key)
    WHERE NOT (p->'configurations' ? key)) THEN
    RAISE EXCEPTION 'Preserve saved theme configurations' USING ERRCODE='22023';
  END IF;
  FOR k IN SELECT jsonb_object_keys(p->'configurations') LOOP
    IF NOT access AND k <> 'default' AND NOT public.owns_profile_theme(NEW.user_id,k)
      AND p->'configurations'->k IS DISTINCT FROM old_p->'configurations'->k THEN
      RAISE EXCEPTION 'This theme is not in your collection' USING ERRCODE='42501';
    END IF;
    IF k = 'sekaipop' THEN PERFORM public.validate_sekai_configuration(p->'configurations'->k);
    ELSIF k = 'uchiha' THEN
      IF jsonb_typeof(p->'configurations'->k) IS DISTINCT FROM 'object' OR p->'configurations'->k->'version' IS DISTINCT FROM '1'::jsonb THEN
        RAISE EXCEPTION 'Invalid Uchiha settings' USING ERRCODE = '22023';
      END IF;
    ELSIF k = 'gothic-empress' THEN
      IF jsonb_typeof(p->'configurations'->k) IS DISTINCT FROM 'object'
        OR p->'configurations'->k->'version' IS DISTINCT FROM '1'::jsonb
        OR ((p->'configurations'->k) ? 'motion' AND jsonb_typeof(p->'configurations'->k->'motion') IS DISTINCT FROM 'boolean')
        OR ((p->'configurations'->k) ? 'embers' AND jsonb_typeof(p->'configurations'->k->'embers') IS DISTINCT FROM 'number') THEN
        RAISE EXCEPTION 'Invalid Gothic Empress settings' USING ERRCODE = '22023';
      END IF;
      IF (p->'configurations'->k) ? 'embers' AND (p->'configurations'->k->>'embers')::numeric NOT BETWEEN 0 AND 1 THEN
        RAISE EXCEPTION 'Invalid Gothic Empress ember intensity' USING ERRCODE = '22023';
      END IF;
    ELSIF k = 'midnight-lofi' THEN
      IF jsonb_typeof(p->'configurations'->k) IS DISTINCT FROM 'object'
        OR p->'configurations'->k->'version' IS DISTINCT FROM '1'::jsonb
        OR ((p->'configurations'->k) ? 'motion' AND jsonb_typeof(p->'configurations'->k->'motion') IS DISTINCT FROM 'boolean')
        OR ((p->'configurations'->k) ? 'glowIntensity' AND jsonb_typeof(p->'configurations'->k->'glowIntensity') IS DISTINCT FROM 'number') THEN
        RAISE EXCEPTION 'Invalid Midnight Lo-Fi settings' USING ERRCODE = '22023';
      END IF;
      IF (p->'configurations'->k) ? 'glowIntensity' AND (p->'configurations'->k->>'glowIntensity')::numeric NOT BETWEEN 0 AND 1 THEN
        RAISE EXCEPTION 'Invalid Midnight Lo-Fi glow intensity' USING ERRCODE = '22023';
      END IF;
      IF (p->'configurations'->k) ? 'music' THEN
        IF jsonb_typeof(p->'configurations'->k->'music') IS DISTINCT FROM 'object'
          OR length(COALESCE(p->'configurations'->k->'music'->>'url','')) > 2048
          OR (COALESCE(p->'configurations'->k->'music'->>'url','') <> '' AND COALESCE(p->'configurations'->k->'music'->>'url','') !~ '^https://[^/@[:space:]]+(/|$)')
          OR length(COALESCE(p->'configurations'->k->'music'->>'title','')) > 100 THEN
          RAISE EXCEPTION 'Invalid Midnight Lo-Fi audio settings' USING ERRCODE = '22023';
        END IF;
        IF (p->'configurations'->k->'music') ? 'volume' THEN
          IF jsonb_typeof(p->'configurations'->k->'music'->'volume') IS DISTINCT FROM 'number' THEN
            RAISE EXCEPTION 'Invalid music volume' USING ERRCODE = '22023';
          END IF;
          IF (p->'configurations'->k->'music'->>'volume')::numeric NOT BETWEEN 0 AND 1 THEN
            RAISE EXCEPTION 'Invalid music volume' USING ERRCODE = '22023';
          END IF;
        END IF;
      END IF;
    ELSIF k = 'komorebi' THEN
      IF jsonb_typeof(p->'configurations'->k) IS DISTINCT FROM 'object' OR p->'configurations'->k->'version' IS DISTINCT FROM '1'::jsonb THEN
        RAISE EXCEPTION 'Invalid Komorebi settings' USING ERRCODE = '22023';
      END IF;
    ELSIF k <> 'default' THEN RAISE EXCEPTION 'Unknown profile theme' USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF p->>'selected' IN ('sekaipop','uchiha','gothic-empress','midnight-lofi','komorebi') AND NOT (p->'configurations' ? (p->>'selected')) THEN RAISE EXCEPTION 'Missing theme configuration' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(p->'presets') > 8 THEN RAISE EXCEPTION 'At most eight profile presets' USING ERRCODE = '22023'; END IF;
  FOR preset IN SELECT value FROM jsonb_array_elements(p->'presets') LOOP
    IF jsonb_typeof(preset->'id') IS DISTINCT FROM 'string' OR length(preset->>'id') NOT BETWEEN 1 AND 64
      OR jsonb_typeof(preset->'name') IS DISTINCT FROM 'string' OR length(preset->>'name') NOT BETWEEN 1 AND 40
      OR preset->>'theme' IS DISTINCT FROM 'sekaipop' THEN RAISE EXCEPTION 'Invalid theme preset' USING ERRCODE = '22023'; END IF;
    PERFORM public.validate_sekai_configuration(preset->'configuration');
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_profile_themes() FROM PUBLIC;


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
      IF COALESCE(cosmetic_settings->>'profileEffect','none') NOT IN ('none','rainfall','firefly') THEN cosmetic_settings := cosmetic_settings - 'profileEffect'; END IF;
      IF COALESCE(cosmetic_settings->>'avatarDecoration','none') NOT IN ('none','enso','kumihimo','shizuku','bamboo') THEN cosmetic_settings := cosmetic_settings - 'avatarDecoration'; END IF;
      IF COALESCE(cosmetic_settings->>'nameplate','none') NOT IN ('none','sumi','matcha','sakura-letter','hinoki','seigaiha') THEN cosmetic_settings := cosmetic_settings - 'nameplate'; END IF;
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
    OR decoration_key NOT IN ('none', 'celestial', 'sakura-wreath', 'imperial', 'crystal', 'seraph', 'lotus', 'eclipse', 'starlight', 'enso', 'kumihimo', 'kintsugi', 'tsukimi', 'mizuhiki', 'shizuku', 'bamboo', 'momiji', 'kitsune', 'pearl-tide', 'crimson-thorns')
    OR overlay_key NOT IN ('none', 'constellation', 'blossom', 'spirit', 'hologram', 'rainfall', 'firefly', 'ginkgo', 'aurora-silk', 'crimson-petals', 'moon-ripple')
    OR nameplate_key NOT IN ('none', 'moonstone', 'rose-quartz', 'gilded', 'opal', 'sumi', 'matcha', 'sakura-letter', 'yoru', 'honey-silk', 'wisteria', 'hinoki', 'seigaiha', 'akari', 'momiji-script', 'pearl', 'obsidian', 'aoi', 'vermillion') THEN
    RAISE EXCEPTION 'Unknown profile cosmetic' USING ERRCODE = '22023';
  END IF;
  IF NOT premium_access AND (effect_key IN ('moonlit', 'prism', 'embers', 'ocean')
    OR decoration_key NOT IN ('none', 'enso', 'kumihimo', 'shizuku', 'bamboo') OR overlay_key NOT IN ('none','rainfall','firefly') OR nameplate_key NOT IN ('none', 'sumi', 'matcha', 'sakura-letter', 'hinoki', 'seigaiha')) THEN
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
    ((app_settings -> 'profile') - CASE WHEN COALESCE(app_settings#>>'{profile,profileEffect}','none') IN ('none','rainfall','firefly') THEN '__no_cosmetic_key__' ELSE 'profileEffect' END
      - CASE WHEN COALESCE(app_settings#>>'{profile,avatarDecoration}','none') IN ('none','enso','kumihimo','shizuku','bamboo') THEN '__no_cosmetic_key__' ELSE 'avatarDecoration' END
      - CASE WHEN COALESCE(app_settings#>>'{profile,nameplate}','none') IN ('none','sumi','matcha','sakura-letter','hinoki','seigaiha') THEN '__no_cosmetic_key__' ELSE 'nameplate' END)
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


COMMIT;
