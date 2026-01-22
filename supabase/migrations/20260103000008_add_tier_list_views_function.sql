-- Add function to increment tier list views (bypasses RLS)
CREATE OR REPLACE FUNCTION public.increment_tier_list_views(tier_list_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tier_lists
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = tier_list_id;
END;
$$;

-- Grant execute permission to all authenticated users
GRANT EXECUTE ON FUNCTION public.increment_tier_list_views(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_tier_list_views(uuid) TO anon;
