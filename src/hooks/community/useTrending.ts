import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TrendingTag {
  tag: string;
  count: number;
}

/** Top hashtags across recent posts (last 7 days), for the trending rail. */
export function useTrendingTags(limit = 8) {
  return useQuery({
    queryKey: ['trending-tags', limit],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TrendingTag[]> => {
      const db = supabase as any;
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      try {
        const { data, error } = await db
          .from('post_hashtags')
          .select('tag')
          .gte('created_at', since)
          .limit(1000);
        if (error) throw error;
        const counts = new Map<string, number>();
        (data || []).forEach((r: any) => counts.set(r.tag, (counts.get(r.tag) || 0) + 1));
        return [...counts.entries()]
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, limit);
      } catch {
        return []; // pre-migration
      }
    },
  });
}

/** Every hashtag ever used with its total post count, most-used first (item 8). */
export function useAllHashtags(limit = 100) {
  return useQuery({
    queryKey: ['all-hashtags', limit],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TrendingTag[]> => {
      const db = supabase as any;
      try {
        const { data, error } = await db
          .from('post_hashtags')
          .select('tag')
          .limit(5000);
        if (error) throw error;
        const counts = new Map<string, number>();
        (data || []).forEach((r: any) => counts.set(r.tag, (counts.get(r.tag) || 0) + 1));
        return [...counts.entries()]
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, limit);
      } catch {
        return []; // pre-migration
      }
    },
  });
}
