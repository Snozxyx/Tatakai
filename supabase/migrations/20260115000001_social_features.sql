-- Social features: Follow users and reactions

-- User follows table
CREATE TABLE IF NOT EXISTS public.user_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK(follower_id != following_id) -- Cannot follow yourself
);

-- Reactions table
CREATE TABLE IF NOT EXISTS public.reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('comment', 'forum_post', 'tier_list')),
  entity_id uuid NOT NULL,
  reaction_type text NOT NULL CHECK (reaction_type IN ('like', 'love', 'laugh', 'wow', 'sad', 'angry')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, entity_type, entity_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON public.user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON public.user_follows(following_id);
CREATE INDEX IF NOT EXISTS idx_reactions_entity ON public.reactions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user ON public.reactions(user_id);

-- Enable RLS
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

-- User follows policies
DROP POLICY IF EXISTS "Users can view all follows" ON public.user_follows;
DROP POLICY IF EXISTS "Users can create own follows" ON public.user_follows;
DROP POLICY IF EXISTS "Users can delete own follows" ON public.user_follows;

CREATE POLICY "Users can view all follows" ON public.user_follows
  FOR SELECT USING (true);

CREATE POLICY "Users can create own follows" ON public.user_follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can delete own follows" ON public.user_follows
  FOR DELETE USING (auth.uid() = follower_id);

-- Reactions policies
DROP POLICY IF EXISTS "Users can view all reactions" ON public.reactions;
DROP POLICY IF EXISTS "Users can create own reactions" ON public.reactions;
DROP POLICY IF EXISTS "Users can update own reactions" ON public.reactions;
DROP POLICY IF EXISTS "Users can delete own reactions" ON public.reactions;

CREATE POLICY "Users can view all reactions" ON public.reactions
  FOR SELECT USING (true);

CREATE POLICY "Users can create own reactions" ON public.reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reactions" ON public.reactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reactions" ON public.reactions
  FOR DELETE USING (auth.uid() = user_id);
