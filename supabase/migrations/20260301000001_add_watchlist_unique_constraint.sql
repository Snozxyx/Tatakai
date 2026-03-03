-- Add UNIQUE constraint to watchlist for proper upsert support
-- Prevents duplicate entries of the same anime for a user
-- Required for ON CONFLICT DO UPDATE to work with bulk imports

ALTER TABLE public.watchlist
ADD CONSTRAINT watchlist_user_id_anime_id_unique UNIQUE (user_id, anime_id);
