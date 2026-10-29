-- LOCAL ONLY: requires explicit approval before applying to production.
-- Catch-up recomputes existing users on their next signed-in foreground refresh.
-- Preserve every existing grant, the fixed OG cohort, staff roles and manual honors.
CREATE INDEX IF NOT EXISTS idx_content_provider_mappings_badge_external
  ON public.content_provider_mappings (external_id, tatakai_id) WHERE confidence_score >= 0.9;

CREATE OR REPLACE FUNCTION public.badge_activity_metrics(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb; activity jsonb;
BEGIN
  -- Internal only; callers below enforce self/staff access.
  WITH watched AS (
    SELECT * FROM public.watch_history WHERE user_id = p_user_id
      AND (completed OR progress_seconds >= 120)
  ), reading AS (
    SELECT * FROM public.manga_readlist WHERE user_id = p_user_id
      AND (last_chapter_number > 0 OR last_page_index > 0 OR last_chapter_key IS NOT NULL)
  ), days AS (
    SELECT (watched_at AT TIME ZONE 'Asia/Kolkata')::date AS day FROM watched
    UNION SELECT (updated_at AT TIME ZONE 'Asia/Kolkata')::date FROM reading
  )
  SELECT jsonb_build_object(
    'episodes', (SELECT count(DISTINCT episode_id) FROM watched),
    'distinct_anime', (SELECT count(DISTINCT anime_id) FROM watched),
    'night_episodes', (SELECT count(*) FROM watched WHERE extract(hour FROM watched_at AT TIME ZONE 'Asia/Kolkata') >= 22 OR extract(hour FROM watched_at AT TIME ZONE 'Asia/Kolkata') < 5),
    'daily_episodes', (SELECT coalesce(max(n),0) FROM (SELECT count(DISTINCT episode_id) n FROM watched GROUP BY (watched_at AT TIME ZONE 'Asia/Kolkata')::date) q),
    -- Stored progress gives chapter milestones, not a claim of page-by-page reading telemetry.
    'manga_chapters', (SELECT coalesce(sum(greatest(0, floor(coalesce(last_chapter_number,0)))),0) FROM reading WHERE format <> 'novel'),
    'novel_chapters', (SELECT coalesce(sum(greatest(0, floor(coalesce(last_chapter_number,0)))),0) FROM reading WHERE format = 'novel'),
    'reading_chapters', (SELECT coalesce(sum(greatest(0, floor(coalesce(last_chapter_number,0)))),0) FROM reading),
    'comments', (SELECT count(*) FROM public.comments WHERE user_id = p_user_id),
    'posts', (SELECT count(*) FROM public.forum_posts WHERE user_id = p_user_id),
    'community_likes', (SELECT coalesce(sum(greatest(0,likes_count)),0) FROM public.comments WHERE user_id = p_user_id)
      + (SELECT coalesce(sum(greatest(0,upvotes)),0) FROM public.forum_posts WHERE user_id = p_user_id),
    'published_tierlists', (SELECT count(*) FROM public.tier_lists WHERE user_id = p_user_id AND is_public),
    'ratings', (SELECT count(*) FROM public.ratings WHERE user_id = p_user_id),
    'completed_titles', (SELECT count(*) FROM public.watchlist WHERE user_id = p_user_id AND status = 'completed') + (SELECT count(*) FROM public.manga_readlist WHERE user_id = p_user_id AND status = 'completed'),
    'planned_titles', (SELECT count(*) FROM public.watchlist WHERE user_id = p_user_id AND status = 'plan_to_watch') + (SELECT count(*) FROM public.manga_readlist WHERE user_id = p_user_id AND status = 'plan_to_read'),
    'active_days', (SELECT count(*) FROM days),
    'active_months', (SELECT count(DISTINCT date_trunc('month', day)) FROM days)
  ) INTO activity;

  WITH history AS (
    SELECT DISTINCT anime_id AS id, 'anime'::text AS kind, NULL::text AS anilist, NULL::text AS mal
      FROM public.watch_history WHERE user_id = p_user_id AND (completed OR progress_seconds >= 120)
    UNION
    SELECT manga_id, CASE WHEN format = 'novel' THEN 'novel' ELSE 'manga' END,
      to_jsonb(m)->>'anilist_id', to_jsonb(m)->>'mal_id'
      FROM public.manga_readlist m WHERE user_id = p_user_id
        AND (last_chapter_number > 0 OR last_page_index > 0 OR last_chapter_key IS NOT NULL)
  ), matched AS (
    SELECT DISTINCT c.tatakai_id, c.genres, c.tags, c.start_date FROM history h
    JOIN LATERAL (
      SELECT c0.tatakai_id FROM public.content_items c0
        WHERE c0.tatakai_id = CASE WHEN h.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN h.id::uuid END
      UNION
      SELECT c1.tatakai_id FROM public.content_items c1 WHERE c1.anilist_id =
        CASE WHEN coalesce(h.anilist, regexp_replace(h.id, '^anilist:', '')) ~ '^[0-9]{1,9}$'
          THEN coalesce(h.anilist, regexp_replace(h.id, '^anilist:', ''))::integer END
      UNION
      SELECT c2.tatakai_id FROM public.content_items c2 WHERE c2.mal_id =
        CASE WHEN h.mal ~ '^[0-9]{1,9}$' THEN h.mal::integer END
      UNION
      SELECT pm.tatakai_id FROM public.content_provider_mappings pm
        WHERE pm.external_id = h.id AND pm.confidence_score >= 0.9
    ) resolved ON true
    JOIN public.content_items c ON c.tatakai_id = resolved.tatakai_id AND CASE WHEN h.kind = 'anime' THEN c.format IN ('TV','TV_SHORT','MOVIE','SPECIAL','OVA','ONA','MUSIC')
      WHEN h.kind = 'novel' THEN c.format = 'NOVEL' ELSE c.format IN ('MANGA','ONE_SHOT') END
  ), labels AS (
    SELECT tatakai_id, lower(g) AS label FROM matched CROSS JOIN LATERAL unnest(genres) g
    UNION
    SELECT tatakai_id, lower(CASE WHEN jsonb_typeof(t) = 'object' THEN t->>'name' ELSE t #>> '{}' END)
      FROM matched CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(tags) = 'array' THEN tags ELSE '[]'::jsonb END) t
  )
  SELECT activity || jsonb_build_object(
    'distinct_titles', (SELECT count(*) FROM matched),
    'genres', (SELECT count(DISTINCT lower(g)) FROM matched CROSS JOIN LATERAL unnest(genres) g),
    'harem', (SELECT count(DISTINCT tatakai_id) FROM labels WHERE label IN ('harem','reverse harem')),
    'action', (SELECT count(DISTINCT tatakai_id) FROM labels WHERE label = 'action'),
    'isekai', (SELECT count(DISTINCT tatakai_id) FROM labels WHERE label IN ('isekai','reincarnation','summoned into another world')),
    'romance', (SELECT count(DISTINCT tatakai_id) FROM labels WHERE label = 'romance'),
    'dark_titles', (SELECT count(DISTINCT tatakai_id) FROM labels WHERE label IN ('tragedy','psychological','horror','dystopian')),
    'recent_titles', (SELECT count(*) FROM matched WHERE CASE WHEN (start_date->>'year') ~ '^\d{4}$' THEN (start_date->>'year')::integer ELSE 0 END >= extract(year FROM current_date)::integer - 1)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.badge_activity_metrics(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recompute_user_badges(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE metrics jsonb;
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> p_user_id AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND
      (is_admin OR is_moderator OR role IN ('admin','moderator'))
  )) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('badge-recompute:' || p_user_id::text, 0));
  metrics := public.badge_activity_metrics(p_user_id);
  INSERT INTO public.user_badges(user_id, badge_key, source)
  SELECT p_user_id, rule.badge_key, 'auto' FROM (VALUES
    ('centurion', 'episodes', 100),
    ('millennium', 'episodes', 1000),
    ('explorer', 'distinct_anime', 50),
    ('reputation', 'community_likes', 20),
    ('harem', 'harem', 5),
    ('action', 'action', 5),
    ('isekai', 'isekai', 5),
    ('romance', 'romance', 5),
    ('omniscient', 'genres', 10),
    ('night-owl', 'night_episodes', 20),
    ('binge-lord', 'daily_episodes', 6),
    ('critic', 'ratings', 50),
    ('commentator', 'comments', 25),
    ('tastemaker', 'published_tierlists', 5),
    ('manga-sage', 'manga_chapters', 500),
    ('doomer', 'dark_titles', 5),
    ('completionist', 'completed_titles', 25),
    ('trendsetter', 'recent_titles', 5),
    ('guild-coin', 'posts', 10),
    ('dream-token', 'planned_titles', 25),
    ('lucky-medal', 'active_days', 7),
    ('challenger-coin', 'active_days', 30),
    ('gold-sheaf-ticket', 'ratings', 100),
    ('labyrinth-token', 'distinct_titles', 100),
    ('tide-shells', 'active_months', 3),
    ('dragonbone-stamps', 'distinct_titles', 250),
    ('dragon-crystal-abyssal', 'episodes', 2500),
    ('bound-dragon-crystal-abyssal', 'episodes', 5000),
    ('badge-of-valor-temporal-rift', 'active_days', 365),
    ('chapter-pilgrim', 'novel_chapters', 10),
    ('scroll-keeper', 'novel_chapters', 50),
    ('inkbound-scholar', 'novel_chapters', 100),
    ('grand-archivist', 'novel_chapters', 250),
    ('celestial-scribe', 'novel_chapters', 500),
    ('first-episode', 'episodes', 1),
    ('first-manga', 'manga_chapters', 1),
    ('first-novel', 'novel_chapters', 1),
    ('genre-star', 'genres', 5),
    ('discussion-star', 'comments', 100),
    ('watch-star', 'episodes', 500),
    ('reading-star', 'reading_chapters', 1000),
    ('catalog-star', 'distinct_titles', 500)
  ) AS rule(badge_key, metric, threshold)
  WHERE coalesce((metrics->>rule.metric)::numeric,0) >= rule.threshold
  ON CONFLICT (user_id, badge_key) DO NOTHING;
  PERFORM public.recompute_featured_badge(p_user_id);
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_user_badges(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_user_badges(uuid) TO authenticated;

-- Preserve the owner/staff guard and SQL CASE fix while adding current badge ranks.
CREATE OR REPLACE FUNCTION public.recompute_featured_badge(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_featured text;
  v_is_admin boolean;
  v_is_moderator boolean;
  v_badges text[];
  v_badge record;
  v_rarity_order int;
  v_best_rarity int := 999;
  v_best_animated boolean := false;
  v_best_key text := null;
BEGIN
  -- Permission: own profile or staff
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF auth.uid() <> p_user_id THEN
    -- Check staff
    SELECT is_admin, is_moderator INTO v_is_admin, v_is_moderator
    FROM profiles WHERE user_id = auth.uid();
    IF NOT COALESCE(v_is_admin, false) AND NOT COALESCE(v_is_moderator, false) THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  END IF;

  -- Gather stored badges
  SELECT array_agg(badge_key) INTO v_badges
  FROM user_badges
  WHERE user_id = p_user_id;

  -- Add derived role badges (admin/mod)
  SELECT is_admin, is_moderator INTO v_is_admin, v_is_moderator
  FROM profiles WHERE user_id = p_user_id;

  v_badges := COALESCE(v_badges, ARRAY[]::text[]);
  IF COALESCE(v_is_admin, false) THEN
    v_badges := array_append(v_badges, 'admin');
  ELSIF COALESCE(v_is_moderator, false) THEN
    v_badges := array_append(v_badges, 'mod');
  END IF;

  IF array_length(v_badges, 1) IS NULL OR array_length(v_badges, 1) = 0 THEN
    -- No badges → null
    UPDATE profiles SET featured_badge_key = NULL WHERE user_id = p_user_id;
    RETURN NULL;
  END IF;

  -- Pick the best badge: rarity (mythic=0..common=4) > animated > alphabetical.
  -- Hard-coded badge rarities (sync with badges.ts RARITY_ORDER):
  FOR v_badge IN
    SELECT
      earned.key,
      CASE earned.key
        WHEN 'beta-tester' THEN 3
        WHEN 'catalog-star' THEN 0
        WHEN 'celestial-scribe' THEN 0
        WHEN 'reading-star' THEN 1
        WHEN 'grand-archivist' THEN 1
        WHEN 'watch-star' THEN 2
        WHEN 'inkbound-scholar' THEN 2
        WHEN 'genre-star' THEN 3
        WHEN 'discussion-star' THEN 3
        WHEN 'scroll-keeper' THEN 3
        -- Mythic (0)
        WHEN 'owner' THEN 0
        WHEN 'omniscient' THEN 0
        WHEN 'legend' THEN 0
        WHEN 'og' THEN 0
        WHEN 'bound-dragon-crystal-abyssal' THEN 0
        -- Legendary (1)
        WHEN 'admin' THEN 1
        WHEN 'developer' THEN 1
        WHEN 'premium-ultra' THEN 1
        WHEN 'millennium' THEN 1
        WHEN 'completionist' THEN 1
        WHEN 'diamond' THEN 1
        WHEN 'dragon-crystal-abyssal' THEN 1
        WHEN 'badge-of-valor-temporal-rift' THEN 1
        -- Epic (2)
        WHEN 'mod' THEN 2
        WHEN 'partner' THEN 2
        WHEN 'premium-pro' THEN 2
        WHEN 'explorer' THEN 2
        WHEN 'reputation' THEN 2
        WHEN 'binge-lord' THEN 2
        WHEN 'tastemaker' THEN 2
        WHEN 'manga-sage' THEN 2
        WHEN 'trendsetter' THEN 2
        WHEN 'mithril' THEN 2
        WHEN 'hero-coin' THEN 2
        WHEN 'labyrinth-token' THEN 2
        WHEN 'dragonbone-stamps' THEN 2
        -- Rare (3)
        WHEN 'booster' THEN 3
        WHEN 'premium-go' THEN 3
        WHEN 'centurion' THEN 3
        WHEN 'harem' THEN 3
        WHEN 'action' THEN 3
        WHEN 'isekai' THEN 3
        WHEN 'romance' THEN 3
        WHEN 'critic' THEN 3
        WHEN 'doomer' THEN 3
        WHEN 'guild-coin' THEN 3
        WHEN 'dream-token' THEN 3
        WHEN 'challenger-coin' THEN 3
        WHEN 'gold-sheaf-ticket' THEN 3
        -- Common (4)
        ELSE 4
      END AS rarity_order,
      CASE earned.key
        WHEN 'booster' THEN true
        WHEN 'premium-pro' THEN true
        WHEN 'premium-ultra' THEN true
        WHEN 'millennium' THEN true
        WHEN 'omniscient' THEN true
        WHEN 'completionist' THEN true
        WHEN 'legend' THEN true
        WHEN 'diamond' THEN true
        WHEN 'dragon-crystal-abyssal' THEN true
        WHEN 'bound-dragon-crystal-abyssal' THEN true
        WHEN 'badge-of-valor-temporal-rift' THEN true
        ELSE false
      END AS animated
    FROM unnest(v_badges) AS earned(key)
  LOOP
    v_rarity_order := v_badge.rarity_order;
    IF v_rarity_order < v_best_rarity THEN
      v_best_rarity := v_rarity_order;
      v_best_animated := v_badge.animated;
      v_best_key := v_badge.key;
    ELSIF v_rarity_order = v_best_rarity THEN
      IF v_badge.animated AND NOT v_best_animated THEN
        v_best_animated := true;
        v_best_key := v_badge.key;
      ELSIF v_badge.animated = v_best_animated AND v_badge.key < v_best_key THEN
        v_best_key := v_badge.key;
      END IF;
    END IF;
  END LOOP;

  -- Store the result
  UPDATE profiles SET featured_badge_key = v_best_key WHERE user_id = p_user_id;
  RETURN v_best_key;
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_featured_badge(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_featured_badge(uuid) TO authenticated;
