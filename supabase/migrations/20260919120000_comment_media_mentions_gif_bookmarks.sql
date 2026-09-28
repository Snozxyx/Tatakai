-- =============================================================================
-- Comment system overhaul (roadmap §7)
--
-- Adds the storage the richer comment composer needs, without touching the
-- 2000-char `content` CHECK — attachments and mentions live in their own columns
-- rather than being packed into the text:
--
--   * comments.attachments  jsonb  — image / GIF cards attached to a comment
--   * comments.mentions      uuid[] — auth user ids the comment @-mentions
--
-- Plus the two things the comment feature needs that did not exist:
--
--   * public.gif_bookmarks   — a user's saved GIFs, for the picker's Saved tab
--   * comment-media bucket    — where uploaded image/GIF attachments are stored
--   * notify_on_comment()     — the SECURITY DEFINER trigger the notifications
--                               migration (20260902000001) said "Phase 1" would
--                               add: turns a @mention or a reply into an in-app
--                               notification. Regular users cannot INSERT into
--                               notifications (RLS requires moderator), so this
--                               has to run as the function owner.
--
-- Written to be safe against the live database and a fresh one: IF NOT EXISTS on
-- every add, guarded policy creation, ON CONFLICT DO NOTHING on the bucket.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) New columns on comments
-- ---------------------------------------------------------------------------
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS attachments JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mentions    UUID[]  NOT NULL DEFAULT '{}'::uuid[];

-- Guard the attachments payload: an array, capped so a comment cannot smuggle an
-- unbounded blob past the 2000-char content CHECK. Each element is expected to be
-- { type, url, ... } but the shape is validated app-side; here we only bound size.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.comments'::regclass
      AND conname = 'comments_attachments_shape'
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_attachments_shape
      CHECK (
        jsonb_typeof(attachments) = 'array'
        AND jsonb_array_length(attachments) <= 4
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) gif_bookmarks — a user's saved GIFs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gif_bookmarks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gif_url     TEXT        NOT NULL,
  preview_url TEXT,
  title       TEXT,
  width       INTEGER,
  height      INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, gif_url)
);

CREATE INDEX IF NOT EXISTS idx_gif_bookmarks_user_created
  ON public.gif_bookmarks (user_id, created_at DESC);

ALTER TABLE public.gif_bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own gif bookmarks" ON public.gif_bookmarks;
CREATE POLICY "Users read own gif bookmarks"
  ON public.gif_bookmarks FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own gif bookmarks" ON public.gif_bookmarks;
CREATE POLICY "Users insert own gif bookmarks"
  ON public.gif_bookmarks FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own gif bookmarks" ON public.gif_bookmarks;
CREATE POLICY "Users delete own gif bookmarks"
  ON public.gif_bookmarks FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.gif_bookmarks TO authenticated;
GRANT ALL ON public.gif_bookmarks TO service_role;

-- ---------------------------------------------------------------------------
-- 3) comment-media storage bucket (uploaded image / GIF attachments)
--    Pattern copied from 20260508000003 (extension-files), which is the proof
--    that a SQL-created bucket works on this project.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('comment-media', 'comment-media', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  -- Public read: attachments are shown to everyone who can see the comment.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'comment_media_select_public'
  ) THEN
    CREATE POLICY comment_media_select_public
      ON storage.objects FOR SELECT
      USING (bucket_id = 'comment-media');
  END IF;

  -- Upload only into your own folder namespace: comments/<uid>/...
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'comment_media_insert_own_folder'
  ) THEN
    CREATE POLICY comment_media_insert_own_folder
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'comment-media'
        AND name LIKE 'comments/' || auth.uid()::text || '/%'
      );
  END IF;

  -- Delete only your own uploads.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'comment_media_delete_own_folder'
  ) THEN
    CREATE POLICY comment_media_delete_own_folder
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'comment-media'
        AND name LIKE 'comments/' || auth.uid()::text || '/%'
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) notify_on_comment() — mention & reply notifications
--
-- SECURITY DEFINER so it can INSERT into notifications, which end users cannot
-- write directly (RLS on notifications requires the moderator role). The
-- notifications UPDATE-restriction trigger already lets SECURITY DEFINER / the
-- service role through, so nothing there needs changing.
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

  -- Deep link consumed by the notification list / bell.
  link := '/anime/' || NEW.anime_id
          || CASE WHEN NEW.episode_id IS NOT NULL
                  THEN '?episode=' || NEW.episode_id ELSE '' END
          || '#comment-' || NEW.id::text;

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
            'anime_id', NEW.anime_id,
            'episode_id', NEW.episode_id,
            'from_user', NEW.user_id,
            'from_username', commenter_username,
            'link', link
          )
        );
      END IF;
    END LOOP;
  END IF;

  -- Reply: notify the parent comment's author, unless they are the commenter or
  -- were already mentioned above (avoid a double ping).
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
          'anime_id', NEW.anime_id,
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
