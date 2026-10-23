BEGIN;
CREATE TABLE public.reading_view_counts (
  media_kind text NOT NULL CHECK(media_kind IN ('manga','novel')),
  media_id text NOT NULL CHECK(media_id ~ '^(anilist:[1-9][0-9]{0,9}|catalog:[0-9a-f-]{36})$'),
  total_views bigint NOT NULL DEFAULT 0 CHECK(total_views>=0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(media_kind,media_id)
);
CREATE TABLE public.reading_view_receipts (
  actor_hash text NOT NULL,
  media_kind text NOT NULL,
  media_id text NOT NULL,
  last_view_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_hash,media_kind,media_id)
);
CREATE INDEX reading_receipts_expiry_idx ON public.reading_view_receipts(last_view_at);
ALTER TABLE public.reading_view_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_view_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY reading_counts_public ON public.reading_view_counts FOR SELECT TO anon,authenticated USING(true);
REVOKE ALL ON public.reading_view_counts,public.reading_view_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.reading_view_counts TO anon,authenticated;
GRANT ALL ON public.reading_view_counts,public.reading_view_receipts TO service_role;

CREATE FUNCTION public.record_reading_view(p_kind text,p_media_id text,p_session_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor text; previous timestamptz;
BEGIN
  IF p_session_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('manga','novel')
    OR p_media_id IS NULL OR p_media_id !~ '^(anilist:[1-9][0-9]{0,9}|catalog:[0-9a-f-]{36})$'
    THEN RAISE EXCEPTION 'Invalid reading view'; END IF;
  actor:=md5(COALESCE(auth.uid()::text,p_session_id::text));
  PERFORM pg_advisory_xact_lock(hashtextextended(actor,0));
  SELECT last_view_at INTO previous FROM public.reading_view_receipts
    WHERE actor_hash=actor AND media_kind=p_kind AND media_id=p_media_id;
  IF previous>now()-interval '30 minutes' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM public.reading_view_receipts
    WHERE actor_hash=actor AND last_view_at>now()-interval '1 hour')>=60 THEN RETURN false; END IF;
  INSERT INTO public.reading_view_receipts(actor_hash,media_kind,media_id,last_view_at)
    VALUES(actor,p_kind,p_media_id,now()) ON CONFLICT(actor_hash,media_kind,media_id)
    DO UPDATE SET last_view_at=EXCLUDED.last_view_at;
  INSERT INTO public.reading_view_counts(media_kind,media_id,total_views)
    VALUES(p_kind,p_media_id,1) ON CONFLICT(media_kind,media_id)
    DO UPDATE SET total_views=reading_view_counts.total_views+1,updated_at=now();
  DELETE FROM public.reading_view_receipts WHERE ctid IN
    (SELECT ctid FROM public.reading_view_receipts WHERE last_view_at<now()-interval '2 days' LIMIT 200);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.record_reading_view(text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_reading_view(text,text,uuid) TO anon,authenticated,service_role;
COMMENT ON TABLE public.reading_view_counts IS 'Tatakai manga/novel detail views, counted after ten visible seconds; not chapter reads or upstream popularity.';
NOTIFY pgrst,'reload schema';
COMMIT;
