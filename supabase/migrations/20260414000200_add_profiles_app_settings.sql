ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS app_settings jsonb DEFAULT '{}'::jsonb;

UPDATE public.profiles
SET app_settings = '{}'::jsonb
WHERE app_settings IS NULL;
