-- Add image_url column to user_suggestions
ALTER TABLE user_suggestions ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Update RLS policies to allow image uploads
-- (existing policies already allow users to update their own suggestions)
