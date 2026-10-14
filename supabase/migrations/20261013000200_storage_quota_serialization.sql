-- Serialize inserts and replacements per owner. Keep existing 25 MiB defaults.
CREATE OR REPLACE FUNCTION public.enforce_storage_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage AS $$
DECLARE owner_uid uuid; new_bytes bigint; quota bigint; used bigint;
BEGIN
  IF TG_OP='UPDATE' AND (OLD.bucket_id='user-media' OR NEW.bucket_id='user-media') AND
    (OLD.bucket_id IS DISTINCT FROM NEW.bucket_id OR public.storage_object_owner_uid(OLD.name) IS DISTINCT FROM public.storage_object_owner_uid(NEW.name)) THEN
    RAISE EXCEPTION 'upload owner or bucket cannot change';
  END IF;
  IF NEW.bucket_id <> 'user-media' THEN RETURN NEW; END IF;
  owner_uid := public.storage_object_owner_uid(NEW.name);
  IF owner_uid IS NULL THEN RAISE EXCEPTION 'invalid upload owner'; END IF;
  -- An advisory lock alone does not refresh the statement snapshot. Updating
  -- this profile row serializes transactions and exposes a fresh counter.
  SELECT storage_quota_bytes,storage_used_bytes INTO quota,used
    FROM public.profiles WHERE user_id=owner_uid FOR UPDATE;
  IF quota IS NULL THEN RAISE EXCEPTION 'upload profile required'; END IF;
  new_bytes := COALESCE((NEW.metadata->>'size')::bigint,0);
  IF new_bytes < 0 THEN RAISE EXCEPTION 'invalid upload size'; END IF;
  IF TG_OP='UPDATE' AND OLD.bucket_id='user-media' AND public.storage_object_owner_uid(OLD.name)=owner_uid THEN
    used := GREATEST(0,used-COALESCE((OLD.metadata->>'size')::bigint,0));
  END IF;
  IF used+new_bytes > quota THEN RAISE EXCEPTION 'storage quota exceeded' USING errcode='check_violation'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_storage_quota ON storage.objects;
CREATE TRIGGER trg_enforce_storage_quota BEFORE INSERT OR UPDATE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_quota();
-- Reconcile counters before enforcing the serialized counter-based guard.
UPDATE public.profiles p SET storage_used_bytes=COALESCE((
  SELECT sum((o.metadata->>'size')::bigint) FROM storage.objects o
  WHERE o.bucket_id='user-media' AND public.storage_object_owner_uid(o.name)=p.user_id
),0);
