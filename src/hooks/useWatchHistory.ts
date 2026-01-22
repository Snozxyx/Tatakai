import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface WatchHistoryItem {
  id: string;
  user_id: string;
  anime_id: string;
  anime_name: string;
  anime_poster: string | null;
  episode_id: string;
  episode_number: number;
  progress_seconds: number;
  duration_seconds: number | null;
  completed: boolean;
  watched_at: string;
}

export function useWatchHistory(limit?: number) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['watch_history', user?.id, limit],
    queryFn: async () => {
      let query = supabase
        .from('watch_history')
        .select('*')
        .eq('user_id', user!.id)
        .order('watched_at', { ascending: false });
      
      if (limit) {
        query = query.limit(limit);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as WatchHistoryItem[];
    },
    enabled: !!user,
  });
}

export function useContinueWatching() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['continue_watching', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watch_history')
        .select('*')
        .eq('user_id', user!.id)
        .eq('completed', false)
        .order('watched_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data as WatchHistoryItem[];
    },
    enabled: !!user,
  });
}

export function useUpdateWatchHistory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({
      animeId,
      animeName,
      animePoster,
      episodeId,
      episodeNumber,
      progressSeconds,
      durationSeconds,
      completed = false,
    }: {
      animeId: string;
      animeName: string;
      animePoster?: string;
      episodeId: string;
      episodeNumber: number;
      progressSeconds: number;
      durationSeconds?: number;
      completed?: boolean;
    }) => {
      const { data, error } = await supabase
        .from('watch_history')
        .upsert({
          user_id: user!.id,
          anime_id: animeId,
          anime_name: animeName,
          anime_poster: animePoster,
          episode_id: episodeId,
          episode_number: episodeNumber,
          progress_seconds: progressSeconds,
          duration_seconds: durationSeconds,
          completed,
          watched_at: new Date().toISOString(),
        }, { onConflict: 'user_id,episode_id' })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watch_history'] });
      queryClient.invalidateQueries({ queryKey: ['continue_watching'] });
    },
  });
}

export function useClearAllWatchHistory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('watch_history')
        .delete()
        .eq('user_id', user!.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watch_history'] });
      queryClient.invalidateQueries({ queryKey: ['continue_watching'] });
    },
  });
}
