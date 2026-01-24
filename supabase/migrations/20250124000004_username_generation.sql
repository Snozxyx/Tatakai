-- Add username generation columns to profiles table
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS username_suggested BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS original_suggested_username TEXT;

-- Create a function to generate unique usernames
CREATE OR REPLACE FUNCTION generate_unique_username(base_username TEXT)
RETURNS TEXT AS $$
DECLARE
  final_username TEXT;
  suffix TEXT;
  attempt_count INTEGER := 0;
  username_exists BOOLEAN;
BEGIN
  final_username := base_username;
  
  -- Check if username already exists
  SELECT EXISTS(SELECT 1 FROM profiles WHERE username = final_username) INTO username_exists;
  
  -- If username exists, try adding random suffixes
  WHILE username_exists AND attempt_count < 3 LOOP
    suffix := '-' || substr(md5(random()::text), 1, 4);
    final_username := base_username || suffix;
    
    SELECT EXISTS(SELECT 1 FROM profiles WHERE username = final_username) INTO username_exists;
    attempt_count := attempt_count + 1;
  END LOOP;
  
  RETURN final_username;
END;
$$ LANGUAGE plpgsql;

-- Update the existing signup trigger to include username generation
-- First, check if the trigger exists and drop it if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'handle_new_user_signup_trigger'
  ) THEN
    DROP TRIGGER IF EXISTS handle_new_user_signup_trigger ON auth.users;
    DROP FUNCTION IF EXISTS handle_new_user_signup();
  END IF;
END $$;

-- Create the updated signup function with username generation
CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  display_name TEXT;
  generated_username TEXT;
  first_name_part TEXT;
BEGIN
  -- Extract display name from the new user's raw_user_meta_data
  IF NEW.raw_user_meta_data::jsonb->>'full_name' IS NOT NULL THEN
    display_name := NEW.raw_user_meta_data::jsonb->>'full_name';
  ELSIF NEW.raw_user_meta_data::jsonb->>'name' IS NOT NULL THEN
    display_name := NEW.raw_user_meta_data::jsonb->>'name';
  ELSIF NEW.raw_user_meta_data::jsonb->>'user_name' IS NOT NULL THEN
    display_name := NEW.raw_user_meta_data::jsonb->>'user_name';
  ELSE
    display_name := 'user' || NEW.id::text;
  END IF;
  
  -- Extract first name for username generation
  first_name_part := split_part(display_name, ' ', 1);
  
  -- Generate unique username
  generated_username := generate_unique_username(first_name_part);
  
  -- Insert into profiles table with generated username
  INSERT INTO profiles (id, username, username_suggested, original_suggested_username, display_name)
  VALUES (NEW.id, generated_username, TRUE, generated_username, display_name)
  ON CONFLICT (id) DO UPDATE
  SET 
    username = EXCLUDED.username,
    username_suggested = EXCLUDED.username_suggested,
    original_suggested_username = EXCLUDED.original_suggested_username,
    display_name = EXCLUDED.display_name;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER handle_new_user_signup_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_signup();