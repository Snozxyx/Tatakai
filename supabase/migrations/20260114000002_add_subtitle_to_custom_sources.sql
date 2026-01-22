-- Add subtitle support to custom_video_sources
ALTER TABLE public.custom_video_sources 
ADD COLUMN IF NOT EXISTS subtitle_url text;

ALTER TABLE public.custom_video_sources 
ADD COLUMN IF NOT EXISTS subtitle_lang text;

-- Add manual subtitle support to watch_rooms
ALTER TABLE public.watch_rooms 
ADD COLUMN IF NOT EXISTS manual_subtitle_url text;

-- Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';
