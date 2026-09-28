-- Watch2Together: host-hosted share-stream columns + password hardening
--
-- 1) Adds share_* columns the desktop host uses to publish its Cloudflare
--    tunnel stream URL to every participant.
-- 2) Fixes the plaintext room password: passwords are bcrypt-hashed and
--    verified server-side via SECURITY DEFINER RPCs, and password_hash is no
--    longer readable or writable by clients.
-- 3) Routes room joins through join_watch_room() so the password check cannot
--    be bypassed by inserting a participant row directly.

-- ---------------------------------------------------------------------------
-- Share columns (host-hosted stream over a Cloudflare quick tunnel)
-- ---------------------------------------------------------------------------
ALTER TABLE public.watch_rooms ADD COLUMN IF NOT EXISTS share_stream_url text;
ALTER TABLE public.watch_rooms ADD COLUMN IF NOT EXISTS share_stream_type text DEFAULT 'hls';
ALTER TABLE public.watch_rooms ADD COLUMN IF NOT EXISTS share_subtitle_url text;
ALTER TABLE public.watch_rooms ADD COLUMN IF NOT EXISTS share_active boolean DEFAULT false;
ALTER TABLE public.watch_rooms ADD COLUMN IF NOT EXISTS share_host_platform text;

-- ---------------------------------------------------------------------------
-- Ensure watch_room_participants exists. The 20260114000001 base migration
-- created it, but some environments only have watch_rooms (partial apply /
-- non-replayable history), and the policies + join_watch_room() ON CONFLICT
-- below require this table with its UNIQUE(room_id, user_id) key. Idempotent:
-- a no-op where the base migration already ran.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.watch_room_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES public.watch_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  display_name text,
  avatar_url text,
  is_host boolean DEFAULT false,
  is_ready boolean DEFAULT false,
  joined_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_room_participants_room
  ON public.watch_room_participants(room_id);

ALTER TABLE public.watch_room_participants ENABLE ROW LEVEL SECURITY;

-- Base read/update/leave policies (recreated idempotently so a freshly-created
-- table is functional; the host-only INSERT policy is set further below).
DROP POLICY IF EXISTS "Anyone can view room participants" ON public.watch_room_participants;
CREATE POLICY "Anyone can view room participants" ON public.watch_room_participants
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own participation" ON public.watch_room_participants;
CREATE POLICY "Users can update own participation" ON public.watch_room_participants
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can leave rooms" ON public.watch_room_participants;
CREATE POLICY "Users can leave rooms" ON public.watch_room_participants
  FOR DELETE USING (auth.uid() = user_id);

-- Add to the realtime publication if not already a member (live viewer list).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'watch_room_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.watch_room_participants;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- create_watch_room: hashes the password with pgcrypto and inserts the room.
-- Returns the new row with password_hash blanked so the secret never leaves
-- the database.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_watch_room(
  p_name text,
  p_access_type text DEFAULT 'public',
  p_password text DEFAULT NULL,
  p_anime_id text DEFAULT NULL,
  p_anime_title text DEFAULT NULL,
  p_anime_poster text DEFAULT NULL,
  p_episode_id text DEFAULT NULL,
  p_episode_number int DEFAULT NULL,
  p_episode_title text DEFAULT NULL,
  p_category text DEFAULT 'sub',
  p_max_participants int DEFAULT 10,
  p_scheduled_start_at timestamptz DEFAULT NULL,
  p_manual_subtitle_url text DEFAULT NULL,
  p_manual_stream_url text DEFAULT NULL,
  p_manual_stream_type text DEFAULT 'direct',
  p_selected_server text DEFAULT NULL
)
RETURNS public.watch_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room public.watch_rooms;
  v_hash text := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be logged in';
  END IF;

  IF p_access_type NOT IN ('public', 'invite', 'password') THEN
    RAISE EXCEPTION 'Invalid access type';
  END IF;

  IF p_access_type = 'password' THEN
    IF p_password IS NULL OR length(p_password) = 0 THEN
      RAISE EXCEPTION 'Password required for password-protected rooms';
    END IF;
    v_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));
  END IF;

  INSERT INTO public.watch_rooms (
    name, host_id, access_type, password_hash,
    anime_id, anime_title, anime_poster,
    episode_id, episode_number, episode_title,
    category, max_participants, scheduled_start_at,
    is_playing, manual_subtitle_url, manual_stream_url,
    manual_stream_type, selected_server
  ) VALUES (
    p_name, auth.uid(), p_access_type, v_hash,
    p_anime_id, p_anime_title, p_anime_poster,
    p_episode_id, p_episode_number, p_episode_title,
    COALESCE(p_category, 'sub'), COALESCE(p_max_participants, 10), p_scheduled_start_at,
    (p_scheduled_start_at IS NULL), p_manual_subtitle_url, p_manual_stream_url,
    COALESCE(p_manual_stream_type, 'direct'), p_selected_server
  )
  RETURNING * INTO v_room;

  -- The host is always a participant of their own room. Without this, the host
  -- is not in watch_room_participants on creation, so the room UI hides the chat
  -- input (rendered only for participants) and gates reactions/poll votes. The
  -- display_name is a placeholder the client refreshes with the real profile
  -- name on entry. Idempotent: ON CONFLICT keeps a re-run from erroring.
  INSERT INTO public.watch_room_participants (
    room_id, user_id, display_name, avatar_url, is_host, last_seen_at
  ) VALUES (
    v_room.id, auth.uid(), 'Host', NULL, true, now()
  )
  ON CONFLICT (room_id, user_id) DO NOTHING;

  v_room.password_hash := NULL;
  RETURN v_room;
