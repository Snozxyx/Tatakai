-- =============================================================================
-- manga_readlist: exact-page resume fidelity
--
-- "Continue Reading" restores a chapter + page index today, but not WHICH source
-- served those pages. A manga chapter can be scraped from several sub-providers
-- (scrapers) across several scanlation groups, and each of those is served by a
-- runtime extension namespace. To resume on the exact page of the exact group of
-- the exact extension the reader was last using, store those three coordinates
-- alongside the existing progress:
--
--   last_extension_id  — runtime extension namespace that served the last page
--                        (e.g. 'toko'); pairs with last_provider (the scraper).
--   last_scanlator     — scanlation group of the last-read source, so resume
--                        returns to the same group rather than an arbitrary one.
--   last_page_id       — opaque page identifier within the chapter (the page
--                        number as text today; text keeps it provider-agnostic).
--
-- All three are nullable — old rows and guest/local rows simply carry NULL and
-- resume falls back to the existing chapter/page-index behavior. IF NOT EXISTS
-- keeps this additive migration idempotent, matching the other manga_readlist
-- column migrations (20260922120000, 20260922140000).
-- =============================================================================
ALTER TABLE public.manga_readlist
  ADD COLUMN IF NOT EXISTS last_extension_id text,
  ADD COLUMN IF NOT EXISTS last_scanlator text,
  ADD COLUMN IF NOT EXISTS last_page_id text;
