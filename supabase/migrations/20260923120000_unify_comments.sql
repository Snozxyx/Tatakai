-- =============================================================================
-- Unify every comment system into ONE polymorphic public.comments table.
--
-- Before — four parallel systems:
--   * comments            (anime / manga, rich: gif / poll / mention / embed)
--   * playlist_comments    (plain text, playlist-private)
--   * tier_list_comments   (+ tier_list_comment_likes, plain text)
--   * forum_comments       (plain text, up/down votes via forum_votes)
--
-- After — one public.comments keyed by (entity_type, entity_id). The rich
-- feature set is available on every surface. episode_id stays anime-only.
--
-- DESTRUCTIVE: DELETES all existing comment rows, DROPS the three legacy tables
-- (+ tier_list_comment_likes) and their triggers / functions / RPCs / policies,
-- and collapses forum comment up/down votes into the single comment_likes model.
-- To KEEP existing anime/manga comments instead of wiping, delete Section 0 and
-- change the backfill in Section 1 to derive entity_type from the manga: prefix.
--
-- WRITTEN, NOT APPLIED — repo standing rule. Validate: npm run check:migrations.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Wipe existing comment data (approved). comment_likes / comment_polls /
--    comment_poll_votes cascade off comments via their FKs.
-- ---------------------------------------------------------------------------
DELETE FROM public.comments;

-- ---------------------------------------------------------------------------
-- 1) Make public.comments polymorphic.
-- ---------------------------------------------------------------------------
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id   text;

-- Table is empty after Section 0; this backfill is a no-op kept for intent.
UPDATE public.comments
   SET entity_type = CASE WHEN anime_id LIKE 'manga:%' THEN 'manga' ELSE 'anime' END,
       entity_id   = regexp_replace(anime_id, '^manga:', '')
 WHERE entity_id IS NULL;

ALTER TABLE public.comments
  ALTER COLUMN entity_type SET NOT NULL,
  ALTER COLUMN entity_id   SET NOT NULL;

-- anime_id is superseded by (entity_type, entity_id).
-- The leaderboard_most_comments view reads c.anime_id, so it must be dropped
-- before the column and recreated against the polymorphic schema (Section 1b).
DROP VIEW IF EXISTS public.leaderboard_most_comments;
DROP INDEX IF EXISTS public.idx_comments_anime_id;
DROP INDEX IF EXISTS public.idx_comments_anime_episode;
ALTER TABLE public.comments DROP COLUMN IF EXISTS anime_id;

-- Constrain entity_type; episode_id stays anime-only.
ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_entity_type_check;
ALTER TABLE public.comments
  ADD CONSTRAINT comments_entity_type_check
  CHECK (entity_type IN ('anime','manga','playlist','tier_list','forum_post'));

ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_episode_scope_check;
ALTER TABLE public.comments
  ADD CONSTRAINT comments_episode_scope_check
  CHECK (episode_id IS NULL OR entity_type = 'anime');

CREATE INDEX IF NOT EXISTS idx_comments_entity
  ON public.comments (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_entity_episode
  ON public.comments (entity_type, entity_id, episode_id);

-- ---------------------------------------------------------------------------
-- 1b) Recreate leaderboard_most_comments against the polymorphic schema.
--     "unique_anime_commented" keeps its name for API compatibility but now
--     counts distinct entities (any type) the user has commented on.
-- ---------------------------------------------------------------------------
CREATE VIEW public.leaderboard_most_comments AS
SELECT
  p.id,
  p.username,
  p.avatar_url,
  COUNT(c.id) AS total_comments,
  COUNT(DISTINCT (c.entity_type || ':' || c.entity_id)) AS unique_anime_commented,
  MAX(c.created_at) AS last_comment_at
FROM public.profiles p
INNER JOIN public.comments c ON c.user_id = p.id
WHERE p.banned_at IS NULL
GROUP BY p.id, p.username, p.avatar_url
HAVING COUNT(c.id) > 0
ORDER BY total_comments DESC
LIMIT 100;

GRANT SELECT ON public.leaderboard_most_comments TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2) Playlist-privacy visibility helper (SECURITY DEFINER).
--    anime / manga / tier_list / forum_post comments are world-readable;
--    playlist comments follow the playlist's own visibility.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_playlist(pid text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puid uuid;
BEGIN
  BEGIN
    puid := pid::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN EXISTS (
    SELECT 1 FROM public.playlists p
    WHERE p.id = puid
      AND (
        p.is_public = true
        OR p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.playlist_collaborators pc
          WHERE pc.playlist_id = p.id AND pc.user_id = auth.uid()
        )
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_playlist(text) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3) RLS: entity-aware reads / inserts that respect playlist privacy.
--    The own-or-staff UPDATE / DELETE policies only reference user_id + roles,
--    so they survive the anime_id drop untouched.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.comments;
CREATE POLICY "Comments are viewable when their entity is"
  ON public.comments FOR SELECT
  USING (
    entity_type <> 'playlist'
    OR public.can_view_playlist(entity_id)
  );

DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.comments;
CREATE POLICY "Authenticated users can create comments"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      entity_type <> 'playlist'
      OR public.can_view_playlist(entity_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4) forum_posts.comments_count now derives from the unified table.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_forum_comment_count ON public.forum_comments;
DROP FUNCTION IF EXISTS public.update_forum_comment_count() CASCADE;

CREATE OR REPLACE FUNCTION public.sync_forum_post_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.entity_type = 'forum_post' THEN
    UPDATE public.forum_posts SET comments_count = comments_count + 1
     WHERE id = NEW.entity_id::uuid;
  ELSIF TG_OP = 'DELETE' AND OLD.entity_type = 'forum_post' THEN
    UPDATE public.forum_posts SET comments_count = GREATEST(comments_count - 1, 0)
     WHERE id = OLD.entity_id::uuid;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_forum_post_comment_count ON public.comments;
