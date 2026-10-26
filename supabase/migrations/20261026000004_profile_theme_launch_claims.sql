-- First 200 eligible accounts can claim the Japanese theme collection permanently.
BEGIN;
CREATE TABLE IF NOT EXISTS public.profile_theme_launch_campaign (
  id text PRIMARY KEY CHECK (id = 'japanese-launch'),
  claimed integer NOT NULL DEFAULT 0 CHECK (claimed BETWEEN 0 AND 200)
);
INSERT INTO public.profile_theme_launch_campaign(id) VALUES ('japanese-launch') ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.profile_theme_launch_claims (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  slot integer NOT NULL UNIQUE CHECK (slot BETWEEN 1 AND 200),
  claimed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.profile_theme_grants (
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  theme_id text NOT NULL CHECK (theme_id IN ('midnight-lofi','komorebi')),
  source text NOT NULL DEFAULT 'japanese-launch',
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,theme_id)
);
ALTER TABLE public.profile_theme_launch_campaign ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_theme_launch_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_theme_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_theme_launch_campaign, public.profile_theme_launch_claims, public.profile_theme_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profile_theme_grants TO anon, authenticated;
DROP POLICY IF EXISTS theme_grants_visible ON public.profile_theme_grants;
CREATE POLICY theme_grants_visible ON public.profile_theme_grants FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.owns_profile_theme(p_user_id uuid,p_theme_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profile_theme_grants WHERE user_id=p_user_id AND theme_id=p_theme_id);
$$;
REVOKE ALL ON FUNCTION public.owns_profile_theme(uuid,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.profile_theme_launch_eligible(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_user_id AND NOT COALESCE(is_admin,false) AND COALESCE(role,'') <> 'admin')
 AND NOT EXISTS(SELECT 1 FROM public.user_badges WHERE user_id=p_user_id AND badge_key IN ('booster','premium-go','premium-pro','premium-ultra'));
$$;
REVOKE ALL ON FUNCTION public.profile_theme_launch_eligible(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.profile_theme_launch_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT jsonb_build_object('remaining',200-claimed,'limit',200,
  'claimed',EXISTS(SELECT 1 FROM public.profile_theme_launch_claims WHERE user_id=auth.uid()),
  'eligible',public.profile_theme_launch_eligible(auth.uid()))
 FROM public.profile_theme_launch_campaign WHERE id='japanese-launch';
$$;
REVOKE ALL ON FUNCTION public.profile_theme_launch_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_theme_launch_status() TO authenticated;

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
 INSERT INTO public.profile_theme_grants(user_id,theme_id) VALUES(uid,'midnight-lofi'),(uid,'komorebi');
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
    OR p->'presets' IS DISTINCT FROM COALESCE(old_p->'presets','[]'::jsonb)) THEN
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

CREATE OR REPLACE FUNCTION public.deactivate_revoked_profile_theme()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.badge_key IN ('booster','premium-pro','premium-ultra') AND NOT public.has_custom_profile_access(OLD.user_id) THEN
    UPDATE public.profiles SET app_settings = jsonb_set(app_settings,'{profileThemes,selected}','"default"'::jsonb)
      WHERE user_id = OLD.user_id AND NOT public.owns_profile_theme(OLD.user_id,app_settings#>>'{profileThemes,selected}') AND app_settings#>>'{profileThemes,selected}' IN ('sekaipop','uchiha','gothic-empress','midnight-lofi','komorebi');
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.deactivate_revoked_profile_theme() FROM PUBLIC;


-- Original premium cosmetics: authoritative entitlement checks on profile JSON.
-- A legacy is_premium flag, moderator role, or collectible badge does not unlock them.

COMMIT;
