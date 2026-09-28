-- =============================================================================
-- Per-user privilege toggles (disable comment / post / tierlist / upload /
-- community access from the admin panel)
--
-- None of these existed (only privacy flags did). We add five boolean flags to
-- profiles (default true), a whitelisted user_has_privilege() reader, a
-- staff-only set_user_privilege() writer (logged), and RESTRICTIVE insert
-- policies so a revoked privilege actually blocks the action.
--
-- RESTRICTIVE (AND-combined) rather than editing existing permissive policies:
-- non-invasive, and it fail-opens if a policy references a not-yet-present
-- column. The new columns are outside 20260902000003's column-level UPDATE
-- grant, so users cannot self-toggle them — only set_user_privilege() (SECURITY
-- DEFINER) can. Requires public.is_staff()/log_staff_action() from
-- 20260925000000.
--
-- WRITTEN, NOT APPLIED — repo standing rule.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_comment          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_post             boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_tierlist         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_upload           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_access_community boolean NOT NULL DEFAULT true;

-- Whitelisted reader. Fail-open (true) when the row/column is absent so this
-- can be referenced by policies before every profile is backfilled.
CREATE OR REPLACE FUNCTION public.user_has_privilege(p_uid uuid, p_priv text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v boolean;
BEGIN
  IF p_priv NOT IN ('can_comment','can_post','can_tierlist','can_upload','can_access_community') THEN
    RAISE EXCEPTION 'unknown privilege %', p_priv;
  END IF;
  EXECUTE format('SELECT %I FROM public.profiles WHERE user_id = $1', p_priv)
    INTO v USING p_uid;
  RETURN COALESCE(v, true);
END;
$$;

-- Staff-only writer, logged to the audit trail.
CREATE OR REPLACE FUNCTION public.set_user_privilege(
  p_target_user_id uuid, p_privilege text, p_enabled boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_privilege NOT IN ('can_comment','can_post','can_tierlist','can_upload','can_access_community') THEN
    RAISE EXCEPTION 'unknown privilege %', p_privilege;
  END IF;
  EXECUTE format('UPDATE public.profiles SET %I = $1 WHERE user_id = $2', p_privilege)
    USING p_enabled, p_target_user_id;
  PERFORM public.log_staff_action('set_privilege', 'profile', p_target_user_id::text,
    jsonb_build_object('privilege', p_privilege, 'enabled', p_enabled), p_target_user_id, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.user_has_privilege(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_user_privilege(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_privilege(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_privilege(uuid, text, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- Enforcement: RESTRICTIVE insert policies. Each is guarded so re-runs are safe.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS priv_require_can_comment ON public.comments;
CREATE POLICY priv_require_can_comment ON public.comments
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_has_privilege(auth.uid(), 'can_comment'));

DROP POLICY IF EXISTS priv_require_can_post ON public.forum_posts;
CREATE POLICY priv_require_can_post ON public.forum_posts
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_privilege(auth.uid(), 'can_post')
    AND public.user_has_privilege(auth.uid(), 'can_access_community')
  );

DROP POLICY IF EXISTS priv_require_can_tierlist ON public.tier_lists;
CREATE POLICY priv_require_can_tierlist ON public.tier_lists
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_has_privilege(auth.uid(), 'can_tierlist'));

-- Uploads: only affects the user-media bucket; other buckets pass through.
DROP POLICY IF EXISTS priv_require_can_upload ON storage.objects;
CREATE POLICY priv_require_can_upload ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'user-media'
    OR public.user_has_privilege(auth.uid(), 'can_upload')
  );

COMMENT ON COLUMN public.profiles.can_comment IS 'Admin toggle; RESTRICTIVE RLS blocks comment inserts when false.';
COMMENT ON COLUMN public.profiles.can_post IS 'Admin toggle; blocks forum_posts inserts when false.';
COMMENT ON COLUMN public.profiles.can_tierlist IS 'Admin toggle; blocks tier_lists inserts when false.';
COMMENT ON COLUMN public.profiles.can_upload IS 'Admin toggle; blocks user-media uploads when false.';
COMMENT ON COLUMN public.profiles.can_access_community IS 'Admin toggle; blocks community posting when false.';
