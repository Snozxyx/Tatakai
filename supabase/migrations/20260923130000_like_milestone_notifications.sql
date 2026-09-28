-- =============================================================================
-- Like-milestone notifications — comments AND feed (forum) posts.
--
-- Notify a content author when their content crosses a like threshold:
--   1, 10, 50, 200, 500, then every +100 (600, 700, ...).
--
-- Two AFTER INSERT triggers, both SECURITY DEFINER (end users cannot INSERT into
-- notifications directly — RLS requires the moderator role; the UPDATE-restrict
-- trigger in 20260902000001 already lets SECURITY DEFINER writers through):
--
--   * comment_likes  -> the liked comment's author  (any surface)
--   * reactions      -> the liked forum/feed post's author  (like reactions only)
--
-- Design notes:
--   * The count is computed authoritatively with count(*), not read from a
--     running counter, so it is order-independent and correct even if the
--     per-row like triggers fire in a different order.
--   * Self-likes never notify.
--   * A dedup guard skips a milestone that was already sent for the same entity,
--     so an unlike -> relike around a threshold does not re-ping the author.
--   * Comment deep links branch per entity_type, mirroring notify_on_comment()
--     as rewritten in 20260923120000_unify_comments.sql.
--
-- WRITTEN, NOT APPLIED — repo standing rule. Validate: npm run check:migrations.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Comment like milestones.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_comment_like_milestone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count       INTEGER;
  v_author      UUID;
  v_entity_type TEXT;
  v_entity_id   TEXT;
  v_episode_id  TEXT;
  v_content     TEXT;
  liker_name    TEXT;
  preview       TEXT;
  link          TEXT;
  notif_title   TEXT;
BEGIN
  -- Author + surface of the liked comment.
  SELECT user_id, entity_type, entity_id, episode_id, content
    INTO v_author, v_entity_type, v_entity_id, v_episode_id, v_content
    FROM public.comments
   WHERE id = NEW.comment_id;

  -- Comment gone, or a self-like: nothing to celebrate.
  IF v_author IS NULL OR v_author = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Authoritative count (order-independent, unlike a running counter).
  SELECT count(*) INTO v_count
    FROM public.comment_likes
   WHERE comment_id = NEW.comment_id;

  -- Milestones: 1, 10, 50, 200, 500, then every +100.
  IF NOT (v_count IN (1, 10, 50, 200, 500) OR (v_count > 500 AND v_count % 100 = 0)) THEN
    RETURN NEW;
  END IF;

  -- Dedup: never ping the same milestone twice for this comment.
  IF EXISTS (
    SELECT 1 FROM public.notifications
     WHERE user_id = v_author
       AND data->>'type' = 'like_milestone'
       AND data->>'entity_id' = NEW.comment_id::text
       AND (data->>'milestone')::int = v_count
  ) THEN
    RETURN NEW;
  END IF;

  preview := COALESCE(NULLIF(LEFT(v_content, 140), ''), 'your comment');

  link := CASE v_entity_type
    WHEN 'anime' THEN '/anime/' || v_entity_id
         || CASE WHEN v_episode_id IS NOT NULL
                 THEN '?episode=' || v_episode_id ELSE '' END
    WHEN 'manga' THEN '/manga/' || v_entity_id
    WHEN 'playlist' THEN '/playlist/' || v_entity_id
    WHEN 'forum_post' THEN '/community/forum/' || v_entity_id
    WHEN 'tier_list' THEN COALESCE(
      (SELECT '/tierlist/' || t.share_code FROM public.tier_lists t
        WHERE t.id = v_entity_id::uuid AND t.share_code IS NOT NULL),
      '/tierlists')
    ELSE '/'
  END || '#comment-' || NEW.comment_id::text;
  IF v_count = 1 THEN
    SELECT COALESCE(display_name, username, 'Someone') INTO liker_name
      FROM public.profiles WHERE user_id = NEW.user_id;
    notif_title := COALESCE(liker_name, 'Someone') || ' liked your comment';
  ELSE
    notif_title := 'Your comment reached ' || v_count || ' likes 🎉';
  END IF;

  INSERT INTO public.notifications (user_id, title, body, data)
  VALUES (
    v_author,
    notif_title,
    preview,
    jsonb_build_object(
      'type', 'like_milestone',
      'kind', 'comment',
      'entity_id', NEW.comment_id,
      'milestone', v_count,
      'from_user', NEW.user_id,
      'link', link
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_comment_like_milestone ON public.comment_likes;
CREATE TRIGGER trg_notify_on_comment_like_milestone
  AFTER INSERT ON public.comment_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment_like_milestone();

-- ---------------------------------------------------------------------------
-- 2) Feed / forum post like milestones.
--
-- Feed likes are `reactions` rows (entity_type='forum_post', reaction_type=
-- 'like') — there is no likes_count column to hang off, so the count is a
-- count(*) over the matching reactions. The trigger's WHEN clause keeps the
-- function from running for non-like reactions or other entity types.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_post_like_milestone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count     INTEGER;
  v_author    UUID;
  v_title     TEXT;
  liker_name  TEXT;
  link        TEXT;
  notif_title TEXT;
BEGIN
  -- Author of the liked feed/forum post.
  SELECT user_id, title INTO v_author, v_title
    FROM public.forum_posts
   WHERE id = NEW.entity_id;

  IF v_author IS NULL OR v_author = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.reactions
   WHERE entity_type = 'forum_post'
     AND entity_id = NEW.entity_id
     AND reaction_type = 'like';

  IF NOT (v_count IN (1, 10, 50, 200, 500) OR (v_count > 500 AND v_count % 100 = 0)) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notifications
     WHERE user_id = v_author
       AND data->>'type' = 'like_milestone'
       AND data->>'entity_id' = NEW.entity_id::text
       AND (data->>'milestone')::int = v_count
  ) THEN
    RETURN NEW;
  END IF;
  link := '/community/forum/' || NEW.entity_id::text;

  IF v_count = 1 THEN
    SELECT COALESCE(display_name, username, 'Someone') INTO liker_name
      FROM public.profiles WHERE user_id = NEW.user_id;
    notif_title := COALESCE(liker_name, 'Someone') || ' liked your post';
  ELSE
    notif_title := 'Your post reached ' || v_count || ' likes 🎉';
  END IF;

  INSERT INTO public.notifications (user_id, title, body, data)
  VALUES (
    v_author,
    notif_title,
    COALESCE(NULLIF(LEFT(v_title, 140), ''), 'your post'),
    jsonb_build_object(
      'type', 'like_milestone',
      'kind', 'forum_post',
      'entity_id', NEW.entity_id,
      'milestone', v_count,
      'from_user', NEW.user_id,
      'link', link
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_post_like_milestone ON public.reactions;
CREATE TRIGGER trg_notify_on_post_like_milestone
  AFTER INSERT ON public.reactions
  FOR EACH ROW
  WHEN (NEW.entity_type = 'forum_post' AND NEW.reaction_type = 'like')
  EXECUTE FUNCTION public.notify_on_post_like_milestone();

