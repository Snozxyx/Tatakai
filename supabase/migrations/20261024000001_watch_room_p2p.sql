-- P2P watchrooms: only discovery and fenced source/host changes use Postgres.
-- Playback commands and media stay on authenticated WebRTC connections.
-- TURN credentials and source URLs deliberately have no room-list SELECT grant.
ALTER TABLE public.watch_rooms ADD COLUMN IF NOT EXISTS p2p_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.watch_rooms ADD COLUMN IF NOT EXISTS host_epoch bigint NOT NULL DEFAULT 1;
GRANT SELECT (p2p_enabled, host_epoch) ON public.watch_rooms TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.watch_room_p2p_state (
  room_id uuid PRIMARY KEY REFERENCES public.watch_rooms(id) ON DELETE CASCADE,
  source_revision uuid,
  media jsonb,
  buffering_policy text NOT NULL DEFAULT 'pause-together' CHECK (buffering_policy IN ('pause-together', 'keep-playing')),
  turn_servers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(turn_servers) = 'array'),
  host_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.watch_room_p2p_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.watch_room_p2p_state FROM PUBLIC, anon, authenticated;

-- Central membership helper prevents public room-list visibility granting signaling access.
CREATE OR REPLACE FUNCTION public.is_watch_room_p2p_member(p_room_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.watch_rooms r WHERE r.id = p_room_id AND r.is_active
      AND (r.host_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.watch_room_participants p WHERE p.room_id = r.id AND p.user_id = auth.uid()
      ))
  );
