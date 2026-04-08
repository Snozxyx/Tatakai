-- Watch2Together queue + polls, collection collaboration/comments, and recommendation tuning extensions

-- 1) Host queue for watch rooms
CREATE TABLE IF NOT EXISTS public.watch_room_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.watch_rooms(id) ON DELETE CASCADE,
  anime_id text NOT NULL,
  anime_title text NOT NULL,
  anime_poster text,
  episode_id text,
  episode_number integer,
  episode_title text,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_watch_room_queue_room_position
  ON public.watch_room_queue(room_id, position, created_at);

ALTER TABLE public.watch_room_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view room queue" ON public.watch_room_queue;
CREATE POLICY "Participants can view room queue"
  ON public.watch_room_queue
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.watch_room_participants p
      WHERE p.room_id = watch_room_queue.room_id
        AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.watch_rooms r
      WHERE r.id = watch_room_queue.room_id
        AND r.access_type = 'public'
    )
    OR EXISTS (
      SELECT 1
      FROM public.watch_rooms r
      WHERE r.id = watch_room_queue.room_id
        AND r.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Host can insert room queue" ON public.watch_room_queue;
CREATE POLICY "Host can insert room queue"
  ON public.watch_room_queue
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.watch_rooms r
      WHERE r.id = watch_room_queue.room_id
        AND r.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Host can update room queue" ON public.watch_room_queue;
CREATE POLICY "Host can update room queue"
  ON public.watch_room_queue
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.watch_rooms r
      WHERE r.id = watch_room_queue.room_id
        AND r.host_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.watch_rooms r
      WHERE r.id = watch_room_queue.room_id
        AND r.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Host can delete room queue" ON public.watch_room_queue;
CREATE POLICY "Host can delete room queue"
  ON public.watch_room_queue
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.watch_rooms r
      WHERE r.id = watch_room_queue.room_id
        AND r.host_id = auth.uid()
    )
  );

