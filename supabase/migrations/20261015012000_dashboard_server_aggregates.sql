BEGIN;
-- Return chart-sized aggregates, never unbounded visit/watch-history downloads.
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats(p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; start_date date := (now() AT TIME ZONE 'UTC')::date - (greatest(1,least(coalesce(p_days,7),90))-1);
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND (is_admin OR role='admin')) THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE='insufficient_privilege';
  END IF;
  WITH raw AS MATERIALIZED (
    SELECT * FROM public.page_visits WHERE created_at >= start_date::timestamp AT TIME ZONE 'UTC' AND created_at <= now()
  ), devices AS (
    SELECT coalesce(visitor_id,session_id) device,min(user_id::text) member FROM raw GROUP BY 1 HAVING count(DISTINCT user_id)=1
  ), visits AS MATERIALIZED (
    SELECT r.*,coalesce('u:'||r.user_id::text,'u:'||d.member,'v:'||coalesce(r.visitor_id,r.session_id)) identity,
      (r.created_at AT TIME ZONE 'UTC')::date AS day,extract(hour FROM r.created_at AT TIME ZONE 'UTC')::int AS hour,
      coalesce(nullif(r.channel,''),CASE WHEN coalesce(r.referrer,'')='' THEN 'Direct' ELSE 'Referral' END) traffic_channel
    FROM raw r LEFT JOIN devices d ON d.device=coalesce(r.visitor_id,r.session_id)
  ), watches AS MATERIALIZED (
    SELECT * FROM public.watch_sessions WHERE created_at >= start_date::timestamp AT TIME ZONE 'UTC' AND created_at<=now()
  ), signups AS (SELECT user_id,created_at FROM public.profiles WHERE created_at>=start_date::timestamp AT TIME ZONE 'UTC' AND created_at<=now()),
  sessions AS (SELECT session_id,count(*) pages FROM visits WHERE session_id IS NOT NULL GROUP BY session_id),
  visitors AS (SELECT identity,count(DISTINCT day) active_days FROM visits WHERE identity IS NOT NULL GROUP BY identity),
  country_counts AS (SELECT trim(country) name,count(DISTINCT identity) value FROM visits WHERE nullif(trim(country),'') IS NOT NULL GROUP BY 1),
  genre_counts AS (SELECT genre name,round(sum(greatest(coalesce(w.watch_duration_seconds,0),0))/60.0) value FROM watches w CROSS JOIN LATERAL unnest(w.genres) genre GROUP BY genre),
  traffic AS (SELECT traffic_channel name,count(DISTINCT session_id) value FROM visits GROUP BY 1),
  referrers AS (SELECT referrer_host host,count(DISTINCT session_id) sessions FROM visits WHERE nullif(referrer_host,'') IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8),
  pages AS (SELECT split_part(page_path,'?',1) path,count(DISTINCT session_id) sessions FROM visits GROUP BY 1 ORDER BY 2 DESC LIMIT 8),
  dates AS (SELECT generate_series(start_date,(now() AT TIME ZONE 'UTC')::date,interval '1 day')::date AS day),
  daily_visits AS (SELECT day,count(DISTINCT identity) visitors,count(DISTINCT identity) FILTER(WHERE identity LIKE 'u:%') members FROM visits GROUP BY day),
  daily_watches AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day,round(sum(greatest(coalesce(watch_duration_seconds,0),0))/60.0) minutes FROM watches GROUP BY 1),
  daily_signups AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day,count(*) count FROM signups GROUP BY 1),
  daily AS (SELECT to_char(d.day,'YYYY-MM-DD') date,coalesce(v.visitors,0) visitors,coalesce(v.visitors,0) dau,coalesce(w.minutes,0) "watchTime",coalesce(s.count,0) "newUsers",
    CASE WHEN v.visitors>0 THEN round(v.members*100.0/v.visitors) ELSE 0 END retention
    FROM dates d LEFT JOIN daily_visits v USING(day) LEFT JOIN daily_watches w USING(day) LEFT JOIN daily_signups s USING(day)),
  hourly_counts AS (SELECT hour,count(*) visits FROM visits GROUP BY hour),
  hourly AS (SELECT lpad(h::text,2,'0')||':00' AS hour,coalesce(c.visits,0) visits FROM generate_series(0,23) h LEFT JOIN hourly_counts c ON c.hour=h),
  observed_signups AS (SELECT s.user_id FROM signups s WHERE EXISTS(SELECT 1 FROM visits v WHERE v.user_id=s.user_id)),
  funnel AS (SELECT (SELECT count(*) FROM visitors) visitors,(SELECT count(*) FROM observed_signups) signups,
    (SELECT count(*) FROM observed_signups s WHERE EXISTS(SELECT 1 FROM watches w WHERE w.user_id=s.user_id)) activated,
    (SELECT count(*) FROM visitors WHERE identity LIKE 'u:%' AND active_days>=2) retained,
    (SELECT count(*) FROM visitors WHERE identity LIKE 'u:%') members),
  quality AS (SELECT (SELECT count(*) FROM sessions) sessions,(SELECT count(*) FROM visits) views,
    (SELECT count(*) FROM visitors WHERE active_days>=2) returning_visitors,(SELECT count(*) FROM visitors) visitors,
    (SELECT count(*) FROM sessions WHERE pages=1) bounced,
    (SELECT round(avg(greatest(coalesce(watch_duration_seconds,0),0))/60.0) FROM watches) avg_watch),
  today AS (SELECT count(DISTINCT identity) FILTER(WHERE identity LIKE 'u:%') members,count(DISTINCT identity) FILTER(WHERE identity LIKE 'v:%') guests,count(DISTINCT identity) total FROM visits WHERE day=(now() AT TIME ZONE 'UTC')::date)
  SELECT jsonb_build_object(
    'totalUsers',(SELECT count(*) FROM public.profiles),
    'totalVisitors',(SELECT count(*) FROM visitors),
    'visitorBreakdown',(SELECT jsonb_build_object('guests',count(*) FILTER(WHERE identity LIKE 'v:%'),'loggedIn',count(*) FILTER(WHERE identity LIKE 'u:%')) FROM visitors),
    'totalWatchTime',(SELECT coalesce(sum(greatest(coalesce(watch_duration_seconds,0),0)),0) FROM watches),
    'topCountries',(SELECT coalesce(jsonb_agg(to_jsonb(country_counts) ORDER BY value DESC),'[]'::jsonb) FROM country_counts),
    'unknownCountrySessions',(SELECT count(DISTINCT identity) FROM visits WHERE nullif(trim(country),'') IS NULL),
    'topGenres',(SELECT coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) FROM (SELECT * FROM genre_counts ORDER BY value DESC LIMIT 6) g),
    'dailyStats',(SELECT jsonb_agg(to_jsonb(daily) ORDER BY date) FROM daily),
    'hourlyActivity',(SELECT jsonb_agg(to_jsonb(hourly) ORDER BY hour) FROM hourly),
    'referrerChannels',(SELECT coalesce(jsonb_agg(to_jsonb(traffic) ORDER BY value DESC),'[]'::jsonb) FROM traffic),
    'topReferrers',(SELECT coalesce(jsonb_agg(to_jsonb(referrers)),'[]'::jsonb) FROM referrers),
    'topPages',(SELECT coalesce(jsonb_agg(to_jsonb(pages)),'[]'::jsonb) FROM pages),
    'todayBreakdown',(SELECT to_jsonb(today) FROM today),
    'sessionQuality',(SELECT jsonb_build_object('totalSessions',sessions,'totalPageViews',views,'returningSessions',returning_visitors,'returningRate',coalesce(round(returning_visitors*100.0/nullif(visitors,0)),0),'avgPagesPerSession',coalesce(round(views::numeric/nullif(sessions,0),2),0),'avgWatchMinutes',coalesce(avg_watch,0)) FROM quality),
    'funnel',(SELECT jsonb_build_object('visitors',f.visitors,'signups',f.signups,'activated',f.activated,'retained',f.retained,'loggedInUsers',f.members,'signupRate',coalesce(round(f.signups*100.0/nullif(f.visitors,0)),0),'activationRate',coalesce(round(f.activated*100.0/nullif(f.signups,0)),0),'retentionRate',coalesce(round(f.retained*100.0/nullif(f.members,0)),0),'bounceRate',coalesce(round(q.bounced*100.0/nullif(q.sessions,0)),0)) FROM funnel f CROSS JOIN quality q)
  ) INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.admin_dashboard_stats(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats(integer) TO authenticated;
COMMIT;