CREATE TRIGGER trg_sync_forum_post_comment_count
  AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_forum_post_comment_count();

-- ---------------------------------------------------------------------------
-- 5) Rewrite notify_on_comment() to branch the deep link per entity_type and
--    carry entity_type / entity_id in the payload instead of anime_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  commenter_name     TEXT;
  commenter_username TEXT;
  preview            TEXT;
  link               TEXT;
  mentioned          UUID;
  parent_author      UUID;
BEGIN
  SELECT COALESCE(display_name, username, 'Someone'), username
    INTO commenter_name, commenter_username
    FROM public.profiles
   WHERE user_id = NEW.user_id;

  commenter_name := COALESCE(commenter_name, 'Someone');
  preview := COALESCE(NULLIF(LEFT(NEW.content, 140), ''), 'Sent an attachment');

  -- Deep link consumed by the notification list / bell, per surface.
  link := CASE NEW.entity_type
    WHEN 'anime' THEN '/anime/' || NEW.entity_id
         || CASE WHEN NEW.episode_id IS NOT NULL
                 THEN '?episode=' || NEW.episode_id ELSE '' END
    WHEN 'manga' THEN '/manga/' || NEW.entity_id
    WHEN 'playlist' THEN '/playlist/' || NEW.entity_id
    WHEN 'forum_post' THEN '/community/forum/' || NEW.entity_id
    WHEN 'tier_list' THEN COALESCE(
      (SELECT '/tierlist/' || t.share_code FROM public.tier_lists t
        WHERE t.id = NEW.entity_id::uuid AND t.share_code IS NOT NULL),
      '/tierlists')
    ELSE '/'
  END || '#comment-' || NEW.id::text;

  -- Mentions: one notification per distinct mentioned user (never self).
  IF NEW.mentions IS NOT NULL THEN
    FOREACH mentioned IN ARRAY NEW.mentions LOOP
      IF mentioned IS NOT NULL AND mentioned <> NEW.user_id THEN
        INSERT INTO public.notifications (user_id, title, body, data)
        VALUES (
          mentioned,
          commenter_name || ' mentioned you',
          preview,
          jsonb_build_object(
            'type', 'mention',
            'comment_id', NEW.id,
            'entity_type', NEW.entity_type,
            'entity_id', NEW.entity_id,
            'episode_id', NEW.episode_id,
            'from_user', NEW.user_id,
            'from_username', commenter_username,
            'link', link
          )
        );
      END IF;
    END LOOP;
  END IF;

  -- Reply: notify the parent comment's author, unless self or already mentioned.
  IF NEW.parent_id IS NOT NULL THEN
    SELECT user_id INTO parent_author
      FROM public.comments WHERE id = NEW.parent_id;

    IF parent_author IS NOT NULL
       AND parent_author <> NEW.user_id
       AND NOT (NEW.mentions IS NOT NULL AND parent_author = ANY (NEW.mentions))
    THEN
      INSERT INTO public.notifications (user_id, title, body, data)
      VALUES (
        parent_author,
        commenter_name || ' replied to your comment',
        preview,
        jsonb_build_object(
          'type', 'reply',
          'comment_id', NEW.id,
          'entity_type', NEW.entity_type,
          'entity_id', NEW.entity_id,
          'episode_id', NEW.episode_id,
          'from_user', NEW.user_id,
          'from_username', commenter_username,
          'link', link
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_comment ON public.comments;
CREATE TRIGGER trg_notify_on_comment
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

-- ---------------------------------------------------------------------------
-- 6) Drop the legacy comment systems now that everything lives in comments.
-- ---------------------------------------------------------------------------

-- 6a) Playlist comments.
DROP TRIGGER IF EXISTS set_playlist_comment_updated_at ON public.playlist_comments;
DROP FUNCTION IF EXISTS public.set_playlist_comment_updated_at() CASCADE;
DROP TABLE IF EXISTS public.playlist_comments CASCADE;

-- 6b) Tier list comments + their like table + like RPCs.
DROP FUNCTION IF EXISTS public.increment_tier_list_comment_likes(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.decrement_tier_list_comment_likes(uuid) CASCADE;
DROP TABLE IF EXISTS public.tier_list_comment_likes CASCADE;
DROP TABLE IF EXISTS public.tier_list_comments CASCADE;

-- 6c) Forum comments: up/down votes collapse into comment_likes; the count
--     trigger is re-pointed in Section 4. Retire the forum-comment plumbing.
DROP TRIGGER IF EXISTS trigger_forum_comment_votes ON public.forum_votes;
DROP FUNCTION IF EXISTS public.update_forum_comment_votes() CASCADE;
DROP TRIGGER IF EXISTS trg_notify_on_forum_comment ON public.forum_comments;
DROP FUNCTION IF EXISTS public.notify_on_forum_comment() CASCADE;

-- forum_votes now only tracks post votes. Dropping comment_id CASCADE removes
-- its FK, the UNIQUE(user_id, comment_id) and the vote_target_check that
-- referenced it.
DELETE FROM public.forum_votes WHERE comment_id IS NOT NULL;
ALTER TABLE public.forum_votes DROP COLUMN IF EXISTS comment_id CASCADE;
ALTER TABLE public.forum_votes DROP CONSTRAINT IF EXISTS forum_votes_post_only;
ALTER TABLE public.forum_votes
  ADD CONSTRAINT forum_votes_post_only CHECK (post_id IS NOT NULL);

DROP TABLE IF EXISTS public.forum_comments CASCADE;
