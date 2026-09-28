-- =============================================================================
-- Staff audit log: make admin/mod actions actually recorded
--
-- `public.admin_logs` is absent from the live DB (see 20260902000004). Eleven
-- client sites insert into it and discard the returned error, so the audit
-- trail is silently empty. This migration:
--   (a) ensures the table exists (idempotent; safe whether or not 20260902000004
--       ran first),
--   (b) adds target_user_id so user-directed actions (ban, role change,
--       privilege toggle) are queryable per affected user, and
--   (c) adds a SECURITY DEFINER log_staff_action() RPC: one server-side,
--       staff-gated funnel that cannot be silently dropped and whose actor is
--       always auth.uid() (callers cannot forge it).
--
-- WRITTEN, NOT APPLIED — repo standing rule.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb,
  ip_address text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admin_logs_pkey PRIMARY KEY (id),
  CONSTRAINT admin_logs_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE SET NULL
);

-- The user an action was performed *against* (nullable: many actions target
-- content, not a person). auth.users id space; SET NULL so the trail outlives
-- the target's deletion.
ALTER TABLE public.admin_logs
  ADD COLUMN IF NOT EXISTS target_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'admin_logs_target_user_id_fkey'
      AND table_name = 'admin_logs'
  ) THEN
    ALTER TABLE public.admin_logs
      ADD CONSTRAINT admin_logs_target_user_id_fkey
      FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON public.admin_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON public.admin_logs (action);
CREATE INDEX IF NOT EXISTS idx_admin_logs_entity_type ON public.admin_logs (entity_type);
CREATE INDEX IF NOT EXISTS idx_admin_logs_user_id ON public.admin_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target_user_id ON public.admin_logs (target_user_id);

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Moderators can view admin logs" ON public.admin_logs;
CREATE POLICY "Moderators can view admin logs"
  ON public.admin_logs FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE profiles.user_id = auth.uid()
              AND (profiles.is_admin = true OR profiles.is_moderator = true
                   OR profiles.role = ANY (ARRAY['admin'::text,'moderator'::text]))));

DROP POLICY IF EXISTS "Moderators can insert admin logs" ON public.admin_logs;
CREATE POLICY "Moderators can insert admin logs"
  ON public.admin_logs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE profiles.user_id = auth.uid()
              AND (profiles.is_admin = true OR profiles.is_moderator = true
                   OR profiles.role = ANY (ARRAY['admin'::text,'moderator'::text]))));

DROP POLICY IF EXISTS "Admins can delete admin logs" ON public.admin_logs;
CREATE POLICY "Admins can delete admin logs"
  ON public.admin_logs FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE profiles.user_id = auth.uid()
              AND (profiles.is_admin = true OR profiles.role = 'admin')));

GRANT SELECT, INSERT, DELETE ON public.admin_logs TO authenticated;
GRANT ALL ON public.admin_logs TO service_role;

-- -----------------------------------------------------------------------------
-- Shared staff predicate is_staff(), used by every SECURITY DEFINER RPC in this
-- batch (storage quota, privileges, sessions, post flags). SECURITY DEFINER +
-- fixed search_path so a caller with no direct SELECT on profiles still gets a
-- correct answer that cannot be shadowed. Mirrors the profiles-based derivation
-- the client uses (src/lib/roles.ts) and set_staff_role (20260902000003).
--
-- We deliberately do NOT define is_admin_user(uuid) here: it already exists in
-- the live DB and RLS policies on community_groups depend on it, so redefining
-- collides (CREATE OR REPLACE can't change its signature) and dropping it would
-- need CASCADE — which would take those policies with it. Nothing in this batch
-- needs an admin-strict predicate; every RPC below gates on is_staff.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff(p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = p_uid
      AND (is_admin = true OR is_moderator = true
           OR role = ANY (ARRAY['admin'::text,'moderator'::text]))
  );
$$;

REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- log_staff_action(): the single funnel. SECURITY DEFINER so it writes even
-- from a caller path that lacks the INSERT policy, but it re-checks staff
-- itself first, so a non-staff caller raises rather than writing. Actor is
-- always auth.uid().
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_staff_action(
  p_action text,
  p_entity_type text,
  p_entity_id text DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL,
  p_ip text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_staff boolean;
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_is_staff := public.is_staff(v_actor);

  IF v_is_staff IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.admin_logs
    (user_id, action, entity_type, entity_id, details, target_user_id, ip_address)
  VALUES
    (v_actor, p_action, p_entity_type, p_entity_id, p_details, p_target_user_id, p_ip)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_staff_action(text,text,text,jsonb,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_staff_action(text,text,text,jsonb,uuid,text) TO authenticated;

COMMENT ON TABLE public.admin_logs IS
  'Append-only staff audit trail. Staff read/insert, admins delete, nobody updates. Actor user_id and target_user_id are auth.users ids and survive deletion as NULL.';
