import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback, useEffect, useRef } from 'react';

// Generate or get session ID for anonymous tracking
function getSessionId(): string {
  let sessionId = sessionStorage.getItem('anime_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('anime_session_id', sessionId);
  }
  return sessionId;
}

export interface AnimeViewCount {
  anime_id: string;
  total_views: number;
  views_today: number;
  views_week: number;
  views_month: number;
}

export interface TrendingAnime {
  anime_id: string;
  views_week: number;
  views_today: number;
  total_views: number;
}

// Fetch view count for a single anime
// Note: Returns 0 if table doesn't exist yet (migration pending)
export function useAnimeViewCount(animeId: string | undefined) {
  return useQuery({
    queryKey: ['viewCount', animeId],
    queryFn: async (): Promise<number> => {
      if (!animeId) return 0;
      
      try {
        // Use raw SQL query to avoid type issues with new table
        const { data, error } = await (supabase as any)
          .from('anime_view_counts')
          .select('total_views')
          .eq('anime_id', animeId)
          .single();
        
        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
          // Table might not exist yet
          if (error.code === '42P01') return 0;
          console.error('Error fetching view count:', error);
        }
        
        return data?.total_views || 0;
      } catch {
        return 0;
      }
    },
    enabled: !!animeId,
    staleTime: 60000, // 1 minute
  });
}

// Fetch trending anime by views
// Note: Returns empty array if function doesn't exist yet (migration pending)
export function useTrendingAnime(limit: number = 20, window: 'today' | 'week' | 'month' | 'all' = 'week') {
  return useQuery({
    queryKey: ['trending', limit, window],
    queryFn: async (): Promise<TrendingAnime[]> => {
      try {
        const { data, error } = await (supabase as any)
          .rpc('get_trending_anime', { p_limit: limit, p_window: window });
        
        if (error) {
          // Function might not exist yet
          if (error.code === '42883') return [];
          const { logger } = await import('@/lib/logger');
          void logger.error('Error fetching trending:', error);
          return [];
        }
        
        return (data as TrendingAnime[]) || [];
      } catch (e) {
        const { logger } = await import('@/lib/logger');
        void logger.error('Exception fetching trending:', e);
        return [];
      }
    },
    staleTime: 300000, // 5 minutes
  });
}

// Record a view
// Note: Silently fails if function doesn't exist yet (migration pending)
export function useRecordView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      animeId, 
      episodeId, 
      watchDuration = 0 
    }: { 
      animeId: string; 
      episodeId: string; 
      watchDuration?: number;
    }) => {
      const sessionId = getSessionId();
      
      try {
        const { error } = await (supabase as any).rpc('record_anime_view', {
          p_anime_id: animeId,
          p_episode_id: episodeId,
          p_user_id: user?.id || null,
          p_session_id: sessionId,
          p_watch_duration: watchDuration,
        });
        
        if (error) {
          // Function might not exist yet - ignore 42883 (undefined_function)
          if (error.code === '42883') return;
          console.error('Error recording view:', error);
          throw error;
        }
      } catch (e) {
        // Silently fail if migration hasn't been run
        console.log('View tracking not available yet');
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate view count cache
      queryClient.invalidateQueries({ queryKey: ['viewCount', variables.animeId] });
      queryClient.invalidateQueries({ queryKey: ['trending'] });
    },
  });
}

// Hook to automatically track viewing with duration
export function useViewTracker(animeId: string | undefined, episodeId: string | undefined) {
  const recordView = useRecordView();
  const startTimeRef = useRef<number | null>(null);
  const recordedRef = useRef(false);
  
  // Start tracking when component mounts
  useEffect(() => {
    if (!animeId || !episodeId) return;
    
    startTimeRef.current = Date.now();
    recordedRef.current = false;
    
    // Record initial view after 10 seconds of watching
    const initialViewTimer = setTimeout(() => {
      if (!recordedRef.current) {
        recordView.mutate({ animeId, episodeId, watchDuration: 10 });
        recordedRef.current = true;
      }
    }, 10000);
    
    return () => {
      clearTimeout(initialViewTimer);
      
      // Record final duration on unmount
      if (startTimeRef.current && recordedRef.current) {
        const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
        if (duration > 10) {
          recordView.mutate({ animeId, episodeId, watchDuration: duration });
        }
      }
    };
  }, [animeId, episodeId]);
  
  // Manual update function for periodic updates
  const updateDuration = useCallback(() => {
    if (!animeId || !episodeId || !startTimeRef.current) return;
    
    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    recordView.mutate({ animeId, episodeId, watchDuration: duration });
  }, [animeId, episodeId, recordView]);
  
  return { updateDuration };
}

// Format view count for display
export function formatViewCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  } else if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

// Fetch aggregated metrics for a single anime
export function useAnimeMetrics(animeId: string | undefined) {
  return useQuery({
    queryKey: ['anime_metrics', animeId],
    queryFn: async () => {
      if (!animeId) return null;
      try {
        const { data, error } = await (supabase as any).rpc('get_anime_metrics', { p_anime_id: animeId });
        if (error) {
          if (error.code === '42883') return null;
          const { logger } = await import('@/lib/logger');
          void logger.error('Error fetching anime metrics:', error);
          return null;
        }
        return data?.[0] ?? null;
      } catch (e) {
        const { logger } = await import('@/lib/logger');
        void logger.error('Exception fetching anime metrics:', e);
        return null;
      }
    },
    enabled: !!animeId,
    staleTime: 1000 * 60 * 5,
  });
}

// Recommendations for a user (simple co-occurrence based)
export function useRecommendationsForUser(userId: string | undefined, limit = 10) {
  return useQuery({
    queryKey: ['recommendations', userId, limit],
    queryFn: async () => {
      if (!userId) return [];
      try {
        const { data, error } = await (supabase as any).rpc('get_recommendations_for_user', { p_user_id: userId, p_limit: limit });
        if (error) {
          if (error.code === '42883') return [];
          const { logger } = await import('@/lib/logger');
          void logger.error('Error fetching recommendations:', error);
          return [];
        }
        return (data as any[]) || [];
      } catch (e) {
        const { logger } = await import('@/lib/logger');
        void logger.error('Exception fetching recommendations:', e);
        return [];
      }
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });
}
