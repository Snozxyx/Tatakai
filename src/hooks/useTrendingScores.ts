import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useTrendingScores(limit: number = 20) {
  return useQuery({
    queryKey: ['trending_scores', limit],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any).rpc('get_trending_scores', { p_limit: limit });
        if (error) {
          if (error.code === '42883') return [];
          const { logger } = await import('@/lib/logger');
          void logger.error('Error fetching trending scores:', error);
          return [];
        }
        return (data as any[]) || [];
      } catch (e) {
        const { logger } = await import('@/lib/logger');
        void logger.error('Exception fetching trending scores:', e);
        return [];
      }
    },
    staleTime: 1000 * 60 * 5,
  });
}
