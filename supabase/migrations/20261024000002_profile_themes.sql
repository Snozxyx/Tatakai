-- Opt-in profile presentations. Existing cosmetics and their entitlement stay separate.
-- Run this entire file as SQL, including every function's closing dollar quote.
BEGIN;

CREATE OR REPLACE FUNCTION public.has_custom_profile_access(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user_id AND (is_admin = true OR role = 'admin'))
    OR EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = p_user_id AND badge_key IN ('booster','premium-pro','premium-ultra'));
$$;
REVOKE ALL ON FUNCTION public.has_custom_profile_access(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.validate_sekai_configuration(p jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE w jsonb; m jsonb; k text; ids text[] := '{}'; singletons text[] := '{}'; mobile_ids text[] := '{}';
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM '1'
    OR jsonb_typeof(p->'widgets') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p->'mobile') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p->'colors') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p->'wallpaper') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid SekaiPop settings' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p->'widgets') NOT BETWEEN 1 AND 32 OR jsonb_array_length(p->'mobile') > 32
    OR COALESCE(p->>'mode','') NOT IN ('light','dark','darker')
    OR jsonb_typeof(p->'palette') IS DISTINCT FROM 'string' OR length(p->>'palette') > 30
    OR jsonb_typeof(p->'motion') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p->'stickers') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Invalid SekaiPop appearance' USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['ink','primary','secondary','paper'] LOOP
    IF jsonb_typeof(p->'colors'->k) IS DISTINCT FROM 'string' OR (p->'colors'->>k) !~ '^#[0-9a-fA-F]{6}$' THEN
      RAISE EXCEPTION 'Invalid profile color' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['radius','shadow'] LOOP
    IF jsonb_typeof(p->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid card dimensions' USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF (p->>'radius')::numeric NOT BETWEEN 4 AND 28 OR (p->>'shadow')::numeric NOT BETWEEN 0 AND 10 THEN
    RAISE EXCEPTION 'Card dimensions out of range' USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['x','y','dim','blur'] LOOP
    IF jsonb_typeof(p->'wallpaper'->k) IS DISTINCT FROM 'number' OR (p->'wallpaper'->>k)::numeric < 0 THEN
      RAISE EXCEPTION 'Invalid wallpaper settings' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (p#>>'{wallpaper,x}')::numeric > 100 OR (p#>>'{wallpaper,y}')::numeric > 100
    OR (p#>>'{wallpaper,dim}')::numeric > 80 OR (p#>>'{wallpaper,blur}')::numeric > 20
    OR jsonb_typeof(p#>'{wallpaper,url}') IS DISTINCT FROM 'string'
    OR length(p#>>'{wallpaper,url}') > 2048
    OR ((p#>>'{wallpaper,url}') <> '' AND (p#>>'{wallpaper,url}') !~ '^https://[^/@[:space:]]+([/:?#]|$)') THEN
    RAISE EXCEPTION 'Invalid wallpaper URL or crop' USING ERRCODE = '22023';
  END IF;
  FOR w IN SELECT value FROM jsonb_array_elements(p->'widgets') LOOP
    IF jsonb_typeof(w) IS DISTINCT FROM 'object' OR COALESCE(w->>'kind','') NOT IN
      ('identity','stats','streaks','activity','favorites','library','badges','links','clock','calendar','note','image')
      OR jsonb_typeof(w->'id') IS DISTINCT FROM 'string' OR (w->>'id') !~ '^[a-zA-Z0-9-]{1,64}$'
      OR (w->>'id') = ANY(ids) OR jsonb_typeof(w->'visible') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Invalid profile widget' USING ERRCODE = '22023';
    END IF;
    ids := array_append(ids,w->>'id');
    IF w->>'kind' NOT IN ('note','image') THEN
      IF (w->>'kind') = ANY(singletons) THEN RAISE EXCEPTION 'Duplicate profile widget' USING ERRCODE = '22023'; END IF;
      singletons := array_append(singletons,w->>'kind');
    END IF;
    IF w->>'kind' = 'identity' AND w->>'visible' <> 'true' THEN RAISE EXCEPTION 'The player card is required' USING ERRCODE = '22023'; END IF;
    FOREACH k IN ARRAY ARRAY['x','y','w','h','z','rotation'] LOOP
      IF jsonb_typeof(w->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid widget position' USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF (w->>'w')::numeric NOT BETWEEN 200 AND 900 OR (w->>'h')::numeric NOT BETWEEN 160 AND 900
      OR (w->>'x')::numeric < 0 OR (w->>'y')::numeric < 0
      OR (w->>'x')::numeric + (w->>'w')::numeric > 1144 OR (w->>'y')::numeric + (w->>'h')::numeric > 4000
      OR (w->>'rotation')::numeric NOT BETWEEN -12 AND 12 OR (w->>'z')::numeric NOT BETWEEN 0 AND 100 THEN
      RAISE EXCEPTION 'Widget outside scrapbook bounds' USING ERRCODE = '22023';
    END IF;
    FOREACH k IN ARRAY ARRAY['title','text','image'] LOOP
      IF jsonb_typeof(w->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid widget content' USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF length(w->>'title') > 60 OR length(w->>'text') > 2000 OR length(w->>'image') > 2048
      OR ((w->>'image') <> '' AND (w->>'image') !~ '^https://[^/@[:space:]]+([/:?#]|$)') THEN
      RAISE EXCEPTION 'Invalid widget content length or image URL' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF NOT ('identity' = ANY(singletons)) THEN RAISE EXCEPTION 'The player card is required' USING ERRCODE = '22023'; END IF;
  FOR m IN SELECT value FROM jsonb_array_elements(p->'mobile') LOOP
    IF jsonb_typeof(m->'id') IS DISTINCT FROM 'string' OR NOT ((m->>'id') = ANY(ids))
      OR (m->>'id') = ANY(mobile_ids) OR COALESCE(m->>'width','') NOT IN ('full','half') THEN
      RAISE EXCEPTION 'Invalid phone layout' USING ERRCODE = '22023';
    END IF;
    mobile_ids := array_append(mobile_ids,m->>'id');
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_sekai_configuration(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.enforce_profile_themes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p jsonb; old_p jsonb := '{}'::jsonb; k text; preset jsonb; access boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN old_p := COALESCE(OLD.app_settings->'profileThemes','{}'::jsonb); END IF;
  p := NEW.app_settings->'profileThemes';
  access := COALESCE(NEW.is_admin,false) OR COALESCE(NEW.role = 'admin',false)
    OR EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = NEW.user_id AND badge_key IN ('booster','premium-pro','premium-ultra'));
  -- A role revocation returns to Default without destroying the saved scrapbook.
  IF TG_OP = 'UPDATE' AND NOT access AND (COALESCE(OLD.is_admin,false) OR COALESCE(OLD.role = 'admin',false)) AND p->>'selected' <> 'default' THEN
    p := jsonb_set(p,'{selected}','"default"'::jsonb);
    NEW.app_settings := jsonb_set(NEW.app_settings,'{profileThemes}',p);
  END IF;
  IF p IS NOT DISTINCT FROM old_p OR (p IS NULL AND old_p = '{}'::jsonb) THEN RETURN NEW; END IF;
  IF p IS NULL THEN
    IF old_p <> '{}'::jsonb THEN RAISE EXCEPTION 'Preserve saved profile themes when updating app settings' USING ERRCODE = '22023'; END IF;
    RETURN NEW;
  END IF;
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM '1'
    OR COALESCE(p->>'selected','') NOT IN ('default','sekaipop')
    OR jsonb_typeof(p->'configurations') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p->'presets') IS DISTINCT FROM 'array' OR octet_length(p::text) > 524288 THEN
    RAISE EXCEPTION 'Invalid profile theme preferences' USING ERRCODE = '22023';
  END IF;
  IF NOT access AND (p->>'selected' <> 'default' OR p->'configurations' IS DISTINCT FROM COALESCE(old_p->'configurations','{}'::jsonb)
    OR p->'presets' IS DISTINCT FROM COALESCE(old_p->'presets','[]'::jsonb)) THEN
    RAISE EXCEPTION 'Custom profiles require Booster, Premium Pro, Premium Ultra, or Admin access' USING ERRCODE = '42501';
  END IF;
  FOR k IN SELECT jsonb_object_keys(p->'configurations') LOOP
    IF k = 'sekaipop' THEN PERFORM public.validate_sekai_configuration(p->'configurations'->k);
    ELSIF k <> 'default' THEN RAISE EXCEPTION 'Unknown profile theme' USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF p->>'selected' = 'sekaipop' AND NOT (p->'configurations' ? 'sekaipop') THEN RAISE EXCEPTION 'Missing theme configuration' USING ERRCODE = '22023'; END IF;
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
DROP TRIGGER IF EXISTS enforce_profile_themes ON public.profiles;
CREATE TRIGGER enforce_profile_themes BEFORE INSERT OR UPDATE OF app_settings,is_admin,role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_themes();

CREATE OR REPLACE FUNCTION public.save_profile_themes(p_preferences jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to customize your profile' USING ERRCODE = '42501'; END IF;
  -- UPDATE takes a row lock; jsonb_set reads the latest row, preserving other settings.
  UPDATE public.profiles SET app_settings = jsonb_set(COALESCE(app_settings,'{}'::jsonb),'{profileThemes}',p_preferences,true)
    WHERE user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.save_profile_themes(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_profile_themes(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.deactivate_revoked_profile_theme()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.badge_key IN ('booster','premium-pro','premium-ultra') AND NOT public.has_custom_profile_access(OLD.user_id) THEN
    UPDATE public.profiles SET app_settings = jsonb_set(app_settings,'{profileThemes,selected}','"default"'::jsonb)
      WHERE user_id = OLD.user_id AND app_settings#>>'{profileThemes,selected}' = 'sekaipop';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.deactivate_revoked_profile_theme() FROM PUBLIC;
DROP TRIGGER IF EXISTS deactivate_revoked_profile_theme ON public.user_badges;
CREATE TRIGGER deactivate_revoked_profile_theme AFTER DELETE OR UPDATE OF badge_key,user_id ON public.user_badges
  FOR EACH ROW EXECUTE FUNCTION public.deactivate_revoked_profile_theme();

COMMIT;
