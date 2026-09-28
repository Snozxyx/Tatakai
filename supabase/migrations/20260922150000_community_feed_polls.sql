-- ============================================================
-- Migration: Community feed polls + post embed metadata
-- Date: 2026-09-22
-- Purpose:
--   Support the feed-first community platform. Posts (forum_posts) can now
--   carry an attached poll and arbitrary embed metadata (gif url, embedded
--   watch_room_id, etc). Mirrors the existing watch_room_polls /
--   watch_room_poll_votes shape (see 20260830-era watch room migrations) so the
--   shared <Poll> component can drive both post polls and watchroom polls.
--
--   forum_posts already has playlist_id / tierlist_id columns; this adds the
--   `metadata` jsonb the ForumPost interface already references but that was
--   never actually present in the table.
--
--   Poll writes are owner-only (created_by = auth.uid() and owns the post);
--   votes are self-only. Public read on both, matching forum_posts visibility.
-- ============================================================

-- 1. Embed metadata bag on posts (gif_url, watch_room_id, embed refs, …).
ALTER TABLE public.forum_posts
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. One poll per post.
CREATE TABLE IF NOT EXISTS public.post_polls (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  question   text NOT NULL,
  options    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ends_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id)
);

CREATE INDEX IF NOT EXISTS idx_post_polls_post_id
  ON public.post_polls (post_id);

-- 3. One vote per user per poll.
CREATE TABLE IF NOT EXISTS public.post_poll_votes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id      uuid NOT NULL REFERENCES public.post_polls(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_poll_votes_poll_id
  ON public.post_poll_votes (poll_id);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.post_polls      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_poll_votes ENABLE ROW LEVEL SECURITY;

-- Polls: public read.
DROP POLICY IF EXISTS "Public read post polls" ON public.post_polls;
CREATE POLICY "Public read post polls"
  ON public.post_polls FOR SELECT
  USING (true);

-- Polls: the post owner may attach a poll to their own post.
DROP POLICY IF EXISTS "Owner insert post poll" ON public.post_polls;
CREATE POLICY "Owner insert post poll"
  ON public.post_polls FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.forum_posts p
      WHERE p.id = post_id AND p.user_id = auth.uid()
    )
  );

-- Polls: owner may delete their poll (post cascade also removes it).
DROP POLICY IF EXISTS "Owner delete post poll" ON public.post_polls;
CREATE POLICY "Owner delete post poll"
  ON public.post_polls FOR DELETE
  USING (created_by = auth.uid());

-- Votes: public read (for tallies).
DROP POLICY IF EXISTS "Public read post poll votes" ON public.post_poll_votes;
CREATE POLICY "Public read post poll votes"
  ON public.post_poll_votes FOR SELECT
  USING (true);

-- Votes: a user may cast / change / remove their own vote.
DROP POLICY IF EXISTS "Self insert post poll vote" ON public.post_poll_votes;
CREATE POLICY "Self insert post poll vote"
  ON public.post_poll_votes FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Self update post poll vote" ON public.post_poll_votes;
CREATE POLICY "Self update post poll vote"
  ON public.post_poll_votes FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Self delete post poll vote" ON public.post_poll_votes;
CREATE POLICY "Self delete post poll vote"
  ON public.post_poll_votes FOR DELETE
  USING (user_id = auth.uid());
