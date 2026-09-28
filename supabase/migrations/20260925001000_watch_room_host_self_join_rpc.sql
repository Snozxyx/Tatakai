-- Watch2Together: host self-join via SECURITY DEFINER RPC
--
-- The "Host can self-join their room" INSERT policy on watch_room_participants
-- (added in 20260924000001) gates a direct client insert with a cross-table
-- EXISTS subquery on watch_rooms:
--
--     WITH CHECK (auth.uid() = user_id
--                 AND EXISTS (SELECT 1 FROM watch_rooms r
--                             WHERE r.id = room_id AND r.host_id = auth.uid()))
--
-- That subquery runs under watch_rooms' own RLS + the column-level SELECT grants
-- the same migration introduced (table-level SELECT was REVOKED). When the host
-- cannot see their own watch_rooms row through those policies, the EXISTS is
-- false and the insert fails with "new row violates row-level security policy
-- for table watch_room_participants" — so the host never becomes a participant,
-- which hides the chat input and (via the participant-gated message SELECT
-- policy) makes messages appear not to load.
--
-- Fix: mirror join_watch_room() — a SECURITY DEFINER RPC that verifies the
-- caller owns the room and inserts the participant, bypassing the cross-table
-- RLS check entirely. No password is required (the host owns the room), so it
-- works for password rooms too. Idempotent via ON CONFLICT.

CREATE OR REPLACE FUNCTION public.host_self_join_watch_room(
  p_room_id uuid,
  p_display_name text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS public.watch_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room public.watch_rooms;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be logged in';
  END IF;

  SELECT * INTO v_room FROM public.watch_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF v_room.host_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the host can self-join this room';
  END IF;

  INSERT INTO public.watch_room_participants (
    room_id, user_id, display_name, avatar_url, is_host, last_seen_at
  ) VALUES (
    p_room_id, auth.uid(), COALESCE(p_display_name, 'Host'), p_avatar_url, true, now()
  )
  ON CONFLICT (room_id, user_id)
  DO UPDATE SET last_seen_at = now(),
               is_host      = true,
               display_name = COALESCE(EXCLUDED.display_name, watch_room_participants.display_name),
               avatar_url   = COALESCE(EXCLUDED.avatar_url, watch_room_participants.avatar_url);

  v_room.password_hash := NULL;
  RETURN v_room;
END;
$$;

GRANT EXECUTE ON FUNCTION public.host_self_join_watch_room(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Belt-and-suspenders: let a room's host always read its chat.
--
-- The base "Participants can view room messages" policy (20260114000001) grants
-- SELECT to room participants OR to anyone for public rooms. If the host's
-- participant row is ever missing (a legacy room created before create_watch_room
-- seated the host, or a failed self-join) they can't read messages in a
-- non-public room, so chat looks empty even to the owner. Add an explicit host
-- branch that never depends on the participant row. Idempotent.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Host can view room messages" ON public.watch_room_messages;
CREATE POLICY "Host can view room messages" ON public.watch_room_messages
  FOR SELECT USING (
    room_id IN (SELECT id FROM public.watch_rooms WHERE host_id = auth.uid())
  );
