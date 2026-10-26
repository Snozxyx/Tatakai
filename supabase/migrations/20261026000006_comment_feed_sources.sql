-- Preserve the source label and exact reader/episode route for community comments.
-- Novel threads historically use entity_type = manga; source_kind distinguishes them.
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS source_title text,
  ADD COLUMN IF NOT EXISTS source_kind text CHECK (source_kind IN ('anime', 'manga', 'novel')),
  ADD COLUMN IF NOT EXISTS source_path text;

CREATE INDEX IF NOT EXISTS idx_comments_public_media_feed
  ON public.comments (created_at DESC, id DESC)
  WHERE entity_type IN ('anime', 'manga') AND is_deleted = false;

-- Nested reply composers can inherit the source from their parent thread.
CREATE OR REPLACE FUNCTION public.inherit_comment_feed_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE parent_comment public.comments%ROWTYPE;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO parent_comment FROM public.comments
      WHERE id = NEW.parent_id AND entity_type = NEW.entity_type AND entity_id = NEW.entity_id;
    NEW.source_title := COALESCE(NEW.source_title, parent_comment.source_title);
    NEW.source_kind := COALESCE(NEW.source_kind, parent_comment.source_kind);
    NEW.source_path := COALESCE(NEW.source_path, parent_comment.source_path);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_inherit_feed_source ON public.comments;
CREATE TRIGGER comments_inherit_feed_source BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.inherit_comment_feed_source();
