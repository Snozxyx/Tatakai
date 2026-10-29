-- Replace the experimental HTML section with an independently equipped profile theme.
ALTER TABLE public.profile_custom_code ADD COLUMN theme_name text NOT NULL DEFAULT 'My custom theme'
  CHECK(length(trim(theme_name)) BETWEEN 1 AND 60);
-- Preserve old code as a draft; an old section must not silently replace a whole profile.
UPDATE public.profile_custom_code SET enabled=false;
ALTER TABLE public.profile_custom_code ADD CONSTRAINT custom_theme_not_empty CHECK(NOT enabled OR length(trim(html))>0);
DROP POLICY profile_code_read ON public.profile_custom_code;
CREATE POLICY profile_code_read ON public.profile_custom_code FOR SELECT USING(user_id=auth.uid() OR EXISTS(
 SELECT 1 FROM public.profiles p WHERE p.user_id=profile_custom_code.user_id AND p.is_public=true AND NOT coalesce(p.is_banned,false)));
DROP POLICY profile_code_owner_insert ON public.profile_custom_code;
CREATE POLICY profile_code_owner_insert ON public.profile_custom_code FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND EXISTS(
 SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND NOT coalesce(p.is_banned,false)));
DROP POLICY profile_code_owner_update ON public.profile_custom_code;
CREATE POLICY profile_code_owner_update ON public.profile_custom_code FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid() AND EXISTS(
 SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND NOT coalesce(p.is_banned,false)));

CREATE FUNCTION public.save_profile_custom_theme(p_name text,p_html text,p_css text,p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to create a theme'; END IF;
 PERFORM 1 FROM profiles WHERE user_id=auth.uid() AND NOT coalesce(is_banned,false) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Profile unavailable'; END IF;
 INSERT INTO profile_custom_code(user_id,theme_name,html,css,enabled)
 VALUES(auth.uid(),trim(p_name),p_html,p_css,p_enabled)
 ON CONFLICT(user_id) DO UPDATE SET theme_name=excluded.theme_name,html=excluded.html,css=excluded.css,enabled=excluded.enabled;
END;
$$;
-- Equip built-in themes and disable the HTML theme in the same transaction.
-- Existing validation and premium entitlement checks remain in save_profile_themes.
CREATE FUNCTION public.equip_profile_theme(p_preferences jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to equip a theme'; END IF;
 PERFORM public.save_profile_themes(p_preferences);
 UPDATE profile_custom_code SET enabled=false WHERE user_id=auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.save_profile_custom_theme(text,text,text,boolean),public.equip_profile_theme(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_profile_custom_theme(text,text,text,boolean),public.equip_profile_theme(jsonb) TO authenticated;
