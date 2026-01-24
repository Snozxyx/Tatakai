-- Create user_pagination_preferences table
CREATE TABLE user_pagination_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  images_per_page INTEGER NOT NULL DEFAULT CASE 
    WHEN current_setting('request.headers') LIKE '%Mobile%' THEN 20
    ELSE 50
  END,
  enable_lazy_loading BOOLEAN NOT NULL DEFAULT TRUE,
  image_quality TEXT NOT NULL DEFAULT 'normal' CHECK (image_quality IN ('ultra-lite', 'lite', 'normal', 'high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_user_pagination_preferences_user_id ON user_pagination_preferences(user_id);

-- Enable Row Level Security
ALTER TABLE user_pagination_preferences ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can access their own pagination preferences"
  ON user_pagination_preferences 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own pagination preferences"
  ON user_pagination_preferences 
  FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pagination preferences"
  ON user_pagination_preferences 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pagination preferences"
  ON user_pagination_preferences 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Create a trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_pagination_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_pagination_preferences_timestamp_trigger
  BEFORE UPDATE ON user_pagination_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_pagination_preferences_timestamp();

-- Create a function to get default preferences for a user
CREATE OR REPLACE FUNCTION get_or_create_pagination_preferences(user_id UUID)
RETURNS user_pagination_preferences AS $$
DECLARE
  preferences user_pagination_preferences;
BEGIN
  -- Try to get existing preferences
  SELECT * INTO preferences FROM user_pagination_preferences WHERE user_id = get_or_create_pagination_preferences.user_id;
  
  -- If no preferences exist, create default ones
  IF preferences IS NULL THEN
    INSERT INTO user_pagination_preferences (user_id) VALUES (get_or_create_pagination_preferences.user_id)
    RETURNING * INTO preferences;
  END IF;
  
  RETURN preferences;
END;
$$ LANGUAGE plpgsql;