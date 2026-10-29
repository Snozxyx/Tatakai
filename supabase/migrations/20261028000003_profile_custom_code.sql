CREATE TABLE public.profile_custom_code (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 version integer NOT NULL DEFAULT 1 CHECK(version=1),
 enabled boolean NOT NULL DEFAULT false,
 html text NOT NULL DEFAULT '' CHECK(length(html)<=20000),
 css text NOT NULL DEFAULT '' CHECK(length(css)<=20000),
 placement text NOT NULL DEFAULT 'bottom' CHECK(placement IN('top','bottom'))
);
ALTER TABLE public.profile_custom_code ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_custom_code FROM PUBLIC,anon,authenticated;
CREATE POLICY profile_code_read ON public.profile_custom_code FOR SELECT USING(
 user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=profile_custom_code.user_id AND p.is_public=true));
CREATE POLICY profile_code_owner_insert ON public.profile_custom_code FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
CREATE POLICY profile_code_owner_update ON public.profile_custom_code FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
GRANT SELECT ON public.profile_custom_code TO anon,authenticated;
GRANT INSERT,UPDATE ON public.profile_custom_code TO authenticated;
