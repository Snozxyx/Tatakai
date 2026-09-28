-- =============================================================================
-- Per-user storage quota (default 25 MB) for user uploads
--
-- The user-media bucket (20260923140000) namespaces every upload under
-- user-media/<auth.uid()>/... and explicitly foresaw this trigger. We add:
--   * profiles.storage_quota_bytes (default 26214400 = 25 MB) and
--     profiles.storage_used_bytes (maintained incrementally by triggers),
--   * a BEFORE INSERT guard on storage.objects rejecting an upload that would
--     push the owner over quota,
--   * AFTER INSERT/UPDATE/DELETE triggers keeping storage_used_bytes accurate,
--   * admin RPCs to override a user's quota and to reconcile usage.
--
-- Scope: the canonical user-media bucket (all new comment/post/forum uploads
-- land there). Owner = first path segment, guaranteed = auth.uid() by that
-- bucket's RLS. Requires public.is_staff() from 20260925000000.
--
-- WRITTEN, NOT APPLIED — repo standing rule.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS storage_quota_bytes bigint NOT NULL DEFAULT 26214400,
  ADD COLUMN IF NOT EXISTS storage_used_bytes  bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.storage_quota_bytes IS
  'Max total bytes in user-media. Default 25 MB; admin-adjustable via admin_set_storage_quota().';
COMMENT ON COLUMN public.profiles.storage_used_bytes IS
  'Maintained by storage.objects triggers; reconcile with recompute_storage_usage().';

-- Owner uid from a user-media object path; NULL (never raises) if the first
-- segment is not a uuid, so a stray object can never abort an upload.
CREATE OR REPLACE FUNCTION public.storage_object_owner_uid(p_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN (storage.foldername(p_name))[1]::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- BEFORE INSERT: reject over-quota uploads.
CREATE OR REPLACE FUNCTION public.enforce_storage_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE
  v_uid uuid;
  v_size bigint;
  v_quota bigint;
  v_used bigint;
BEGIN
  IF NEW.bucket_id <> 'user-media' THEN
    RETURN NEW;
  END IF;
  v_uid := public.storage_object_owner_uid(NEW.name);
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT storage_quota_bytes INTO v_quota FROM public.profiles WHERE user_id = v_uid;
  IF v_quota IS NULL THEN
    RETURN NEW; -- no profile row → do not block
  END IF;
  v_size := COALESCE((NEW.metadata->>'size')::bigint, 0);
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0) INTO v_used
    FROM storage.objects
    WHERE bucket_id = 'user-media'
      AND public.storage_object_owner_uid(name) = v_uid;
  IF v_used + v_size > v_quota THEN
    RAISE EXCEPTION 'storage quota exceeded: % of % bytes used', v_used, v_quota
      USING errcode = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_storage_quota ON storage.objects;
CREATE TRIGGER trg_enforce_storage_quota
  BEFORE INSERT ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_quota();

-- AFTER INSERT/UPDATE/DELETE: keep profiles.storage_used_bytes in sync.
CREATE OR REPLACE FUNCTION public.sync_storage_usage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE v_uid uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.bucket_id = 'user-media' THEN
    v_uid := public.storage_object_owner_uid(NEW.name);
    IF v_uid IS NOT NULL THEN
      UPDATE public.profiles
        SET storage_used_bytes = GREATEST(0, storage_used_bytes + COALESCE((NEW.metadata->>'size')::bigint,0))
        WHERE user_id = v_uid;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.bucket_id = 'user-media' THEN
    v_uid := public.storage_object_owner_uid(OLD.name);
    IF v_uid IS NOT NULL THEN
      UPDATE public.profiles
        SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE((OLD.metadata->>'size')::bigint,0))
        WHERE user_id = v_uid;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND OLD.bucket_id = 'user-media' THEN
    v_uid := public.storage_object_owner_uid(OLD.name);
    IF v_uid IS NOT NULL THEN
      UPDATE public.profiles
        SET storage_used_bytes = GREATEST(0, storage_used_bytes
          - COALESCE((OLD.metadata->>'size')::bigint,0)
          + COALESCE((NEW.metadata->>'size')::bigint,0))
        WHERE user_id = v_uid;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_storage_usage ON storage.objects;
CREATE TRIGGER trg_sync_storage_usage
  AFTER INSERT OR UPDATE OR DELETE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.sync_storage_usage();

-- Reconcile a user's counter from the source of truth (self, or staff).
CREATE OR REPLACE FUNCTION public.recompute_storage_usage(p_target_user_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE v_used bigint;
BEGIN
  IF p_target_user_id <> auth.uid() AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT COALESCE(SUM((metadata->>'size')::bigint),0) INTO v_used
    FROM storage.objects
    WHERE bucket_id='user-media' AND public.storage_object_owner_uid(name) = p_target_user_id;
  UPDATE public.profiles SET storage_used_bytes = v_used WHERE user_id = p_target_user_id;
  RETURN v_used;
END;
$$;

-- Admin/mod override of a user's quota. Logged to the staff audit trail.
CREATE OR REPLACE FUNCTION public.admin_set_storage_quota(p_target_user_id uuid, p_bytes bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_bytes < 0 THEN
    RAISE EXCEPTION 'quota must be >= 0';
  END IF;
  UPDATE public.profiles SET storage_quota_bytes = p_bytes WHERE user_id = p_target_user_id;
  PERFORM public.log_staff_action('set_storage_quota', 'profile', p_target_user_id::text,
    jsonb_build_object('bytes', p_bytes), p_target_user_id, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_storage_usage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_storage_quota(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_storage_usage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_storage_quota(uuid, bigint) TO authenticated;
