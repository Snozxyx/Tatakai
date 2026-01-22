-- Fix custom_video_sources table - add missing columns
-- Run this if the table already exists but is missing columns

-- Add anime_title column if missing
ALTER TABLE public.custom_video_sources 
ADD COLUMN IF NOT EXISTS anime_title text NOT NULL DEFAULT 'Unknown';

-- Add priority column if missing
ALTER TABLE public.custom_video_sources 
ADD COLUMN IF NOT EXISTS priority integer DEFAULT 1;

-- Update the unique constraint to ensure it works correctly
-- First drop the old constraint if it exists, then recreate
DO $$
BEGIN
    -- Check if the constraint exists and drop it
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'custom_video_sources_anime_id_episode_number_server_name_key'
    ) THEN
        ALTER TABLE public.custom_video_sources 
        DROP CONSTRAINT custom_video_sources_anime_id_episode_number_server_name_key;
    END IF;
END $$;

-- Recreate the unique constraint
ALTER TABLE public.custom_video_sources 
ADD CONSTRAINT custom_video_sources_anime_id_episode_number_server_name_key 
UNIQUE (anime_id, episode_number, server_name);

-- Ensure RLS policy allows admins to manage (recreate if needed)
DROP POLICY IF EXISTS "Admins can manage custom sources" ON public.custom_video_sources;
CREATE POLICY "Admins can manage custom sources" 
ON public.custom_video_sources 
FOR ALL 
USING (public.has_role(auth.uid(), 'admin'));

-- Ensure anyone can view active sources
DROP POLICY IF EXISTS "Anyone can view active custom sources" ON public.custom_video_sources;
CREATE POLICY "Anyone can view active custom sources" 
ON public.custom_video_sources 
FOR SELECT 
USING (is_active = true);
