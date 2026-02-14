-- Allow moderators to view and update suggestions (review); keep delete admin-only.
-- Moderators are identified via user_roles.role = 'moderator'.

-- Moderators can view all suggestions
DROP POLICY IF EXISTS "Moderators can view all suggestions" ON public.user_suggestions;
CREATE POLICY "Moderators can view all suggestions"
ON public.user_suggestions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'moderator'
  )
);

-- Moderators can update any suggestion (review)
DROP POLICY IF EXISTS "Moderators can update any suggestion" ON public.user_suggestions;
CREATE POLICY "Moderators can update any suggestion"
ON public.user_suggestions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'moderator'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'moderator'
  )
);

-- Allow moderators to view and insert admin_logs (staff activity / review actions)
DROP POLICY IF EXISTS "Moderators can view admin logs" ON public.admin_logs;
CREATE POLICY "Moderators can view admin logs"
ON public.admin_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'moderator'
  )
);

DROP POLICY IF EXISTS "Moderators can insert admin logs" ON public.admin_logs;
CREATE POLICY "Moderators can insert admin logs"
ON public.admin_logs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'moderator'
  )
);
