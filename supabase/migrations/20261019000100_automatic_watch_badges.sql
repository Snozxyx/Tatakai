-- Award supported watch milestones as history is saved, rather than requiring
-- an administrator to press Recompute. Keep milestone grants once earned.
CREATE OR REPLACE FUNCTION public.sync_watch_badges(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE episodes bigint; series bigint;
BEGIN
  SELECT count(*), count(DISTINCT anime_id) INTO episodes, series
    FROM public.watch_history WHERE user_id = p_user_id;
  INSERT INTO public.user_badges(user_id, badge_key, source)
  SELECT p_user_id, earned.badge_key, 'auto'
  FROM (VALUES ('centurion', episodes >= 100), ('millennium', episodes >= 1000),
    ('explorer', series >= 50)) AS earned(badge_key, eligible)
  WHERE earned.eligible
  ON CONFLICT (user_id, badge_key) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_watch_badges(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recompute_user_badges(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR (p_user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
      AND (is_admin OR is_moderator OR role IN ('admin', 'moderator'))
  )) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = 'no_data_found';
  END IF;
  -- OG remains the fixed milestone cohort. Recomputing must not grant it to
  -- later accounts or remove historical/admin-granted rewards.
  PERFORM public.sync_watch_badges(p_user_id);
  PERFORM public.recompute_featured_badge(p_user_id);
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_user_badges(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_user_badges(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.award_watch_history_badges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.sync_watch_badges(NEW.user_id);
  -- Signed-in saves can also equip immediately. Service imports are reconciled
  -- by the authenticated catch-up on the next sign-in.
  IF auth.uid() = NEW.user_id THEN
    PERFORM public.recompute_featured_badge(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.award_watch_history_badges() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS award_watch_history_badges ON public.watch_history;
CREATE TRIGGER award_watch_history_badges AFTER INSERT ON public.watch_history
  FOR EACH ROW EXECUTE FUNCTION public.award_watch_history_badges();
