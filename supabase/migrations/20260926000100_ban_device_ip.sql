-- =============================================================================
-- Ban a user's device(s) / IP(s) from the admin user page
--
-- device_bans / ip_bans (20260509000001) are written directly by the ban
-- panels, but nothing ties them to a *user*: staff had no way to say "ban this
-- account's devices". These SECURITY DEFINER, is_staff-gated RPCs read the
-- target's known device ids (profiles.device_id + user_sessions) and IPs
-- (user_sessions) and record bans, funnelling through the staff audit trail.
--
-- banned_by is auth.uid() (auth.users id space) to match what the panels write.
-- ip_bans.ip_address is INET, so non-castable strings are skipped rather than
-- aborting the batch. Recording only — device-ban enforcement is client-side on
-- boot; IP-ban enforcement needs a server-side check (out of scope).
--
-- Requires public.is_staff() + log_staff_action() (20260925000000) and
-- user_sessions (20260925000300).
--
-- WRITTEN, NOT APPLIED — repo standing rule.
-- =============================================================================

-- Ban one device id outright (per-session "Ban device" button).
CREATE OR REPLACE FUNCTION public.admin_ban_device(
  p_device_id text,
  p_reason text DEFAULT 'Banned by staff',
  p_expires_at timestamptz DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_device_id IS NULL OR char_length(p_device_id) = 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.device_bans (device_id, reason, banned_by, expires_at)
    VALUES (p_device_id, COALESCE(NULLIF(p_reason,''),'Banned by staff'), auth.uid(), p_expires_at)
    ON CONFLICT (device_id) DO UPDATE
      SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by, expires_at = EXCLUDED.expires_at;
  PERFORM public.log_staff_action('ban_device','device_ban',p_device_id,
    jsonb_build_object('reason',p_reason), p_target_user_id, NULL);
END;
$$;

-- Ban one IP outright (per-session "Ban IP" button). Non-castable → no-op.
CREATE OR REPLACE FUNCTION public.admin_ban_ip(
  p_ip text,
  p_reason text DEFAULT 'Banned by staff',
  p_expires_at timestamptz DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ip inet;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  BEGIN
    v_ip := p_ip::inet;
  EXCEPTION WHEN others THEN
    RETURN;
  END;
  IF v_ip IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.ip_bans (ip_address, reason, banned_by, expires_at)
    VALUES (v_ip, COALESCE(NULLIF(p_reason,''),'Banned by staff'), auth.uid(), p_expires_at)
    ON CONFLICT (ip_address) DO UPDATE
      SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by, expires_at = EXCLUDED.expires_at;
  PERFORM public.log_staff_action('ban_ip','ip_ban',host(v_ip),
    jsonb_build_object('reason',p_reason), p_target_user_id, NULL);
END;
$$;

-- Ban every device id known for a user (header "Ban all devices"). Returns the
-- number of distinct device ids acted on.
CREATE OR REPLACE FUNCTION public.admin_ban_user_devices(
  p_target_user_id uuid,
  p_reason text DEFAULT 'Banned by staff',
  p_expires_at timestamptz DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dev text;
  v_count integer := 0;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  FOR v_dev IN
    SELECT DISTINCT d FROM (
      SELECT device_id AS d FROM public.profiles WHERE user_id = p_target_user_id
      UNION
      SELECT device_id AS d FROM public.user_sessions WHERE user_id = p_target_user_id
    ) s WHERE d IS NOT NULL AND char_length(d) > 0
  LOOP
    INSERT INTO public.device_bans (device_id, reason, banned_by, expires_at)
      VALUES (v_dev, COALESCE(NULLIF(p_reason,''),'Banned by staff'), auth.uid(), p_expires_at)
      ON CONFLICT (device_id) DO UPDATE
        SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by, expires_at = EXCLUDED.expires_at;
    v_count := v_count + 1;
  END LOOP;
  PERFORM public.log_staff_action('ban_all_devices','profile',p_target_user_id::text,
    jsonb_build_object('devices',v_count), p_target_user_id, NULL);
  RETURN v_count;
END;
$$;

-- Ban every IP known for a user (header "Ban all IPs"). Non-castable skipped.
CREATE OR REPLACE FUNCTION public.admin_ban_user_ips(
  p_target_user_id uuid,
  p_reason text DEFAULT 'Banned by staff',
  p_expires_at timestamptz DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ip_text text;
  v_ip inet;
  v_count integer := 0;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  FOR v_ip_text IN
    SELECT DISTINCT ip_address FROM public.user_sessions
      WHERE user_id = p_target_user_id AND ip_address IS NOT NULL
  LOOP
    BEGIN
      v_ip := v_ip_text::inet;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    INSERT INTO public.ip_bans (ip_address, reason, banned_by, expires_at)
      VALUES (v_ip, COALESCE(NULLIF(p_reason,''),'Banned by staff'), auth.uid(), p_expires_at)
      ON CONFLICT (ip_address) DO UPDATE
        SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by, expires_at = EXCLUDED.expires_at;
    v_count := v_count + 1;
  END LOOP;
  PERFORM public.log_staff_action('ban_all_ips','profile',p_target_user_id::text,
    jsonb_build_object('ips',v_count), p_target_user_id, NULL);
  RETURN v_count;
END;
$$;

-- Read helpers (client-side device-ban enforcement on boot). Both fail-soft.
CREATE OR REPLACE FUNCTION public.is_device_banned(p_device_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.device_bans
    WHERE device_id = p_device_id
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_ip_banned(p_ip text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ip inet;
BEGIN
  BEGIN
    v_ip := p_ip::inet;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN EXISTS (
    SELECT 1 FROM public.ip_bans
    WHERE ip_address = v_ip
      AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ban_device(text,text,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_ban_ip(text,text,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_ban_user_devices(uuid,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_ban_user_ips(uuid,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_ban_device(text,text,timestamptz,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_ip(text,text,timestamptz,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_user_devices(uuid,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_user_ips(uuid,text,timestamptz) TO authenticated;
-- Read helpers are safe for anon (boot happens before auth resolves).
GRANT EXECUTE ON FUNCTION public.is_device_banned(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_ip_banned(text) TO authenticated, anon;
