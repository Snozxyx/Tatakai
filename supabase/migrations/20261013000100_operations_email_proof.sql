-- Apply explicitly after restore. No existing accounts are auto-confirmed.
BEGIN;
CREATE SCHEMA IF NOT EXISTS tatakai_private;
REVOKE ALL ON SCHEMA tatakai_private FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS tatakai_private.email_proof (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  required_since timestamptz NOT NULL DEFAULT now(), verified_at timestamptz
);
REVOKE ALL ON tatakai_private.email_proof FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION tatakai_private.capture_email_proof_requirement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.raw_app_meta_data->>'tatakai_email_proof_required'='true' THEN
    INSERT INTO tatakai_private.email_proof(user_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tatakai_email_proof_requirement ON auth.users;
CREATE TRIGGER tatakai_email_proof_requirement AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION tatakai_private.capture_email_proof_requirement();
CREATE OR REPLACE FUNCTION public.has_verified_email()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tatakai_private.email_proof WHERE user_id=auth.uid() AND verified_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION public.has_verified_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_verified_email() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.record_email_proof(p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  UPDATE tatakai_private.email_proof SET verified_at=now() WHERE user_id=p_user_id AND verified_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.record_email_proof(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_email_proof(uuid) TO service_role;
-- Restrictive policies combine with existing authorization; they never grant access.
DO $$
DECLARE item record; operation text;
BEGIN
  FOR item IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname='public'
    AND rowsecurity AND tablename NOT IN ('profiles','user_sessions') LOOP
    FOREACH operation IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I','tatakai_email_proof_'||lower(operation),item.schemaname,item.tablename);
      EXECUTE format('CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR %s TO authenticated %s',
        'tatakai_email_proof_'||lower(operation),item.schemaname,item.tablename,operation,
        CASE WHEN operation='INSERT' THEN 'WITH CHECK ((SELECT public.has_verified_email()))'
          WHEN operation='UPDATE' THEN 'USING ((SELECT public.has_verified_email())) WITH CHECK ((SELECT public.has_verified_email()))'
          ELSE 'USING ((SELECT public.has_verified_email()))' END);
    END LOOP;
  END LOOP;
END;
$$;
CREATE POLICY tatakai_storage_email_proof_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT public.has_verified_email()));
CREATE POLICY tatakai_storage_email_proof_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT public.has_verified_email())) WITH CHECK ((SELECT public.has_verified_email()));
CREATE POLICY tatakai_storage_email_proof_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT public.has_verified_email()));
-- SECURITY DEFINER RPCs can bypass RLS; the same restriction also applies at
-- the table boundary. Service jobs with no end-user auth.uid() remain allowed.
CREATE OR REPLACE FUNCTION tatakai_private.require_email_proof_for_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_verified_email() THEN
    RAISE EXCEPTION 'Verify your email before contributing' USING errcode='insufficient_privilege';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT schemaname,tablename FROM pg_tables WHERE (schemaname='public' AND tablename NOT IN ('profiles','user_sessions')) OR (schemaname='storage' AND tablename='objects') LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tatakai_require_email_proof ON %I.%I',item.schemaname,item.tablename);
    EXECUTE format('CREATE TRIGGER tatakai_require_email_proof BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION tatakai_private.require_email_proof_for_write()',item.schemaname,item.tablename);
  END LOOP;
END;
$$;
COMMIT;
