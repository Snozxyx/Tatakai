-- Admin removals are reversible archives. Catalog rows are referenced by
-- reading lists, history, mappings and community data, so physical deletion
-- would break valid user records.
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_content_items_visible_format_popularity
  ON public.content_items (format, popularity DESC NULLS LAST)
  WHERE is_hidden = false;

COMMENT ON COLUMN public.content_items.is_hidden IS
  'Admin archive flag. Archived catalog rows remain available to restore and preserve user references.';
