-- First, add the missing columns if they don't exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_watchlist boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_history boolean DEFAULT true;

-- Allow viewing watchlist of users who have public profiles with show_watchlist enabled
CREATE POLICY "Allow viewing public watchlists" ON public.watchlist
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = watchlist.user_id
    AND profiles.is_public = true
    AND COALESCE(profiles.show_watchlist, true) = true
  )
);

-- Allow viewing watch history of users who have public profiles with show_history enabled
CREATE POLICY "Allow viewing public history" ON public.watch_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = watch_history.user_id
    AND profiles.is_public = true
    AND COALESCE(profiles.show_history, true) = true
  )
);
