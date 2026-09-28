-- =============================================================================
-- Login tracking + active-session management
--
-- The admin panel needs IP / device / last-login visibility and the ability to
-- revoke sessions. profiles had none of this. We add:
--   * profiles.last_login_at, profiles.device_name (last-seen convenience copy),
--   * public.user_sessions — one row per (user, device), maintained by RPC,
--   * record_user_session() (self, on login/heartbeat), revoke_user_session()
--     and revoke_all_user_sessions() (self or staff),
--   * RLS: a user sees own sessions, staff see all; no direct DML (RPC only).
--
-- IPs/device ids are supplied by the client and are advisory, not trusted
-- identity. Requires public.is_staff() from 20260925000000.
--
-- WRITTEN, NOT APPLIED — repo standing rule.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS device_name   text;

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token text,
  ip_address    text,
  device_id     text,
  device_name   text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  CONSTRAINT user_sessions_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id     ON public.user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_seen   ON public.user_sessions (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active      ON public.user_sessions (user_id) WHERE revoked_at IS NULL;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own sessions" ON public.user_sessions;
CREATE POLICY "Users view own sessions" ON public.user_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

GRANT SELECT ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;

-- Record/refresh the caller's session and stamp last_login_at. Upserts by
-- (user_id, device_id) when a device id is supplied, else inserts a new row.
CREATE OR REPLACE FUNCTION public.record_user_session(
  p_session_token text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_device_name text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_device_id IS NOT NULL THEN
    UPDATE public.user_sessions
      SET last_seen_at = now(),
          ip_address   = COALESCE(p_ip, ip_address),
          device_name  = COALESCE(p_device_name, device_name),
          user_agent   = COALESCE(p_user_agent, user_agent),
          session_token= COALESCE(p_session_token, session_token),
          revoked_at   = NULL
      WHERE user_id = v_uid AND device_id = p_device_id
      RETURNING id INTO v_id;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.user_sessions
      (user_id, session_token, ip_address, device_id, device_name, user_agent)
    VALUES (v_uid, p_session_token, p_ip, p_device_id, p_device_name, p_user_agent)
    RETURNING id INTO v_id;
  END IF;

  UPDATE public.profiles
    SET last_login_at = now(),
        device_name   = COALESCE(p_device_name, device_name)
    WHERE user_id = v_uid;

  RETURN v_id;
END;
$$;

-- Revoke one session (owner or staff). Logged when a staff member revokes
-- someone else's.
CREATE OR REPLACE FUNCTION public.revoke_user_session(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.user_sessions WHERE id = p_session_id;
  IF v_owner IS NULL THEN
    RETURN;
  END IF;
  IF v_owner <> auth.uid() AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.user_sessions SET revoked_at = now()
    WHERE id = p_session_id AND revoked_at IS NULL;
  IF v_owner <> auth.uid() THEN
    PERFORM public.log_staff_action('revoke_session', 'user_session', p_session_id::text,
      NULL, v_owner, NULL);
  END IF;
END;
$$;

-- Revoke every active session for a user (self or staff).
CREATE OR REPLACE FUNCTION public.revoke_all_user_sessions(p_target_user_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF p_target_user_id <> auth.uid() AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.user_sessions SET revoked_at = now()
    WHERE user_id = p_target_user_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF p_target_user_id <> auth.uid() THEN
    PERFORM public.log_staff_action('revoke_all_sessions', 'profile', p_target_user_id::text,
      jsonb_build_object('revoked', v_count), p_target_user_id, NULL);
  END IF;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_session(text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_user_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_all_user_sessions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_user_session(text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_all_user_sessions(uuid) TO authenticated;

COMMENT ON TABLE public.user_sessions IS
  'Active login sessions (one per user+device). Written only via record_user_session(); user sees own, staff see all.';
