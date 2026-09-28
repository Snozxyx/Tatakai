-- =============================================================================
-- Public Tatakai Calendar — expose a user's tracked shows on their public profile
--
-- The profile Overview mounts an "Tatakai Calendar" card listing the shows a user
-- pinned (`tracked_shows`) with a live episode countdown. Until now that card was
-- own-profile only, for two reasons this migration removes:
--
--   1. `tracked_shows` had a single SELECT policy — `TO authenticated USING
--      (user_id = auth.uid())` (20260919120005:27) — so another viewer could only
--      ever read their *own* rows, and an anonymous visitor none at all.
--   2. There was no per-user opt-out, unlike watchlist/history which gate on
--      `profiles.show_watchlist` / `show_history` (20260103000006).
--
-- This mirrors the watchlist/history pattern exactly: a `show_calendar` boolean on
-- profiles (default true — public by default, opt-out from Profile Settings ->
-- Privacy), and an additional SELECT policy on `tracked_shows` that lets anyone
-- read a user's rows when that user's profile is public AND show_calendar is on.
-- The owner-only policy stays, so a private or opted-out user still sees their own
-- calendar while nobody else can.
--
-- No CHECK on the column; it is a plain feature flag like show_watchlist. It is
-- added to the column-level UPDATE grant so the Profile Settings sheet can write
-- it via the normal PostgREST path (20260902000003 established that grant list).
-- =============================================================================

-- 1. Opt-out flag. Default true = calendar is public unless the user turns it off.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_calendar boolean DEFAULT true;

UPDATE public.profiles
SET show_calendar = true
WHERE show_calendar IS NULL;

COMMENT ON COLUMN public.profiles.show_calendar IS
  'Whether to show the Tatakai Calendar (tracked_shows) on the public profile. Default true.';

-- 2. Let the owner write it through PostgREST. Additive GRANT — the existing
--    column grants from 20260902000003 are unaffected (GRANT is cumulative).
GRANT UPDATE (show_calendar) ON public.profiles TO authenticated;

-- 3. Public read of tracked_shows for public, opted-in profiles.
--    Kept alongside "Users read own tracked shows"; policies are OR-ed, so the
--    owner still reads their own rows even when private / opted out.
--    `TO public` so anonymous visitors of a public profile can read it too,
--    matching the watchlist/history public-read policies which name no role.
DROP POLICY IF EXISTS "Public can read calendar of public profiles" ON public.tracked_shows;
CREATE POLICY "Public can read calendar of public profiles"
  ON public.tracked_shows FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = tracked_shows.user_id
        AND profiles.is_public = true
        AND COALESCE(profiles.show_calendar, true) = true
    )
  );

-- The owner-scoped SELECT policy (20260919120005) is TO authenticated only, so
-- anon has no table-level SELECT privilege yet. Grant it — RLS still restricts
-- which rows anon may read to the policy above.
GRANT SELECT ON public.tracked_shows TO anon;
