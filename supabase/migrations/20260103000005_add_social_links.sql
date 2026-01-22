-- Add social links to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '{}';

-- Update RLS policies to allow users to update their own social links
-- (Already covered by existing profile update policies)

-- Add show_watchlist and show_history privacy settings
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_watchlist boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_history boolean DEFAULT true;

-- Comment on columns
COMMENT ON COLUMN profiles.social_links IS 'JSON object containing social media links: { discord: string, instagram: string, twitter: string, mal: string, anilist: string, youtube: string, twitch: string }';
COMMENT ON COLUMN profiles.show_watchlist IS 'Whether to show watchlist on public profile';
COMMENT ON COLUMN profiles.show_history IS 'Whether to show watch history on public profile';
