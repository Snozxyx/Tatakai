-- =============================================================================
-- Store the real media format on each playlist item so cards can label works
-- accurately (Anime / Manga / Manhwa / Manhua / Comic / Novel) instead of
-- guessing from the manga: id prefix.
--
-- Nullable + free-text on purpose: older rows stay NULL (the UI falls back to
-- prefix inference) and new source formats don't require a schema change.
--
-- WRITTEN, NOT APPLIED — repo standing rule. Validate: npm run check:migrations.
-- =============================================================================

ALTER TABLE public.playlist_items
  ADD COLUMN IF NOT EXISTS media_format text;

COMMENT ON COLUMN public.playlist_items.media_format IS
  'Lowercased media type captured when the item was added: anime, manga, '
  'manhwa, manhua, comic, novel, one_shot, ... NULL for pre-migration rows.';
