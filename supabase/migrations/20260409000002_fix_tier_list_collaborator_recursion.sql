-- Fix infinite recursion in tier_list_collaborators / tier_lists RLS policies

-- Helper: check ownership without depending on collaborator policies.
CREATE OR REPLACE FUNCTION public.is_tier_list_owner(tier_list_id_param uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tier_lists t
    WHERE t.id = tier_list_id_param
      AND t.user_id = auth.uid()
  );
$$;

-- Helper: check collaborator status without triggering recursive RLS evaluation.
CREATE OR REPLACE FUNCTION public.is_tier_list_collaborator(
  tier_list_id_param uuid,
  allowed_roles text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tier_list_collaborators tc
    WHERE tc.tier_list_id = tier_list_id_param
      AND tc.user_id = auth.uid()
      AND (
        allowed_roles IS NULL
        OR array_length(allowed_roles, 1) IS NULL
        OR tc.role = ANY(allowed_roles)
      )
  );
$$;

-- Helper: who can read collaborator lists.
CREATE OR REPLACE FUNCTION public.can_view_tier_list_collaborators(tier_list_id_param uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tier_lists t
    WHERE t.id = tier_list_id_param
      AND (
        t.is_public = true
        OR t.user_id = auth.uid()
      )
  )
  OR public.is_tier_list_collaborator(tier_list_id_param, NULL);
$$;

-- Replace collaborator-table policies with non-recursive checks.
DROP POLICY IF EXISTS "Users can view tier list collaborators" ON public.tier_list_collaborators;
DROP POLICY IF EXISTS "Tier list owners can add collaborators" ON public.tier_list_collaborators;
DROP POLICY IF EXISTS "Tier list owners can update collaborators" ON public.tier_list_collaborators;
DROP POLICY IF EXISTS "Tier list owners can remove collaborators" ON public.tier_list_collaborators;

CREATE POLICY "Users can view tier list collaborators"
  ON public.tier_list_collaborators
  FOR SELECT
  USING (
    public.can_view_tier_list_collaborators(tier_list_id)
  );

CREATE POLICY "Tier list owners can add collaborators"
  ON public.tier_list_collaborators
  FOR INSERT
  WITH CHECK (
    public.is_tier_list_owner(tier_list_id)
  );

CREATE POLICY "Tier list owners can update collaborators"
  ON public.tier_list_collaborators
  FOR UPDATE
  USING (
    public.is_tier_list_owner(tier_list_id)
  )
  WITH CHECK (
    public.is_tier_list_owner(tier_list_id)
  );

CREATE POLICY "Tier list owners can remove collaborators"
  ON public.tier_list_collaborators
  FOR DELETE
  USING (
    public.is_tier_list_owner(tier_list_id)
  );

-- Replace tier_lists collaborator policies with helper function checks.
DROP POLICY IF EXISTS "Collaborators can view private tier lists" ON public.tier_lists;
DROP POLICY IF EXISTS "Collaborators can update tier lists" ON public.tier_lists;

CREATE POLICY "Collaborators can view private tier lists"
  ON public.tier_lists
  FOR SELECT
  USING (
    public.is_tier_list_collaborator(id, NULL)
  );

CREATE POLICY "Collaborators can update tier lists"
  ON public.tier_lists
  FOR UPDATE
  USING (
    public.is_tier_list_collaborator(id, ARRAY['editor', 'owner'])
  )
  WITH CHECK (
    public.is_tier_list_collaborator(id, ARRAY['editor', 'owner'])
  );

GRANT EXECUTE ON FUNCTION public.is_tier_list_owner(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_tier_list_collaborator(uuid, text[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_view_tier_list_collaborators(uuid) TO authenticated, anon;
