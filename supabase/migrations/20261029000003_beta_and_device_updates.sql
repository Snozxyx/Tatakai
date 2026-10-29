-- Separate device policies preserve the legacy per-channel table for old clients.
CREATE TABLE public.beta_subscriptions (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.beta_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY beta_own_read ON public.beta_subscriptions FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.beta_subscriptions FROM anon, authenticated;
GRANT SELECT ON public.beta_subscriptions TO authenticated;
CREATE FUNCTION public.set_beta_subscription(p_enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.beta_subscriptions(user_id,enabled) VALUES(auth.uid(),p_enabled)
 ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled, updated_at=now();
 IF p_enabled THEN
  INSERT INTO public.user_badges(user_id,badge_key,source) VALUES(auth.uid(),'beta-tester','auto') ON CONFLICT DO NOTHING;
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.set_beta_subscription(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_beta_subscription(boolean) TO authenticated;

CREATE TABLE public.update_device_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 channel text NOT NULL CHECK(channel IN ('stable','beta')),
 platform text NOT NULL CHECK(platform IN ('all','windows','macos','linux','android','android-tv','ios','web')),
 type text NOT NULL CHECK(type IN ('recommended','mandatory','rollback')),
 target_version text NOT NULL CHECK(target_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-beta(\.[0-9]+)?)?$'),
 rollback_from_version text,
 rollout_percentage integer NOT NULL DEFAULT 100 CHECK(rollout_percentage BETWEEN 0 AND 100),
 active boolean NOT NULL DEFAULT true, notes text CHECK(length(notes)<=10000),
 published_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
 CHECK(channel='beta' OR target_version !~ '-'),
 CHECK(type<>'rollback' OR rollback_from_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-beta(\.[0-9]+)?)?$'),
 CHECK(type<>'rollback' OR platform IN ('windows','macos','linux'))
);
CREATE UNIQUE INDEX update_device_policies_active ON public.update_device_policies(channel,platform) WHERE active;
ALTER TABLE public.update_device_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY device_policy_read ON public.update_device_policies FOR SELECT USING(true);
CREATE POLICY device_policy_admin ON public.update_device_policies FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND (is_admin OR role='admin')))
 WITH CHECK(EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND (is_admin OR role='admin')));
GRANT SELECT ON public.update_device_policies TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE ON public.update_device_policies TO authenticated;
-- Allow the existing admin controls to deactivate historical global policies too.
CREATE POLICY legacy_update_admin ON public.update_policies FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND (is_admin OR role='admin')))
 WITH CHECK(EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND (is_admin OR role='admin')));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.update_policies TO authenticated;

