-- Create recommendation_cache table
CREATE TABLE recommendation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anime_list JSONB NOT NULL,
  confidence_scores JSONB,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

-- Create indexes for performance
CREATE INDEX idx_recommendation_cache_user_id ON recommendation_cache(user_id);
CREATE INDEX idx_recommendation_cache_expires_at ON recommendation_cache(expires_at);
CREATE INDEX idx_recommendation_cache_generated_at ON recommendation_cache(generated_at);

-- Enable Row Level Security
ALTER TABLE recommendation_cache ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can access their own recommendation cache"
  ON recommendation_cache 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own recommendation cache"
  ON recommendation_cache 
  FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recommendation cache"
  ON recommendation_cache 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recommendation cache"
  ON recommendation_cache 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Create a function to set expiration time (24 hours from generation)
CREATE OR REPLACE FUNCTION set_recommendation_cache_expiration()
RETURNS TRIGGER AS $$
BEGIN
  NEW.expires_at = NOW() + INTERVAL '24 hours';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_recommendation_cache_expiration_trigger
  BEFORE INSERT ON recommendation_cache
  FOR EACH ROW
  EXECUTE FUNCTION set_recommendation_cache_expiration();

-- Create a function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_recommendation_cache()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM recommendation_cache WHERE expires_at < NOW();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create an event trigger for cleanup (this would need to be scheduled externally)
CREATE OR REPLACE FUNCTION schedule_cache_cleanup()
RETURNS VOID AS $$
BEGIN
  DELETE FROM recommendation_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;