-- 2) Synchronized room polls and votes
CREATE TABLE IF NOT EXISTS public.watch_room_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.watch_rooms(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (length(trim(question)) > 0),
  options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.watch_room_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.watch_room_polls(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.watch_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index integer NOT NULL CHECK (option_index >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_room_polls_room_active
  ON public.watch_room_polls(room_id, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_watch_room_poll_votes_poll
  ON public.watch_room_poll_votes(poll_id);

ALTER TABLE public.watch_room_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_room_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view room polls" ON public.watch_room_polls;
CREATE POLICY "Participants can view room polls"
  ON public.watch_room_polls
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.watch_room_participants p
      WHERE p.room_id = watch_room_polls.room_id
        AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.watch_rooms r
      WHERE r.id = watch_room_polls.room_id
        AND (r.access_type = 'public' OR r.host_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Host can create room polls" ON public.watch_room_polls;
CREATE POLICY "Host can create room polls"
  ON public.watch_room_polls
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.watch_rooms r
      WHERE r.id = watch_room_polls.room_id
        AND r.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Host can update room polls" ON public.watch_room_polls;
CREATE POLICY "Host can update room polls"
  ON public.watch_room_polls
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.watch_rooms r
      WHERE r.id = watch_room_polls.room_id
        AND r.host_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.watch_rooms r
      WHERE r.id = watch_room_polls.room_id
        AND r.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Host can delete room polls" ON public.watch_room_polls;
CREATE POLICY "Host can delete room polls"
  ON public.watch_room_polls
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.watch_rooms r
      WHERE r.id = watch_room_polls.room_id
        AND r.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Participants can view poll votes" ON public.watch_room_poll_votes;
CREATE POLICY "Participants can view poll votes"
  ON public.watch_room_poll_votes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.watch_room_participants p
      WHERE p.room_id = watch_room_poll_votes.room_id
        AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.watch_rooms r
      WHERE r.id = watch_room_poll_votes.room_id
        AND (r.access_type = 'public' OR r.host_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Participants can vote in room polls" ON public.watch_room_poll_votes;
CREATE POLICY "Participants can vote in room polls"
  ON public.watch_room_poll_votes
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.watch_room_participants p
      WHERE p.room_id = watch_room_poll_votes.room_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Participants can update own poll votes" ON public.watch_room_poll_votes;
CREATE POLICY "Participants can update own poll votes"
  ON public.watch_room_poll_votes
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Participants can remove own poll votes" ON public.watch_room_poll_votes;
CREATE POLICY "Participants can remove own poll votes"
  ON public.watch_room_poll_votes
  FOR DELETE
  USING (user_id = auth.uid());

-- 3) Playlist threaded comments
CREATE TABLE IF NOT EXISTS public.playlist_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(trim(content)) > 0),
  parent_id uuid REFERENCES public.playlist_comments(id) ON DELETE CASCADE,
  likes_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playlist_comments_playlist
  ON public.playlist_comments(playlist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlist_comments_parent
  ON public.playlist_comments(parent_id, created_at ASC);

ALTER TABLE public.playlist_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view playlist comments" ON public.playlist_comments;
CREATE POLICY "Users can view playlist comments"
  ON public.playlist_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.playlists p
      WHERE p.id = playlist_comments.playlist_id
        AND (
          p.is_public = true
          OR p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.playlist_collaborators pc
            WHERE pc.playlist_id = p.id
              AND pc.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can add playlist comments" ON public.playlist_comments;
CREATE POLICY "Authenticated users can add playlist comments"
  ON public.playlist_comments
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.playlists p
      WHERE p.id = playlist_comments.playlist_id
        AND (
          p.is_public = true
          OR p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.playlist_collaborators pc
            WHERE pc.playlist_id = p.id
              AND pc.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Users can update own playlist comments" ON public.playlist_comments;
CREATE POLICY "Users can update own playlist comments"
  ON public.playlist_comments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own playlist comments" ON public.playlist_comments;
CREATE POLICY "Users can delete own playlist comments"
  ON public.playlist_comments
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.playlists p
      WHERE p.id = playlist_comments.playlist_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.playlist_collaborators pc
            WHERE pc.playlist_id = p.id
              AND pc.user_id = auth.uid()
              AND pc.role = 'admin'
          )
        )
    )
  );

CREATE OR REPLACE FUNCTION public.set_playlist_comment_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS playlist_comments_set_updated_at ON public.playlist_comments;
CREATE TRIGGER playlist_comments_set_updated_at
BEFORE UPDATE ON public.playlist_comments
FOR EACH ROW
EXECUTE FUNCTION public.set_playlist_comment_updated_at();

-- 4) Tier list collaborators with viewer/editor/owner roles
CREATE TABLE IF NOT EXISTS public.tier_list_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_list_id uuid NOT NULL REFERENCES public.tier_lists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('viewer', 'editor', 'owner')),
  added_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier_list_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tier_list_collaborators_tier
  ON public.tier_list_collaborators(tier_list_id);
CREATE INDEX IF NOT EXISTS idx_tier_list_collaborators_user
  ON public.tier_list_collaborators(user_id);

ALTER TABLE public.tier_list_collaborators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view tier list collaborators" ON public.tier_list_collaborators;
CREATE POLICY "Users can view tier list collaborators"
  ON public.tier_list_collaborators
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.tier_lists t
      WHERE t.id = tier_list_collaborators.tier_list_id
        AND (
          t.is_public = true
          OR t.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.tier_list_collaborators tc
            WHERE tc.tier_list_id = t.id
              AND tc.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Tier list owners can add collaborators" ON public.tier_list_collaborators;
CREATE POLICY "Tier list owners can add collaborators"
  ON public.tier_list_collaborators
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tier_lists t
      WHERE t.id = tier_list_collaborators.tier_list_id
        AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tier list owners can update collaborators" ON public.tier_list_collaborators;
CREATE POLICY "Tier list owners can update collaborators"
  ON public.tier_list_collaborators
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.tier_lists t
      WHERE t.id = tier_list_collaborators.tier_list_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tier_lists t
      WHERE t.id = tier_list_collaborators.tier_list_id
        AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tier list owners can remove collaborators" ON public.tier_list_collaborators;
CREATE POLICY "Tier list owners can remove collaborators"
  ON public.tier_list_collaborators
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.tier_lists t
      WHERE t.id = tier_list_collaborators.tier_list_id
        AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Collaborators can view private tier lists" ON public.tier_lists;
CREATE POLICY "Collaborators can view private tier lists"
  ON public.tier_lists
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.tier_list_collaborators tc
      WHERE tc.tier_list_id = tier_lists.id
        AND tc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Collaborators can update tier lists" ON public.tier_lists;
CREATE POLICY "Collaborators can update tier lists"
  ON public.tier_lists
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.tier_list_collaborators tc
      WHERE tc.tier_list_id = tier_lists.id
        AND tc.user_id = auth.uid()
        AND tc.role IN ('editor', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tier_list_collaborators tc
      WHERE tc.tier_list_id = tier_lists.id
        AND tc.user_id = auth.uid()
        AND tc.role IN ('editor', 'owner')
    )
  );

-- 5) Recommendation controls: support "skip" feedback
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'recommendation_feedback'
  ) THEN
    ALTER TABLE public.recommendation_feedback
      DROP CONSTRAINT IF EXISTS recommendation_feedback_feedback_check;

    ALTER TABLE public.recommendation_feedback
      ADD CONSTRAINT recommendation_feedback_feedback_check
      CHECK (feedback IN ('like', 'dislike', 'already_seen', 'skip'));
  END IF;
END;
$$;

-- Realtime subscriptions for new watch room sync tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'watch_room_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.watch_room_queue;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'watch_room_polls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.watch_room_polls;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'watch_room_poll_votes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.watch_room_poll_votes;
  END IF;
END;
$$;
