-- Fix tier_lists table - rename tiers to items if needed
-- Run this if the table already exists with the wrong column name

-- First check if tiers column exists and items doesn't
DO $$
BEGIN
    -- If 'tiers' exists but 'items' doesn't, rename it
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'tier_lists' 
        AND column_name = 'tiers'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'tier_lists' 
        AND column_name = 'items'
    ) THEN
        ALTER TABLE public.tier_lists RENAME COLUMN tiers TO items;
    END IF;
    
    -- If 'items' doesn't exist at all, add it
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'tier_lists' 
        AND column_name = 'items'
    ) THEN
        ALTER TABLE public.tier_lists ADD COLUMN items jsonb NOT NULL DEFAULT '[]'::jsonb;
    END IF;
END $$;