$$;
REVOKE ALL ON FUNCTION public.is_watch_room_p2p_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_watch_room_p2p_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_watch_room_p2p_state(p_room_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_state jsonb;
BEGIN
  IF NOT public.is_watch_room_p2p_member(p_room_id) THEN RAISE EXCEPTION 'Room membership required'; END IF;
  SELECT jsonb_build_object('room_id', r.id, 'host_id', r.host_id, 'host_epoch', r.host_epoch,
    'p2p_enabled', r.p2p_enabled, 'max_participants', r.max_participants,
    'current_time_seconds', r.current_time_seconds, 'is_playing', r.is_playing,
    'source_revision', s.source_revision, 'media', s.media,
    'buffering_policy', coalesce(s.buffering_policy, 'pause-together'),
    'turn_servers', coalesce(s.turn_servers, '[]'::jsonb), 'host_seen_at', s.host_seen_at)
  INTO v_state FROM public.watch_rooms r LEFT JOIN public.watch_room_p2p_state s ON s.room_id = r.id
  WHERE r.id = p_room_id;
  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.configure_watch_room_p2p(
  p_room_id uuid, p_enabled boolean,
  p_buffering_policy text DEFAULT 'pause-together', p_turn_servers jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_room public.watch_rooms; v_server jsonb; v_urls jsonb; v_url jsonb;
BEGIN
  SELECT * INTO v_room FROM public.watch_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR v_room.host_id <> auth.uid() OR NOT v_room.is_active THEN
    RAISE EXCEPTION 'Only the active room host can configure P2P';
  END IF;
  IF p_enabled IS NULL OR p_buffering_policy IS NULL OR p_buffering_policy NOT IN ('pause-together','keep-playing') THEN
    RAISE EXCEPTION 'Invalid P2P settings';
  END IF;
  IF p_turn_servers IS NULL OR jsonb_typeof(p_turn_servers) <> 'array'
    OR jsonb_array_length(p_turn_servers) > 8 OR octet_length(p_turn_servers::text) > 16384 THEN
    RAISE EXCEPTION 'Invalid TURN settings';
  END IF;
  FOR v_server IN SELECT value FROM jsonb_array_elements(p_turn_servers) LOOP
    IF jsonb_typeof(v_server) <> 'object' OR NOT (v_server ? 'urls') THEN RAISE EXCEPTION 'Invalid TURN server'; END IF;
    IF (v_server ? 'username' AND jsonb_typeof(v_server->'username') <> 'string')
      OR (v_server ? 'credential' AND jsonb_typeof(v_server->'credential') <> 'string') THEN
      RAISE EXCEPTION 'TURN credentials must be strings';
    END IF;
    v_urls := CASE WHEN jsonb_typeof(v_server->'urls') = 'string' THEN jsonb_build_array(v_server->'urls') ELSE v_server->'urls' END;
    IF jsonb_typeof(v_urls) <> 'array' OR jsonb_array_length(v_urls) = 0 OR jsonb_array_length(v_urls) > 8 THEN
      RAISE EXCEPTION 'Invalid TURN URLs';
    END IF;
    FOR v_url IN SELECT value FROM jsonb_array_elements(v_urls) LOOP
      IF jsonb_typeof(v_url) <> 'string' OR (v_url #>> '{}') !~ '^(stun|stuns|turn|turns):[^[:space:]]+$' THEN
        RAISE EXCEPTION 'Invalid TURN URL';
      END IF;
    END LOOP;
  END LOOP;
  IF p_enabled AND (SELECT count(*) FROM public.watch_room_participants WHERE room_id = p_room_id) > 20 THEN
    RAISE EXCEPTION 'P2P rooms support at most 20 participants';
  END IF;
  INSERT INTO public.watch_room_p2p_state(room_id, buffering_policy, turn_servers, host_seen_at)
    VALUES(p_room_id,p_buffering_policy,p_turn_servers,now())
    ON CONFLICT(room_id) DO UPDATE SET buffering_policy = EXCLUDED.buffering_policy,
      turn_servers = EXCLUDED.turn_servers, host_seen_at = now();
  UPDATE public.watch_rooms SET p2p_enabled = p_enabled,
    max_participants = CASE WHEN p_enabled THEN 20 ELSE max_participants END,
    is_playing = false, share_active = CASE WHEN p_enabled THEN false ELSE share_active END
    WHERE id = p_room_id;
  RETURN public.get_watch_room_p2p_state(p_room_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_watch_room_p2p_media(
  p_room_id uuid, p_expected_epoch bigint, p_media jsonb,p_expected_source_revision uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_room public.watch_rooms; v_revision uuid; v_key text; v_track jsonb;
BEGIN
  SELECT * INTO v_room FROM public.watch_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR v_room.host_id <> auth.uid() OR NOT v_room.is_active OR NOT v_room.p2p_enabled THEN
    RAISE EXCEPTION 'Only the active P2P host can publish media';
  END IF;
  IF p_expected_epoch IS DISTINCT FROM v_room.host_epoch THEN RAISE EXCEPTION 'Stale host epoch'; END IF;
  SELECT source_revision INTO v_revision FROM public.watch_room_p2p_state WHERE room_id=p_room_id;
  IF p_expected_source_revision IS DISTINCT FROM v_revision THEN RAISE EXCEPTION 'Stale source revision'; END IF;
  IF p_media IS NULL OR jsonb_typeof(p_media) <> 'object' OR octet_length(p_media::text) > 65536
    OR coalesce(p_media->>'format','') NOT IN ('hls','mp4')
    OR coalesce(p_media->>'url','') !~ '^https?://[^[:space:]]+$'
    OR length(p_media->>'url') > 8192 OR (p_media->>'url') ~ '^https?://[^/]*@'
    OR coalesce(length(p_media->>'timelineId'),0) NOT BETWEEN 1 AND 512
    OR p_media ? 'headers' THEN
    RAISE EXCEPTION 'Invalid media descriptor';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['subtitles','audioTracks'] LOOP
    IF p_media ? v_key THEN
      IF jsonb_typeof(p_media->v_key) <> 'array' OR jsonb_array_length(p_media->v_key) > 64 THEN
        RAISE EXCEPTION 'Invalid room tracks';
      END IF;
      FOR v_track IN SELECT value FROM jsonb_array_elements(p_media->v_key) LOOP
        IF jsonb_typeof(v_track) <> 'object'
          OR (v_track ? 'lang' AND (jsonb_typeof(v_track->'lang') <> 'string' OR length(v_track->>'lang') > 128))
          OR (v_track ? 'label' AND (jsonb_typeof(v_track->'label') <> 'string' OR length(v_track->>'label') > 256))
          OR (v_key='subtitles' AND (coalesce(v_track->>'url','') !~ '^https?://[^[:space:]]+$'
            OR (v_track->>'url') ~ '^https?://[^/]*@' OR length(v_track->>'url') > 8192
            OR coalesce(jsonb_typeof(v_track->'lang'),'') <> 'string'))
          OR (v_key='audioTracks' AND coalesce(jsonb_typeof(v_track->'id'),'') <> 'string') THEN
          RAISE EXCEPTION 'Invalid room track';
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  INSERT INTO public.watch_room_p2p_state(room_id,source_revision,media,host_seen_at)
    VALUES(p_room_id,gen_random_uuid(),p_media,now())
    ON CONFLICT(room_id) DO UPDATE SET source_revision=EXCLUDED.source_revision, media=EXCLUDED.media, host_seen_at=now();
  UPDATE public.watch_rooms SET is_playing=false,current_time_seconds=0,share_active=false WHERE id=p_room_id;
  DELETE FROM public.watch_room_p2p_signals WHERE room_id=p_room_id;
  RETURN public.get_watch_room_p2p_state(p_room_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.watch_room_p2p_heartbeat(
  p_room_id uuid,p_expected_epoch bigint,p_position double precision DEFAULT NULL,p_is_playing boolean DEFAULT NULL,
  p_expected_source_revision uuid DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.watch_rooms WHERE id=p_room_id AND host_id=auth.uid()
    AND host_epoch=p_expected_epoch AND p2p_enabled AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stale or unauthorized host'; END IF;
  IF p_position IS NOT NULL AND (p_position < 0 OR p_position > 604800 OR p_position::text IN ('NaN','Infinity','-Infinity')) THEN
    RAISE EXCEPTION 'Invalid playback position';
  END IF;
  IF p_position IS NOT NULL AND p_expected_source_revision IS DISTINCT FROM (
    SELECT source_revision FROM public.watch_room_p2p_state WHERE room_id=p_room_id
  ) THEN RAISE EXCEPTION 'Stale source revision'; END IF;
  UPDATE public.watch_room_p2p_state SET host_seen_at=now() WHERE room_id=p_room_id;
  IF p_position IS NOT NULL THEN
    UPDATE public.watch_rooms SET current_time_seconds=p_position,is_playing=coalesce(p_is_playing,is_playing) WHERE id=p_room_id;
  END IF;
END;
$$;

-- This trigger also fences legacy host transfers. A previous host cannot keep
-- controlling a reused connection once the epoch changes.
CREATE OR REPLACE FUNCTION public.fence_watch_room_p2p_host()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.host_id IS DISTINCT FROM OLD.host_id THEN
    NEW.host_epoch := OLD.host_epoch + 1;
    NEW.is_playing := false;
    UPDATE public.watch_room_p2p_state SET host_seen_at=now(), source_revision=gen_random_uuid() WHERE room_id=OLD.id;
    DELETE FROM public.watch_room_p2p_signals WHERE room_id=OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS watch_room_p2p_host_fence ON public.watch_rooms;
CREATE TRIGGER watch_room_p2p_host_fence BEFORE UPDATE OF host_id ON public.watch_rooms
  FOR EACH ROW EXECUTE FUNCTION public.fence_watch_room_p2p_host();

-- Episode/source changes remain possible through the existing queue/settings
-- RPCs. Invalidate the private descriptor in the same transaction so a viewer
-- cannot continue the old episode while the replacement is being resolved.
CREATE OR REPLACE FUNCTION public.invalidate_watch_room_p2p_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.p2p_enabled AND (
    NEW.anime_id IS DISTINCT FROM OLD.anime_id OR NEW.episode_id IS DISTINCT FROM OLD.episode_id
    OR NEW.episode_number IS DISTINCT FROM OLD.episode_number OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.manual_stream_url IS DISTINCT FROM OLD.manual_stream_url
    OR NEW.selected_server IS DISTINCT FROM OLD.selected_server
  ) THEN
    NEW.is_playing:=false;
    NEW.current_time_seconds:=0;
    UPDATE public.watch_room_p2p_state SET media=NULL,source_revision=gen_random_uuid() WHERE room_id=OLD.id;
    DELETE FROM public.watch_room_p2p_signals WHERE room_id=OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS watch_room_p2p_source_fence ON public.watch_rooms;
CREATE TRIGGER watch_room_p2p_source_fence BEFORE UPDATE OF anime_id,episode_id,episode_number,category,manual_stream_url,selected_server
  ON public.watch_rooms FOR EACH ROW EXECUTE FUNCTION public.invalidate_watch_room_p2p_source();

CREATE OR REPLACE FUNCTION public.transfer_watch_room_p2p_host(
  p_room_id uuid,p_expected_epoch bigint,p_target_user_id uuid,p_takeover boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_room public.watch_rooms; v_seen timestamptz;
BEGIN
  SELECT * INTO v_room FROM public.watch_rooms WHERE id=p_room_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_watch_room_p2p_member(p_room_id) OR NOT v_room.p2p_enabled THEN
    RAISE EXCEPTION 'Active P2P room membership required';
  END IF;
  IF p_expected_epoch IS DISTINCT FROM v_room.host_epoch THEN RAISE EXCEPTION 'Stale host epoch'; END IF;
  IF p_target_user_id = v_room.host_id OR NOT EXISTS (
    SELECT 1 FROM public.watch_room_participants WHERE room_id=p_room_id AND user_id=p_target_user_id
  ) THEN RAISE EXCEPTION 'Target must be another room participant'; END IF;
  IF p_takeover THEN
    IF p_target_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Takeover must target yourself'; END IF;
    SELECT host_seen_at INTO v_seen FROM public.watch_room_p2p_state WHERE room_id=p_room_id;
    IF coalesce(v_seen,v_room.updated_at) > now()-interval '30 seconds' THEN RAISE EXCEPTION 'Host is still connected'; END IF;
  ELSIF v_room.host_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the current host can transfer hosting';
  END IF;
  UPDATE public.watch_rooms SET host_id=p_target_user_id WHERE id=p_room_id;
  UPDATE public.watch_room_participants SET is_host=(user_id=p_target_user_id) WHERE room_id=p_room_id;
  RETURN public.get_watch_room_p2p_state(p_room_id);
END;
$$;

CREATE TABLE IF NOT EXISTS public.watch_room_p2p_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.watch_rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  host_epoch bigint NOT NULL,
  connection_id text NOT NULL CHECK(length(connection_id) BETWEEN 1 AND 128),
  kind text NOT NULL CHECK(kind IN ('hello','offer','answer','ice','bye')),
  payload jsonb NOT NULL CHECK(octet_length(payload::text) <= 65536),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '2 minutes'
);
CREATE INDEX IF NOT EXISTS watch_room_p2p_signals_recipient ON public.watch_room_p2p_signals(recipient_id,room_id,created_at);
CREATE INDEX IF NOT EXISTS watch_room_p2p_signals_expiry ON public.watch_room_p2p_signals(expires_at);
ALTER TABLE public.watch_room_p2p_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.watch_room_p2p_signals FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.watch_room_p2p_signals TO authenticated;
CREATE POLICY "P2P signals only reach their current room recipient" ON public.watch_room_p2p_signals
  FOR SELECT TO authenticated USING (recipient_id=auth.uid() AND expires_at>now()
    AND public.is_watch_room_p2p_member(room_id)
    AND EXISTS(SELECT 1 FROM public.watch_rooms r WHERE r.id=watch_room_p2p_signals.room_id
      AND r.host_epoch=watch_room_p2p_signals.host_epoch AND r.p2p_enabled));

CREATE OR REPLACE FUNCTION public.send_watch_room_p2p_signal(
  p_room_id uuid,p_recipient_id uuid,p_host_epoch bigint,p_connection_id text,p_kind text,p_payload jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_room public.watch_rooms; v_id uuid;
BEGIN
  SELECT * INTO v_room FROM public.watch_rooms WHERE id=p_room_id FOR UPDATE;
  IF NOT FOUND OR NOT v_room.p2p_enabled OR NOT public.is_watch_room_p2p_member(p_room_id) THEN
    RAISE EXCEPTION 'Active P2P room membership required';
  END IF;
  IF p_host_epoch IS DISTINCT FROM v_room.host_epoch THEN RAISE EXCEPTION 'Stale host epoch'; END IF;
  IF p_recipient_id IS NULL OR p_recipient_id=auth.uid() OR NOT EXISTS (
    SELECT 1 FROM public.watch_room_participants WHERE room_id=p_room_id AND user_id=p_recipient_id
  ) OR (auth.uid()<>v_room.host_id AND p_recipient_id<>v_room.host_id) THEN
    RAISE EXCEPTION 'Signals must connect the host and a room participant';
  END IF;
  IF p_connection_id IS NULL OR length(p_connection_id) NOT BETWEEN 1 AND 128
    OR p_kind IS NULL OR p_kind NOT IN ('hello','offer','answer','ice','bye')
    OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>65536 THEN
    RAISE EXCEPTION 'Invalid signaling message';
  END IF;
  DELETE FROM public.watch_room_p2p_signals WHERE room_id=p_room_id AND expires_at<=now();
  -- Room lock serializes this inexpensive bound against concurrent sends.
  IF (SELECT count(*) FROM public.watch_room_p2p_signals WHERE room_id=p_room_id AND sender_id=auth.uid()
      AND created_at>now()-interval '10 seconds') >= 200 THEN
    RAISE EXCEPTION 'Signaling rate limit exceeded';
  END IF;
  INSERT INTO public.watch_room_p2p_signals(room_id,sender_id,recipient_id,host_epoch,connection_id,kind,payload)
    VALUES(p_room_id,auth.uid(),p_recipient_id,p_host_epoch,p_connection_id,p_kind,p_payload) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Enforce capacity for direct host re-entry and existing join_watch_room RPCs.
-- All admission paths share the room row lock, closing the old count/insert race.
CREATE OR REPLACE FUNCTION public.enforce_watch_room_p2p_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_enabled boolean; v_max integer;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.room_id IS DISTINCT FROM OLD.room_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'Participant membership identity cannot be changed';
  END IF;
  SELECT p2p_enabled,max_participants INTO v_enabled,v_max FROM public.watch_rooms WHERE id=NEW.room_id FOR UPDATE;
  IF v_enabled AND NOT EXISTS (SELECT 1 FROM public.watch_room_participants WHERE room_id=NEW.room_id AND user_id=NEW.user_id)
    AND (SELECT count(*) FROM public.watch_room_participants WHERE room_id=NEW.room_id)>=least(coalesce(v_max,20),20) THEN
    RAISE EXCEPTION 'Room is full';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS watch_room_p2p_capacity ON public.watch_room_participants;
CREATE TRIGGER watch_room_p2p_capacity BEFORE INSERT OR UPDATE OF room_id,user_id ON public.watch_room_participants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_watch_room_p2p_capacity();

REVOKE ALL ON FUNCTION public.get_watch_room_p2p_state(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.configure_watch_room_p2p(uuid,boolean,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.publish_watch_room_p2p_media(uuid,bigint,jsonb,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.watch_room_p2p_heartbeat(uuid,bigint,double precision,boolean,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.transfer_watch_room_p2p_host(uuid,bigint,uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.send_watch_room_p2p_signal(uuid,uuid,bigint,text,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fence_watch_room_p2p_host() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.invalidate_watch_room_p2p_source() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enforce_watch_room_p2p_capacity() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_watch_room_p2p_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.configure_watch_room_p2p(uuid,boolean,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_watch_room_p2p_media(uuid,bigint,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.watch_room_p2p_heartbeat(uuid,bigint,double precision,boolean,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_watch_room_p2p_host(uuid,bigint,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_watch_room_p2p_signal(uuid,uuid,bigint,text,text,jsonb) TO authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='watch_room_p2p_signals'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.watch_room_p2p_signals; END IF;
END $$;

COMMENT ON TABLE public.watch_room_p2p_signals IS 'Private short-lived connection setup. Sender identity is assigned by the RPC, never client payload. Old room rows are cleaned during signaling and room deletion.';