END;
$$;

-- ---------------------------------------------------------------------------
-- join_watch_room: verifies the password server-side, enforces capacity, and
-- adds the caller as a participant. Non-host joins can only happen here, so a
-- client cannot skip the password check by inserting a participant directly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_watch_room(
  p_room_id uuid,
  p_password text DEFAULT NULL,
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
  v_count int;
  v_already boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be logged in';
  END IF;

  SELECT * INTO v_room FROM public.watch_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;
  IF NOT v_room.is_active THEN
    RAISE EXCEPTION 'Room is no longer active';
  END IF;

  IF v_room.access_type = 'password' THEN
    IF v_room.password_hash IS NULL
       OR p_password IS NULL
       OR extensions.crypt(p_password, v_room.password_hash) <> v_room.password_hash THEN
      RAISE EXCEPTION 'Invalid password';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.watch_room_participants
    WHERE room_id = p_room_id AND user_id = auth.uid()
  ) INTO v_already;

  IF NOT v_already THEN
    SELECT count(*) INTO v_count
    FROM public.watch_room_participants WHERE room_id = p_room_id;
    IF v_count >= v_room.max_participants THEN
      RAISE EXCEPTION 'Room is full';
    END IF;
  END IF;

  INSERT INTO public.watch_room_participants (
    room_id, user_id, display_name, avatar_url, is_host, last_seen_at
  ) VALUES (
    p_room_id, auth.uid(), COALESCE(p_display_name, 'Guest'), p_avatar_url, false, now()
  )
  ON CONFLICT (room_id, user_id)
  DO UPDATE SET last_seen_at = now(),
               display_name = COALESCE(EXCLUDED.display_name, watch_room_participants.display_name),
               avatar_url   = COALESCE(EXCLUDED.avatar_url, watch_room_participants.avatar_url);

  v_room.password_hash := NULL;
  RETURN v_room;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_watch_room(
  text, text, text, text, text, text, text, int, text, text, int,
  timestamptz, text, text, text, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.join_watch_room(uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Stop leaking password_hash. A table-level SELECT grant overrides a
-- column-level REVOKE, so drop the broad grants and re-grant every column
-- except password_hash. Room creation now happens only through
-- create_watch_room(), so INSERT is not re-granted to clients.
-- ---------------------------------------------------------------------------
REVOKE SELECT, INSERT, UPDATE ON public.watch_rooms FROM anon, authenticated;

GRANT SELECT (
  id, name, host_id, anime_id, anime_title, anime_poster,
  episode_id, episode_number, episode_title, category, access_type,
  current_time_seconds, is_playing, is_active, max_participants,
  created_at, updated_at, expires_at, scheduled_start_at,
  manual_subtitle_url, manual_stream_url, manual_stream_type, selected_server,
  share_stream_url, share_stream_type, share_subtitle_url, share_active, share_host_platform
) ON public.watch_rooms TO anon, authenticated;

GRANT UPDATE (
  name, anime_id, anime_title, anime_poster,
  episode_id, episode_number, episode_title, category, access_type,
  current_time_seconds, is_playing, is_active, max_participants,
  scheduled_start_at, updated_at,
  manual_subtitle_url, manual_stream_url, manual_stream_type, selected_server,
  share_stream_url, share_stream_type, share_subtitle_url, share_active, share_host_platform
) ON public.watch_rooms TO authenticated;

-- ---------------------------------------------------------------------------
-- Lock down participant inserts: only a host may add themselves to their own
-- room directly; all other joins go through join_watch_room() (SECURITY
-- DEFINER), which enforces the password.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can join rooms" ON public.watch_room_participants;
DROP POLICY IF EXISTS "Host can self-join their room" ON public.watch_room_participants;

CREATE POLICY "Host can self-join their room" ON public.watch_room_participants
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.watch_rooms r
      WHERE r.id = room_id AND r.host_id = auth.uid()
    )
  );
