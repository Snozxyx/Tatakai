BEGIN;

-- Capture the milestone cohort once, at migration time. Future signups are not OGs.
CREATE TABLE IF NOT EXISTS public.badge_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL UNIQUE REFERENCES public.user_badges(id) ON DELETE CASCADE,
  badge_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz
);
ALTER TABLE public.badge_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY badge_rewards_own_read ON public.badge_rewards FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.badge_rewards TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.badge_rewards FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.queue_badge_reward()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.badge_rewards(user_id,badge_id,badge_key) VALUES(NEW.user_id,NEW.id,NEW.badge_key)
  ON CONFLICT (badge_id) DO NOTHING;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.queue_badge_reward() FROM PUBLIC;
CREATE TRIGGER queue_badge_reward AFTER INSERT ON public.user_badges FOR EACH ROW EXECUTE FUNCTION public.queue_badge_reward();

INSERT INTO public.user_badges(user_id,badge_key,source,note)
SELECT user_id,'og','admin','1,000-member milestone: existing member cohort, 2026-10-15' FROM public.profiles
ON CONFLICT(user_id,badge_key) DO UPDATE SET source='admin',note=EXCLUDED.note;
-- Include existing OGs, who also deserve the new reward reveal.
INSERT INTO public.badge_rewards(user_id,badge_id,badge_key)
SELECT user_id,id,badge_key FROM public.user_badges WHERE badge_key='og'
ON CONFLICT(badge_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_badge_reward(p_reward_id uuid, p_equip boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE reward public.badge_rewards;
BEGIN
  SELECT * INTO reward FROM public.badge_rewards WHERE id=p_reward_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reward not found' USING ERRCODE='insufficient_privilege'; END IF;
  IF reward.seen_at IS NOT NULL THEN RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_badges WHERE id=reward.badge_id AND user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Badge no longer owned';
  END IF;
  IF p_equip THEN UPDATE public.profiles SET featured_badge_key=reward.badge_key WHERE user_id=auth.uid(); END IF;
  UPDATE public.badge_rewards SET seen_at=now() WHERE id=reward.id;
END; $$;
REVOKE ALL ON FUNCTION public.claim_badge_reward(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_badge_reward(uuid,boolean) TO authenticated;

INSERT INTO public.app_config(key,value) VALUES('community_image_approval_required','false') ON CONFLICT(key) DO NOTHING;
CREATE OR REPLACE FUNCTION public.protect_community_approval_setting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
    (TG_OP<>'INSERT' AND OLD.key='community_image_approval_required') OR
    (TG_OP<>'DELETE' AND NEW.key='community_image_approval_required')
  ) AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND (is_admin OR role='admin')) THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE='insufficient_privilege';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.protect_community_approval_setting() FROM PUBLIC;
CREATE TRIGGER protect_community_approval_setting BEFORE INSERT OR UPDATE OR DELETE ON public.app_config FOR EACH ROW EXECUTE FUNCTION public.protect_community_approval_setting();
-- This gate is authoritative: clients cannot bypass an enabled approval policy.
CREATE OR REPLACE FUNCTION public.enforce_community_image_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE required boolean; staff boolean; episodes bigint;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.app_config WHERE key='community_image_approval_required' AND value='true') INTO required;
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND (is_admin OR is_moderator OR role IN ('admin','moderator'))) INTO staff;
  IF auth.uid() IS NULL OR staff THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.image_url IS NOT DISTINCT FROM OLD.image_url THEN
    NEW.is_approved=OLD.is_approved;
    RETURN NEW;
  END IF;
  IF NOT required THEN NEW.is_approved=true; RETURN NEW; END IF;
  IF nullif(NEW.image_url,'') IS NOT NULL THEN
    SELECT count(*) INTO episodes FROM public.watch_history WHERE user_id=NEW.user_id;
    -- Staff can still approve queued posts; high-rank exemptions use the client rank threshold.
    NEW.is_approved = episodes >= 20;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enforce_community_image_approval() FROM PUBLIC;
CREATE TRIGGER enforce_community_image_approval BEFORE INSERT OR UPDATE ON public.forum_posts FOR EACH ROW EXECUTE FUNCTION public.enforce_community_image_approval();
COMMIT;
