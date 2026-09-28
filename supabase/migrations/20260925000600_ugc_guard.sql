-- =============================================================================
-- UGC guard: server-side automod + rate-limit backstop for user content
--
-- The client already runs moderateContent() (src/lib/autoModeration.ts) and an
-- in-memory rate limiter before inserting comments / forum_posts / reports, but
-- those writes go straight to Supabase from the browser, so a caller hitting the
-- REST endpoint directly bypasses all of it. This migration re-enforces the
-- BLOCKING subset of automod (piracy sources / magnet links + hard-drug terms —
-- the same critical/high patterns that hard-block client-side) and a per-user
-- rate limit at the database layer, via BEFORE INSERT triggers that cannot be
-- bypassed. Staff (public.is_staff) and trusted service/unauthenticated paths
-- (auth.uid() IS NULL) are exempt so moderation tools and server jobs are never
-- throttled or filtered.
--
-- Also widens reports.target_type's CHECK: ReportModal submits 'post' /
-- 'tierlist' / 'playlist', none of which were in the original constraint, so
-- those reports failed to insert. See src/components/ui/ReportModal.tsx.
--
-- The comments trigger binds to the live anime-only comments.content column; if
-- the unapplied polymorphic-comments redesign lands, revisit this trigger.
-- Requires public.is_staff() from 20260925000000.
--
-- WRITTEN, NOT APPLIED — repo standing rule.
-- =============================================================================

-- Indexes backing the trailing-window rate-limit counts.
CREATE INDEX IF NOT EXISTS idx_comments_user_created
  ON public.comments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_user_created
  ON public.forum_posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_created
  ON public.reports (reporter_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Automod backstop. Returns the violation category ('illegal' | 'piracy') when
-- the text hits a BLOCKING pattern, else NULL. Mirrors the critical/high
-- patterns in src/lib/autoModeration.ts (medium/low there are masked, not
-- blocked, so they are intentionally not enforced here). Strips HTML tags and
-- decodes the few entities that could reconstitute a flagged word, matching the
-- client's scanText projection.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ugc_automod_violation(p_text text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_scan text;
BEGIN
  IF p_text IS NULL OR length(p_text) = 0 THEN
    RETURN NULL;
  END IF;
  v_scan := regexp_replace(p_text, '<[^>]+>', ' ', 'g');
  v_scan := replace(v_scan, '&nbsp;', ' ');
  v_scan := replace(v_scan, '&lt;', '<');
  v_scan := replace(v_scan, '&gt;', '>');
  v_scan := replace(v_scan, '&amp;', '&');

  -- critical: hard drugs
  IF v_scan ~* '\y(cocaine|heroin|methamphetamine|fentanyl)\y' THEN
    RETURN 'illegal';
  END IF;
  -- high: known piracy sources / magnet links
  IF v_scan ~* '\y(gogoanime|9anime|kissanime|animekisa)\y'
     OR v_scan ~* 'magnet:\?'
     OR v_scan ~* 'zoro\.to' THEN
    RETURN 'piracy';
  END IF;
  RETURN NULL;
END;
$$;

-- -----------------------------------------------------------------------------
-- Comments: max 10 / 60s per user + automod on the body.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_comments_ugc_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_recent int;
  v_violation text;
BEGIN
  IF v_actor IS NULL OR public.is_staff(v_actor) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_recent FROM public.comments
    WHERE user_id = v_actor AND created_at > now() - interval '60 seconds';
  IF v_recent >= 10 THEN
    RAISE EXCEPTION 'UGC_RATE_LIMIT: too many comments, slow down';
  END IF;

  v_violation := public.ugc_automod_violation(NEW.content);
  IF v_violation IS NOT NULL THEN
    RAISE EXCEPTION 'UGC_AUTOMOD_BLOCKED: %', v_violation;
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Forum posts: max 5 / 300s per user + automod on title + body.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_forum_posts_ugc_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_recent int;
  v_violation text;
BEGIN
  IF v_actor IS NULL OR public.is_staff(v_actor) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_recent FROM public.forum_posts
    WHERE user_id = v_actor AND created_at > now() - interval '300 seconds';
  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'UGC_RATE_LIMIT: too many posts, slow down';
  END IF;

  v_violation := public.ugc_automod_violation(coalesce(NEW.title,'') || ' ' || coalesce(NEW.content,''));
  IF v_violation IS NOT NULL THEN
    RAISE EXCEPTION 'UGC_AUTOMOD_BLOCKED: %', v_violation;
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Reports: max 8 / 3600s per reporter + automod on the free-text details.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_reports_ugc_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_recent int;
  v_violation text;
BEGIN
  IF v_actor IS NULL OR public.is_staff(v_actor) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_recent FROM public.reports
    WHERE reporter_id = v_actor AND created_at > now() - interval '3600 seconds';
  IF v_recent >= 8 THEN
    RAISE EXCEPTION 'UGC_RATE_LIMIT: too many reports, try again later';
  END IF;

  v_violation := public.ugc_automod_violation(coalesce(NEW.reason,'') || ' ' || coalesce(NEW.details,''));
  IF v_violation IS NOT NULL THEN
    RAISE EXCEPTION 'UGC_AUTOMOD_BLOCKED: %', v_violation;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comments_ugc_guard ON public.comments;
CREATE TRIGGER trg_comments_ugc_guard
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_comments_ugc_guard();

DROP TRIGGER IF EXISTS trg_forum_posts_ugc_guard ON public.forum_posts;
CREATE TRIGGER trg_forum_posts_ugc_guard
  BEFORE INSERT ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.tg_forum_posts_ugc_guard();

DROP TRIGGER IF EXISTS trg_reports_ugc_guard ON public.reports;
CREATE TRIGGER trg_reports_ugc_guard
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_reports_ugc_guard();

-- -----------------------------------------------------------------------------
-- Widen reports.target_type so the report types the UI actually submits
-- ('post','tierlist','playlist') pass. Drops whatever the existing CHECK is
-- named, then re-adds a superset (both the UI spellings and the canonical ones).
-- -----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.reports'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%target_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.reports DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN (
    'user','comment','server','anime','other',
    'forum_post','post','tier_list','tierlist','playlist'
  ));

COMMENT ON FUNCTION public.ugc_automod_violation(text) IS
  'Server-side automod backstop; returns blocking violation category or NULL. Mirrors the critical/high patterns of src/lib/autoModeration.ts.';

