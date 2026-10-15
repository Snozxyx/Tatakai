BEGIN;
ALTER TABLE public.page_visits ADD COLUMN IF NOT EXISTS visitor_id text;
CREATE INDEX IF NOT EXISTS page_visits_visitor_created ON public.page_visits(visitor_id,created_at);
CREATE TABLE public.engagement_samples (
  visitor_id text NOT NULL,
  bucket timestamptz NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  active_seconds smallint NOT NULL CHECK(active_seconds BETWEEN 0 AND 30),
  PRIMARY KEY(visitor_id,bucket)
);
CREATE INDEX engagement_samples_bucket ON public.engagement_samples(bucket);
ALTER TABLE public.engagement_samples ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.engagement_samples FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.record_engagement(p_visitor_id text,p_active_seconds integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_bucket timestamptz := to_timestamp(floor(extract(epoch FROM now())/30)*30);
BEGIN
  IF p_visitor_id IS NULL OR length(p_visitor_id) NOT BETWEEN 8 AND 100 THEN RAISE EXCEPTION 'Invalid visitor id'; END IF;
  IF p_active_seconds IS NULL OR p_active_seconds NOT BETWEEN 0 AND 30 THEN RAISE EXCEPTION 'Invalid active time'; END IF;
  INSERT INTO public.engagement_samples(visitor_id,bucket,user_id,active_seconds)
  VALUES(p_visitor_id,current_bucket,auth.uid(),p_active_seconds)
  ON CONFLICT(visitor_id,bucket) DO UPDATE SET
    active_seconds=greatest(engagement_samples.active_seconds,EXCLUDED.active_seconds),
    user_id=coalesce(EXCLUDED.user_id,engagement_samples.user_id);
END; $$;
REVOKE ALL ON FUNCTION public.record_engagement(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_engagement(text,integer) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_engagement_stats(p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $engagement$
DECLARE result jsonb; start_date date := (now() AT TIME ZONE 'UTC')::date - (greatest(1,least(coalesce(p_days,7),90))-1);
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND (is_admin OR role='admin')) THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE='insufficient_privilege';
  END IF;
  WITH device_members AS (
    SELECT coalesce(visitor_id,session_id) device,min(user_id::text) member FROM public.page_visits
    GROUP BY 1 HAVING count(DISTINCT user_id)=1
  ), visits AS MATERIALIZED (
    SELECT coalesce('u:'||v.user_id::text,'u:'||m.member,'v:'||coalesce(v.visitor_id,v.session_id)) identity,
      (v.created_at AT TIME ZONE 'UTC')::date AS day,
      extract(hour FROM v.created_at AT TIME ZONE 'UTC')::integer AS hour
    FROM public.page_visits v LEFT JOIN device_members m ON m.device=coalesce(v.visitor_id,v.session_id)
    WHERE coalesce(v.visitor_id,v.session_id) IS NOT NULL AND v.created_at<=now()
  ), active AS MATERIALIZED (SELECT DISTINCT day,identity FROM visits),
  first_seen AS (SELECT identity,min(day) first_day FROM active GROUP BY identity),
  ranged AS MATERIALIZED (SELECT * FROM visits WHERE day>=start_date),
  days AS (SELECT generate_series(start_date,(now() AT TIME ZONE 'UTC')::date,interval '1 day')::date AS day),
  daily_counts AS (
    SELECT day,count(*) visitors,count(*) FILTER(WHERE identity LIKE 'u:%') members
    FROM active WHERE day>=start_date-1 GROUP BY day
  ), fresh_counts AS (SELECT first_day AS day,count(*) new_visitors FROM first_seen WHERE first_day>=start_date GROUP BY first_day),
  retained_counts AS (
    SELECT a.day,count(*) retained FROM active a JOIN active prev ON prev.identity=a.identity AND prev.day=a.day-1
    WHERE a.day>=start_date GROUP BY a.day
  ), measured AS (
    SELECT bucket,coalesce('u:'||user_id::text,'v:'||visitor_id) identity,max(active_seconds) seconds
    FROM public.engagement_samples WHERE bucket>=start_date::timestamp AT TIME ZONE 'UTC' GROUP BY 1,2
  ), measured_counts AS (
    SELECT (bucket AT TIME ZONE 'UTC')::date AS day,sum(seconds) active_seconds,count(DISTINCT identity) engaged_visitors
    FROM measured GROUP BY 1
  ), daily AS (
    SELECT d.day,coalesce(c.visitors,0) visitors,coalesce(c.members,0) members,coalesce(f.new_visitors,0) new_visitors,
      coalesce(r.retained,0) retained,coalesce(prev.visitors,0) previous_active,
      coalesce(m.active_seconds,0) active_seconds,coalesce(m.engaged_visitors,0) engaged_visitors
    FROM days d LEFT JOIN daily_counts c USING(day) LEFT JOIN fresh_counts f USING(day)
    LEFT JOIN retained_counts r USING(day) LEFT JOIN measured_counts m USING(day)
    LEFT JOIN daily_counts prev ON prev.day=d.day-1
  ), cohorts AS (
    SELECT offset_days,count(*) eligible,count(a.identity) returned
    FROM first_seen f CROSS JOIN (VALUES(1),(7)) offsets(offset_days)
    LEFT JOIN active a ON a.identity=f.identity AND a.day=f.first_day+offset_days
    WHERE f.first_day>=start_date AND f.first_day+offset_days < (now() AT TIME ZONE 'UTC')::date
    GROUP BY offset_days
  ), hour_counts AS (SELECT hour,count(*) views FROM ranged GROUP BY hour),
  pattern_counts AS (SELECT extract(dow FROM day)::int weekday,hour,count(*) views FROM ranged GROUP BY 1,2)
  SELECT jsonb_build_object(
    'timezone','UTC',
    'uniqueVisitors',(SELECT count(DISTINCT identity) FROM active WHERE day>=start_date),
    'pageViews',(SELECT count(*) FROM ranged),
    'todayActive',(SELECT visitors FROM daily ORDER BY day DESC LIMIT 1),
    'daily',(SELECT coalesce(jsonb_agg(to_jsonb(daily) ORDER BY day),'[]'::jsonb) FROM daily),
    'hourly',(SELECT jsonb_agg(jsonb_build_object('hour',h,'views',coalesce(c.views,0)) ORDER BY h) FROM generate_series(0,23) h LEFT JOIN hour_counts c ON c.hour=h),
    'cohorts',(SELECT coalesce(jsonb_agg(to_jsonb(cohorts)),'[]'::jsonb) FROM cohorts),
    'patterns',(SELECT jsonb_agg(jsonb_build_object('weekday',w,'hour',h,'views',coalesce(c.views,0))) FROM generate_series(0,6) w CROSS JOIN generate_series(0,23) h LEFT JOIN pattern_counts c ON c.weekday=w AND c.hour=h),
    'measuredSince',(SELECT min(bucket) FROM public.engagement_samples)
  ) INTO result;
  RETURN result;
END; $engagement$;
REVOKE ALL ON FUNCTION public.admin_engagement_stats(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_engagement_stats(integer) TO authenticated;
COMMIT;
