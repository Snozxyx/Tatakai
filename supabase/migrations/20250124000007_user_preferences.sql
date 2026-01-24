-- Add theme and preference columns to profiles table
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS theme_selected TEXT,
  ADD COLUMN IF NOT EXISTS theme_auto_detected TEXT,
  ADD COLUMN IF NOT EXISTS theme_selection_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS has_seen_theme_selector_onboarding BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ultra_lite_mode_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preferred_image_quality TEXT CHECK (preferred_image_quality IN ('ultra-lite', 'lite', 'normal', 'high')),
  ADD COLUMN IF NOT EXISTS preferred_pagination_size INTEGER;