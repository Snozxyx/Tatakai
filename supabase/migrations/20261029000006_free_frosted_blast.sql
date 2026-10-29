-- Make only Frosted Blast free for every account; retain other entitlement and configuration guards.
CREATE OR REPLACE FUNCTION public.enforce_profile_themes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p jsonb; old_p jsonb := '{}'::jsonb; k text; preset jsonb; access boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN old_p := COALESCE(OLD.app_settings->'profileThemes','{}'::jsonb); END IF;
  p := NEW.app_settings->'profileThemes';
  access := COALESCE(NEW.is_admin,false) OR COALESCE(NEW.role = 'admin',false)
    OR EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = NEW.user_id AND badge_key IN ('booster','premium-pro','premium-ultra'));
  -- A role revocation returns to Default without destroying the saved scrapbook.
  IF TG_OP = 'UPDATE' AND NOT access AND (COALESCE(OLD.is_admin,false) OR COALESCE(OLD.role = 'admin',false)) AND p->>'selected' NOT IN ('default','frosted-blast') AND NOT public.owns_profile_theme(NEW.user_id,p->>'selected') THEN
    p := jsonb_set(p,'{selected}','"default"'::jsonb);
    NEW.app_settings := jsonb_set(NEW.app_settings,'{profileThemes}',p);
  END IF;
  IF p IS NOT DISTINCT FROM old_p OR (p IS NULL AND old_p = '{}'::jsonb) THEN RETURN NEW; END IF;
  IF p IS NULL THEN
    IF old_p <> '{}'::jsonb THEN RAISE EXCEPTION 'Preserve saved profile themes when updating app settings' USING ERRCODE = '22023'; END IF;
    RETURN NEW;
  END IF;
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM '1'
    OR COALESCE(p->>'selected','') NOT IN ('default','sekaipop','uchiha','gothic-empress','midnight-lofi','komorebi','sakura-letter','cloud-notebook','eyes-toward-heaven','frosted-blast')
    OR jsonb_typeof(p->'configurations') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p->'presets') IS DISTINCT FROM 'array' OR octet_length(p::text) > 524288 THEN
    RAISE EXCEPTION 'Invalid profile theme preferences' USING ERRCODE = '22023';
  END IF;
  IF NOT access AND ((p->>'selected' NOT IN ('default','frosted-blast') AND NOT public.owns_profile_theme(NEW.user_id,p->>'selected'))
    OR (NOT public.owns_profile_theme(NEW.user_id,'sekaipop') AND p->'presets' IS DISTINCT FROM COALESCE(old_p->'presets','[]'::jsonb))) THEN
    RAISE EXCEPTION 'Claim this theme or unlock custom profile access first' USING ERRCODE='42501';
  END IF;
  IF NOT access AND EXISTS(SELECT 1 FROM jsonb_object_keys(COALESCE(old_p->'configurations','{}'::jsonb)) AS keys(key)
    WHERE NOT (p->'configurations' ? key)) THEN
    RAISE EXCEPTION 'Preserve saved theme configurations' USING ERRCODE='22023';
  END IF;
  FOR k IN SELECT jsonb_object_keys(p->'configurations') LOOP
    IF NOT access AND k NOT IN ('default','frosted-blast') AND NOT public.owns_profile_theme(NEW.user_id,k)
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
    ELSIF k IN ('komorebi','sakura-letter','cloud-notebook') THEN
      IF jsonb_typeof(p->'configurations'->k) IS DISTINCT FROM 'object' OR p->'configurations'->k->'version' IS DISTINCT FROM '1'::jsonb THEN
        RAISE EXCEPTION 'Invalid notebook theme settings' USING ERRCODE = '22023';
      END IF;
      IF k IN ('sakura-letter','cloud-notebook') THEN
        IF length(coalesce(p->'configurations'->k->>'musicUrl','')) > 2048
          OR (coalesce(p->'configurations'->k->>'musicUrl','') <> '' AND (p->'configurations'->k->>'musicUrl') !~ '^https://[^/@[:space:]]+(/|$)')
          OR length(coalesce(p->'configurations'->k->>'note','')) > 1000 THEN
          RAISE EXCEPTION 'Invalid notebook media or note';
        END IF;
      END IF;
    ELSIF k IN ('eyes-toward-heaven','frosted-blast') THEN
      IF jsonb_typeof(p->'configurations'->k) IS DISTINCT FROM 'object'
        OR p->'configurations'->k->'version' IS DISTINCT FROM '1'::jsonb
        OR jsonb_typeof(p->'configurations'->k->'motion') IS DISTINCT FROM 'boolean'
        OR coalesce(p->'configurations'->k->>'palette','') NOT IN ('sky','lavender','sage')
        OR coalesce(p->'configurations'->k->>'surface','') NOT IN ('glass','solid')
        OR jsonb_typeof(p->'configurations'->k->'dim') IS DISTINCT FROM 'number'
        OR jsonb_typeof(p->'configurations'->k->'scenePosition') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Invalid Eyes Toward Heaven settings' USING ERRCODE='22023';
      END IF;
      IF (p->'configurations'->k->>'dim')::numeric NOT BETWEEN 0 AND 0.6
        OR (p->'configurations'->k->>'scenePosition')::numeric NOT BETWEEN 0 AND 100 THEN
        RAISE EXCEPTION 'Invalid Eyes Toward Heaven framing' USING ERRCODE='22023';
      END IF;
      IF k='frosted-blast' AND (
        jsonb_typeof(p->'configurations'->k->'backgroundUrl') IS DISTINCT FROM 'string'
        OR length(p->'configurations'->k->>'backgroundUrl')>2048
        OR (p->'configurations'->k->>'backgroundUrl'<>'' AND (p->'configurations'->k->>'backgroundUrl') !~ '^https://[^/@[:space:]]+(/|$)')
        OR coalesce(p->'configurations'->k->>'seed','') !~ '^#[0-9a-fA-F]{6}$'
        OR p->'configurations'->k->'motion' IS DISTINCT FROM 'false'::jsonb
      ) THEN RAISE EXCEPTION 'Invalid Frosted Blast background' USING ERRCODE='22023'; END IF;
    ELSIF k <> 'default'  THEN RAISE EXCEPTION 'Unknown profile theme' USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF p->>'selected' IN ('sekaipop','uchiha','gothic-empress','midnight-lofi','komorebi','sakura-letter','cloud-notebook','eyes-toward-heaven','frosted-blast') AND NOT (p->'configurations' ? (p->>'selected')) THEN RAISE EXCEPTION 'Missing theme configuration' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(p->'presets') > 8 THEN RAISE EXCEPTION 'At most eight profile presets' USING ERRCODE = '22023'; END IF;
  FOR preset IN SELECT value FROM jsonb_array_elements(p->'presets') LOOP
    IF jsonb_typeof(preset->'id') IS DISTINCT FROM 'string' OR length(preset->>'id') NOT BETWEEN 1 AND 64
      OR jsonb_typeof(preset->'name') IS DISTINCT FROM 'string' OR length(preset->>'name') NOT BETWEEN 1 AND 40
      OR preset->>'theme' IS DISTINCT FROM 'sekaipop' THEN RAISE EXCEPTION 'Invalid theme preset' USING ERRCODE = '22023'; END IF;
    PERFORM public.validate_sekai_configuration(preset->'configuration');
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.deactivate_revoked_profile_theme()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF OLD.badge_key IN ('booster','premium-pro','premium-ultra') AND NOT public.has_custom_profile_access(OLD.user_id) THEN
    UPDATE public.profiles SET app_settings = jsonb_set(app_settings,'{profileThemes,selected}','"default"'::jsonb)
      WHERE user_id = OLD.user_id AND NOT public.owns_profile_theme(OLD.user_id,app_settings#>>'{profileThemes,selected}') AND app_settings#>>'{profileThemes,selected}' IN ('sekaipop','uchiha','gothic-empress','midnight-lofi','komorebi','sakura-letter','cloud-notebook','eyes-toward-heaven');
  END IF;
  RETURN OLD;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_profile_themes(), public.deactivate_revoked_profile_theme() FROM PUBLIC;
