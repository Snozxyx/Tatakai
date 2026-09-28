-- =============================================================================
-- user-media bucket — one folder per user, categorised by upload kind
--
-- Every uploaded image/GIF a user attaches to a comment, forum post, poll or
-- community now lives under a single per-user namespace:
--
--     user-media/<auth.uid()>/<category>/<file>
--       category ∈ { comment, forum_image, ... }   (open-ended on purpose)
--
-- This replaces the two ad-hoc layouts we had:
--   * comment-media/comments/<uid>/...        (image/GIF comment attachments)
--   * forum/forum_images/<uid>-...            (forum post / poll / community art)
-- The app keeps a fallback to those legacy buckets, so uploads work before and
-- after this migration is applied; new writes land here once it is.
--
-- Foresight for "limit user uploads": a per-file cap lives on the bucket
-- (file_size_limit); a per-user *quota* (total bytes) can be added later as a
-- BEFORE INSERT trigger on storage.objects that sums owner usage — the per-user
-- folder layout is what makes that cheap to compute.
--
-- Idempotent: ON CONFLICT on the bucket, guarded CREATE POLICY, so it is safe
-- against the live database and a re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) The bucket (public read; 8 MB per file; common image types only)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-media',
  'user-media',
  true,
  8388608, -- 8 MB
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2) RLS on storage.objects for this bucket
--    Read: public (attachments render for anyone who can see the content).
--    Write/update/delete: only inside your own uid folder, i.e. the first path
--    segment must equal auth.uid(). The category (second segment) is left open
--    so new kinds can be added without another migration.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'user_media_select_public'
  ) THEN
    CREATE POLICY user_media_select_public
      ON storage.objects FOR SELECT
      USING (bucket_id = 'user-media');
  END IF;

  -- Insert only into your own uid folder: user-media/<uid>/<category>/...
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'user_media_insert_own_folder'
  ) THEN
    CREATE POLICY user_media_insert_own_folder
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'user-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  -- Update (upsert / overwrite) only within your own folder.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'user_media_update_own_folder'
  ) THEN
    CREATE POLICY user_media_update_own_folder
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'user-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'user-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  -- Delete only your own uploads.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'user_media_delete_own_folder'
  ) THEN
    CREATE POLICY user_media_delete_own_folder
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'user-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