CREATE FUNCTION public.get_device_update_policy(p_channel text,p_platform text,p_device text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE selected public.update_device_policies; legacy jsonb; eligible boolean;
BEGIN
 IF p_channel NOT IN ('stable','beta') OR p_platform NOT IN ('windows','macos','linux','android','android-tv','ios','web') OR length(coalesce(p_device,'')) NOT BETWEEN 1 AND 200 THEN RETURN NULL; END IF;
 SELECT * INTO selected FROM public.update_device_policies
 WHERE channel=p_channel AND active AND platform IN ('all',p_platform)
 ORDER BY (platform=p_platform) DESC, published_at DESC LIMIT 1;
 IF FOUND THEN
  eligible := (hashtextextended(p_device||':'||selected.id::text,0) & 9223372036854775807) % 100 < selected.rollout_percentage;
  RETURN to_jsonb(selected) || jsonb_build_object('eligible',eligible);
 END IF;
 SELECT to_jsonb(p) INTO legacy FROM public.update_policies p WHERE channel=p_channel AND active ORDER BY published_at DESC LIMIT 1;
 RETURN legacy;
END; $$;
REVOKE ALL ON FUNCTION public.get_device_update_policy(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_device_update_policy(text,text,text) TO anon,authenticated;

CREATE TABLE public.app_update_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 device_id uuid NOT NULL, user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 platform text NOT NULL, channel text NOT NULL, version text NOT NULL, event text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_update_events_time ON public.app_update_events(occurred_at);
CREATE INDEX app_update_events_device_time ON public.app_update_events(device_id,occurred_at);
ALTER TABLE public.app_update_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_update_events FROM PUBLIC,anon,authenticated;
CREATE TABLE public.app_update_event_budget(day date PRIMARY KEY,used integer NOT NULL);
ALTER TABLE public.app_update_event_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_update_event_budget FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.record_app_update_event(p_device uuid,p_platform text,p_channel text,p_version text,p_event text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE budget integer;
BEGIN
 IF p_device IS NULL OR p_platform IS NULL OR p_channel IS NULL OR p_event IS NULL OR p_version IS NULL
  OR p_platform NOT IN ('windows','macos','linux','android','android-tv','ios','web')
  OR p_channel NOT IN ('production','beta') OR length(p_version)>60
  OR p_version !~ '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9a-zA-Z.-]+)?$'
  OR p_event NOT IN ('checked','offered','download_started','downloaded','installed','failed','opt_in','opt_out') THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('update-event:'||p_device::text,0));
 IF (SELECT count(*) FROM public.app_update_events WHERE device_id=p_device AND occurred_at>now()-interval '1 hour')>=40 THEN RETURN false; END IF;
 -- At most 10,000 rows/day globally and 90 days of retention. No payloads/IP/email.
 INSERT INTO public.app_update_event_budget(day,used) VALUES((now() AT TIME ZONE 'UTC')::date,1)
 ON CONFLICT(day) DO UPDATE SET used=app_update_event_budget.used+1 WHERE app_update_event_budget.used<10000 RETURNING used INTO budget;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO public.app_update_events(device_id,user_id,platform,channel,version,event) VALUES(p_device,auth.uid(),p_platform,p_channel,p_version,p_event);
 IF budget=1 THEN
  DELETE FROM public.app_update_events WHERE occurred_at<now()-interval '90 days';
  DELETE FROM public.app_update_event_budget WHERE day<current_date-90;
 END IF;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.record_app_update_event(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_app_update_event(uuid,text,text,text,text) TO anon,authenticated;

CREATE FUNCTION public.admin_update_analytics(p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND (is_admin OR role='admin')) THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
 WITH events AS (SELECT * FROM public.app_update_events WHERE occurred_at>=now()-make_interval(days=>greatest(1,least(coalesce(p_days,7),90)))),
 grouped AS (SELECT platform,channel,count(DISTINCT device_id) devices,
  count(*) FILTER(WHERE event='checked') checks,
  count(DISTINCT device_id) FILTER(WHERE event='offered') offered,
  count(DISTINCT device_id) FILTER(WHERE event='download_started') downloads,
  count(DISTINCT device_id) FILTER(WHERE event='downloaded') downloaded,
  count(DISTINCT device_id) FILTER(WHERE event='installed') installed,
  count(*) FILTER(WHERE event='failed') errors FROM events GROUP BY platform,channel),
 daily AS (SELECT (occurred_at AT TIME ZONE 'UTC')::date AS day,count(*) events,count(DISTINCT device_id) devices FROM events GROUP BY 1),
 versions AS (SELECT version,count(DISTINCT device_id) devices,count(*) FILTER(WHERE event='failed') errors FROM events GROUP BY version ORDER BY count(DISTINCT device_id) DESC LIMIT 20)
 SELECT jsonb_build_object('days',greatest(1,least(coalesce(p_days,7),90)),
  'devices',(SELECT count(DISTINCT device_id) FROM events),
  'checks',(SELECT count(*) FROM events WHERE event='checked'),
  'offered',(SELECT count(DISTINCT device_id) FROM events WHERE event='offered'),
  'downloads',(SELECT count(DISTINCT device_id) FROM events WHERE event='download_started'),
  'downloaded',(SELECT count(DISTINCT device_id) FROM events WHERE event='downloaded'),
  'installed',(SELECT count(DISTINCT device_id) FROM events WHERE event='installed'),
  'errors',(SELECT count(*) FROM events WHERE event='failed'),
  'beta_subscribers',(SELECT count(*) FROM public.beta_subscriptions WHERE enabled),
  'guest_beta_devices',(SELECT count(DISTINCT device_id) FROM events WHERE channel='beta' AND user_id IS NULL),
  'platforms',(SELECT coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) FROM grouped g),
  'daily',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY day),'[]'::jsonb) FROM daily d),
  'versions',(SELECT coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) FROM versions v)
 ) INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.admin_update_analytics(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_update_analytics(integer) TO authenticated;
