-- Add use_theme_colors and show_progress to popups
ALTER TABLE public.popups 
ADD COLUMN IF NOT EXISTS use_theme_colors boolean DEFAULT false;

-- Correctly update types if needed
DO $$ 
BEGIN
    -- Ensure columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'popups' AND column_name = 'use_theme_colors') THEN
        ALTER TABLE public.popups ADD COLUMN use_theme_colors boolean DEFAULT false;
    END IF;
END $$;
