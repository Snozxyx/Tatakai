-- Watch2Together: admin force-delete of any room
--
-- The base watch_rooms DELETE policy is host-only (host_id = auth.uid()), so a
-- non-host admin's client-side .delete() matched zero rows under RLS and
-- silently no-op'd. This SECURITY DEFINER RPC verifies admin server-side, then
-- removes the room and its child rows, and records the action in admin_logs.
--
-- Idempotent / re-appliable: CREATE OR REPLACE, guarded child deletes (a table
-- that does not exist in this environment is skipped), best-effort logging.

CREATE OR REPLACE FUNCTION public.admin_delete_watch_room(p_room_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean := false;
  v_child text;
  v_children text[] := ARRAY[
    'watch_room_poll_votes',
    'watch_room_polls',
    'watch_room_queue',
    'watch_room_messages',
    'watch_room_participants',
    'watch_room_invites'
  ];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be logged in';
  END IF;

  -- Accept either representation of "admin" (boolean flag or role column),
  -- mirroring the client's deriveIsAdmin.
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND (profiles.is_admin = true OR profiles.role = 'admin')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Remove child rows first. Most FKs are ON DELETE CASCADE, but deleting
  -- explicitly keeps this correct even where a child table lacks the cascade,
  -- and to_regclass skips any table not present in this environment.
  FOREACH v_child IN ARRAY v_children LOOP
    IF to_regclass('public.' || v_child) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE room_id = $1', v_child)
        USING p_room_id;
    END IF;
  END LOOP;

  DELETE FROM public.watch_rooms WHERE id = p_room_id;

  -- Best-effort audit trail; never fail the delete if the log table is absent.
  IF to_regclass('public.admin_logs') IS NOT NULL THEN
    BEGIN
      INSERT INTO public.admin_logs (user_id, action, entity_type, entity_id)
      VALUES (auth.uid(), 'delete_watch_room', 'watch_room', p_room_id::text);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN p_room_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_watch_room(uuid) TO authenticated;
