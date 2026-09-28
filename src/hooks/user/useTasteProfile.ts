import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { TasteProfile } from '@/core/recommendations/types';

// Reads the persisted taste profile the recommendation engine writes to
// `user_taste_profiles`. RLS on that table is own-only, so this is only ever
// available for the logged-in user — never for another profile being viewed.
//
// We deliberately do NOT call useRecommendationEngine() here: computing a fresh
// profile enriches up to 60 titles via live AniList calls. If the row is absent
// (user never visited /recommendations), we return null and the cards show a
// "build your taste profile" empty state.
export function useTasteProfile(enabled = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['taste_profile', user?.id],
    queryFn: async (): Promise<TasteProfile | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('user_taste_profiles')
        .select('profile, sample_size, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        // Missing table / no row — treat as "no profile yet".
        return null;
      }
      const profile = (data as any)?.profile;
      return (profile as TasteProfile) || null;
    },
    enabled: enabled && !!user,
    staleTime: 15 * 60 * 1000,
  });
}
