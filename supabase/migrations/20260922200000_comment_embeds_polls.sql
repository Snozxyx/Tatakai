-- =============================================================================
-- Comment embeds + polls (comment parity with community feed posts)
--
-- Lets a comment carry the same rich content a feed post can:
--   * comments.embeds  jsonb  — link/share cards: shared anime/manga/manhwa,
--                               a linked playlist, a linked tier list, or a
--                               linked community post. Shape validated app-side
--                               (src/lib/commentEmbeds.ts); here we only bound size.
--   * comment_polls / comment_poll_votes — an attached poll, mirroring the feed's
--                               post_polls / post_poll_votes (20260922150000) but
--                               keyed on comment_id. Votes are plain upserts under
--                               RLS (no SECURITY DEFINER needed), same as the feed.
--
-- Written to be safe against the live database: IF NOT EXISTS on every add and
-- guarded policy creation. No data backfill — existing comments get '[]' embeds.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) comments.embeds column
-- ---------------------------------------------------------------------------
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS embeds JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Bound the embeds payload the same way attachments are bounded
-- (20260919120000): a jsonb array, capped so a comment cannot smuggle an
-- unbounded blob past the 2000-char content CHECK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.comments'::regclass
      AND conname = 'comments_embeds_shape'
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_embeds_shape
      CHECK (
        jsonb_typeof(embeds) = 'array'
        AND jsonb_array_length(embeds) <= 4
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) comment_polls  (one poll per comment) — mirrors public.post_polls
--    (20260922150000) keyed on comment_id instead of post_id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comment_polls (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  question   text NOT NULL DEFAULT '',
  options    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ends_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_polls_comment_id
  ON public.comment_polls (comment_id);

-- ---------------------------------------------------------------------------
-- 3) comment_poll_votes  (one vote per user per poll) — mirrors post_poll_votes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comment_poll_votes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id      uuid NOT NULL REFERENCES public.comment_polls(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_poll_votes_poll_id
  ON public.comment_poll_votes (poll_id);

-- ---------------------------------------------------------------------------
-- RLS — public read; poll owned by the comment's author; self-only votes.
-- (Same shape as post_polls / post_poll_votes; no SECURITY DEFINER needed.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.comment_polls      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read comment polls" ON public.comment_polls;
CREATE POLICY "Public read comment polls"
  ON public.comment_polls FOR SELECT
  USING (true);

-- Only the comment's author may attach a poll to it.
DROP POLICY IF EXISTS "Owner insert comment poll" ON public.comment_polls;
CREATE POLICY "Owner insert comment poll"
  ON public.comment_polls FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.comments c
      WHERE c.id = comment_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner delete comment poll" ON public.comment_polls;
CREATE POLICY "Owner delete comment poll"
  ON public.comment_polls FOR DELETE
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Public read comment poll votes" ON public.comment_poll_votes;
CREATE POLICY "Public read comment poll votes"
  ON public.comment_poll_votes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Self insert comment poll vote" ON public.comment_poll_votes;
CREATE POLICY "Self insert comment poll vote"
  ON public.comment_poll_votes FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Self update comment poll vote" ON public.comment_poll_votes;
CREATE POLICY "Self update comment poll vote"
  ON public.comment_poll_votes FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Self delete comment poll vote" ON public.comment_poll_votes;
CREATE POLICY "Self delete comment poll vote"
  ON public.comment_poll_votes FOR DELETE
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants (RLS still governs row visibility; these match the feed poll tables).
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.comment_polls      TO anon, authenticated;
GRANT SELECT ON public.comment_poll_votes TO anon, authenticated;
GRANT INSERT, DELETE          ON public.comment_polls      TO authenticated;
GRANT INSERT, UPDATE, DELETE  ON public.comment_poll_votes TO authenticated;
