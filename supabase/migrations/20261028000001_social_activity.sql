CREATE TABLE public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY(blocker_id,blocked_id), CHECK (blocker_id <> blocked_id)
);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_blocks FROM PUBLIC, anon, authenticated;
CREATE POLICY user_blocks_owner ON public.user_blocks FOR ALL TO authenticated
  USING (blocker_id=auth.uid()) WITH CHECK (blocker_id=auth.uid());
GRANT SELECT,INSERT,DELETE ON public.user_blocks TO authenticated;

-- Social presence is deliberately separate from publicly readable profiles.
-- All reads pass through a privacy-filtered RPC; raw activity is owner-only.
CREATE TABLE public.social_privacy (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  show_online boolean NOT NULL DEFAULT true,
  show_last_seen boolean NOT NULL DEFAULT true,
  share_watching boolean NOT NULL DEFAULT true,
  share_reading boolean NOT NULL DEFAULT true
);
ALTER TABLE public.social_privacy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_privacy FROM PUBLIC, anon, authenticated;
CREATE POLICY social_privacy_owner ON public.social_privacy FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE ON public.social_privacy TO authenticated;

CREATE TABLE public.social_activity (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  active_until timestamptz NOT NULL DEFAULT now(),
  kind text CHECK (kind IN ('watching', 'manga', 'novel')),
  title text,
  href text,
  image text,
  detail text
);
ALTER TABLE public.social_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_activity FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.set_social_privacy(p_online boolean, p_last_seen boolean, p_watching boolean, p_reading boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  INSERT INTO social_privacy VALUES (auth.uid(), p_online, p_last_seen, p_watching, p_reading)
  ON CONFLICT (user_id) DO UPDATE SET show_online = p_online, show_last_seen = p_last_seen,
    share_watching = p_watching, share_reading = p_reading;
  UPDATE social_activity SET
    seen_at = CASE WHEN NOT p_last_seen THEN NULL ELSE seen_at END,
    active_until = CASE WHEN NOT p_online THEN now() ELSE active_until END,
    kind = NULL, title = NULL, href = NULL, image = NULL, detail = NULL
  WHERE user_id = auth.uid();
END;
$$;
-- With last-seen disabled there must be no persisted last-seen timestamp.
ALTER TABLE public.social_activity ALTER COLUMN seen_at DROP NOT NULL;

CREATE FUNCTION public.heartbeat_social_activity(p_kind text DEFAULT NULL, p_title text DEFAULT NULL,
  p_href text DEFAULT NULL, p_image text DEFAULT NULL, p_detail text DEFAULT NULL, p_active boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE prefs social_privacy; allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  -- Serialize opt-outs and heartbeats to prevent an in-flight heartbeat restoring hidden data.
  INSERT INTO social_privacy(user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  SELECT * INTO prefs FROM social_privacy WHERE user_id = auth.uid() FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_public = true AND NOT coalesce(is_banned, false)) THEN
    DELETE FROM social_activity WHERE user_id = auth.uid(); RETURN;
  END IF;
  allowed := p_active AND prefs.show_online AND
    ((p_kind = 'watching' AND prefs.share_watching) OR (p_kind IN ('manga', 'novel') AND prefs.share_reading));
  IF p_kind IS NOT NULL AND p_kind NOT IN ('watching', 'manga', 'novel') THEN RAISE EXCEPTION 'Invalid activity'; END IF;
  IF allowed AND (p_href IS NULL OR p_href !~ '^/(anime|manga|novel)/[a-zA-Z0-9_%.-]+$') THEN
    RAISE EXCEPTION 'Invalid activity link';
  END IF;
  INSERT INTO social_activity(user_id, seen_at, active_until, kind, title, href, image, detail)
  VALUES (auth.uid(), CASE WHEN prefs.show_last_seen THEN now() END,
    CASE WHEN p_active AND prefs.show_online THEN now() + interval '90 seconds' ELSE now() END,
    CASE WHEN allowed THEN p_kind END, CASE WHEN allowed THEN left(p_title, 200) END,
    CASE WHEN allowed THEN p_href END,
    CASE WHEN allowed AND p_image ~ '^https://' THEN left(p_image, 2048) END,
    CASE WHEN allowed THEN left(p_detail, 100) END)
  ON CONFLICT (user_id) DO UPDATE SET seen_at = excluded.seen_at, active_until = excluded.active_until,
    kind = excluded.kind, title = excluded.title, href = excluded.href, image = excluded.image, detail = excluded.detail;
END;
$$;

CREATE FUNCTION public.get_social_presence(p_user_ids uuid[] DEFAULT NULL, p_friends boolean DEFAULT false)
RETURNS TABLE (user_id uuid, username text, display_name text, avatar_url text, online boolean,
  last_seen timestamptz, kind text, title text, href text, image text, detail text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.user_id, p.username::text, p.display_name::text, p.avatar_url::text,
    coalesce(s.show_online, true) AND a.active_until > now(),
    CASE WHEN coalesce(s.show_last_seen, true) THEN a.seen_at END,
    CASE WHEN permitted.activity THEN a.kind END, CASE WHEN permitted.activity THEN a.title END,
    CASE WHEN permitted.activity THEN a.href END, CASE WHEN permitted.activity THEN a.image END,
    CASE WHEN permitted.activity THEN a.detail END
  FROM social_activity a JOIN profiles p ON p.user_id = a.user_id
  LEFT JOIN social_privacy s ON s.user_id = a.user_id
  CROSS JOIN LATERAL (SELECT a.active_until > now() AND coalesce(s.show_online, true) AND
    ((a.kind = 'watching' AND coalesce(s.share_watching, true)) OR
      (a.kind IN ('manga', 'novel') AND coalesce(s.share_reading, true))) AS activity) permitted
  WHERE auth.uid() IS NOT NULL AND p.is_public = true AND NOT coalesce(p.is_banned, false)
    AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=auth.uid() AND b.blocked_id=a.user_id) OR (b.blocker_id=a.user_id AND b.blocked_id=auth.uid()))
    AND (coalesce(s.show_online, true) OR coalesce(s.show_last_seen, true))
    AND ((NOT p_friends AND a.user_id = ANY(p_user_ids[1:100])) OR
      (p_friends AND a.user_id <> auth.uid() AND EXISTS (
        SELECT 1 FROM user_follows f WHERE
          (f.follower_id = auth.uid() AND f.following_id = a.user_id) OR
          (f.following_id = auth.uid() AND f.follower_id = a.user_id))))
  ORDER BY a.active_until > now() DESC, a.seen_at DESC NULLS LAST LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.set_social_privacy(boolean,boolean,boolean,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.heartbeat_social_activity(text,text,text,text,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_social_presence(uuid[],boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_social_privacy(boolean,boolean,boolean,boolean),
  public.heartbeat_social_activity(text,text,text,text,text,boolean), public.get_social_presence(uuid[],boolean) TO authenticated;
