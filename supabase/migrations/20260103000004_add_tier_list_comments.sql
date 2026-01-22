-- Create tier_list_comments table
CREATE TABLE IF NOT EXISTS tier_list_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_list_id uuid NOT NULL REFERENCES tier_lists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  parent_id uuid REFERENCES tier_list_comments(id) ON DELETE CASCADE,
  likes_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create tier_list_comment_likes table
CREATE TABLE IF NOT EXISTS tier_list_comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES tier_list_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tier_list_comments_tier_list_id ON tier_list_comments(tier_list_id);
CREATE INDEX IF NOT EXISTS idx_tier_list_comments_parent_id ON tier_list_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_tier_list_comment_likes_comment_id ON tier_list_comment_likes(comment_id);

-- RLS policies for tier_list_comments
ALTER TABLE tier_list_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tier list comments" ON tier_list_comments
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create tier list comments" ON tier_list_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tier list comments" ON tier_list_comments
  FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for tier_list_comment_likes
ALTER TABLE tier_list_comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tier list comment likes" ON tier_list_comment_likes
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can like tier list comments" ON tier_list_comment_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike tier list comments" ON tier_list_comment_likes
  FOR DELETE USING (auth.uid() = user_id);

-- Functions to increment/decrement likes
CREATE OR REPLACE FUNCTION increment_tier_list_comment_likes(comment_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE tier_list_comments 
  SET likes_count = COALESCE(likes_count, 0) + 1 
  WHERE id = comment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_tier_list_comment_likes(comment_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE tier_list_comments 
  SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) 
  WHERE id = comment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
