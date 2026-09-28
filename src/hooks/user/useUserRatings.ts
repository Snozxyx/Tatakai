import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RatingRow } from '@/core/profile/ratingStats';

// A user's anime ratings (1–10). The `ratings` table has a public SELECT policy
// (`USING (true)`), so this works for any profile — own or another user's.
export function useUserRatings(userId?: string) {
  return useQuery({
    queryKey: ['user_ratings', userId],
    queryFn: async (): Promise<RatingRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('ratings')
        .select('anime_id, rating, review, created_at')
        .eq('user_id', userId);
      if (error) throw error;
      return (data || []) as RatingRow[];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
