-- =============================================================================
-- Episode airing reminders — dedup ledger for the airing-reminders job.
--
-- `tracked_shows` says which users pinned which AniList shows to their calendar.
-- The TatakaiAPI `airing` job (TatakaiAPI/src/jobs/airingReminders.ts, run via
-- `npm run job:airing` on an hourly schedule) polls AniList for each tracked
-- show's nextAiringEpisode and, when one is within the lookahead window, inserts
-- a `type:'airing'` notification for every user tracking it. This table is the
-- once-per-episode-per-user dedup ledger so the job does not re-notify the same
-- upcoming episode every run.
--
-- Writes come from the service role (the job's service client), which bypasses
-- RLS, so there is deliberately no INSERT policy for `authenticated`. Owners may
-- read their own rows; nothing else is exposed.
--
-- WRITTEN, NOT APPLIED — repo standing rule. Validate: npm run check:migrations.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.airing_reminders_sent (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anilist_id  INTEGER     NOT NULL,
  episode     INTEGER     NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, anilist_id, episode)
);

CREATE INDEX IF NOT EXISTS idx_airing_reminders_sent_user
  ON public.airing_reminders_sent (user_id);

ALTER TABLE public.airing_reminders_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own airing reminders" ON public.airing_reminders_sent;
CREATE POLICY "Users can read own airing reminders"
  ON public.airing_reminders_sent FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.airing_reminders_sent TO authenticated;
GRANT ALL ON public.airing_reminders_sent TO service_role;
