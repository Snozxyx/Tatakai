import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type WatchlistStatus = 'watching' | 'completed' | 'plan_to_watch' | 'dropped' | 'on_hold';

interface WatchlistItem {
  id: string;
  user_id: string;
  anime_id: string;
  anime_name: string;
  anime_poster: string | null;
  status: WatchlistStatus;
  created_at: string;
  updated_at: string;
}

export function useWatchlist() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['watchlist', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      return data as WatchlistItem[];
    },
    enabled: !!user,
  });
}

export function useWatchlistItem(animeId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['watchlist', user?.id, animeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watchlist')
        .select('*')
        .eq('anime_id', animeId!)
        .maybeSingle();
      
      if (error) throw error;
      return data as WatchlistItem | null;
    },
    enabled: !!user && !!animeId,
  });
}

export function useAddToWatchlist() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ 
      animeId, 
      animeName, 
      animePoster, 
      status = 'plan_to_watch' 
    }: { 
      animeId: string; 
      animeName: string; 
      animePoster?: string;
      status?: WatchlistStatus;
    }) => {
      const { data, error } = await supabase
        .from('watchlist')
        .upsert({
          user_id: user!.id,
          anime_id: animeId,
          anime_name: animeName,
          anime_poster: animePoster,
          status,
        }, { onConflict: 'user_id,anime_id' })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success('Added to watchlist');
    },
    onError: () => {
      toast.error('Failed to add to watchlist');
    },
  });
}

export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (animeId: string) => {
      const { error } = await supabase
        .from('watchlist')
        .delete()
        .eq('anime_id', animeId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success('Removed from watchlist');
    },
    onError: () => {
      toast.error('Failed to remove from watchlist');
    },
  });
}

// Bulk remove multiple anime ids from watchlist (used for multi-select delete)
export function useBulkRemoveFromWatchlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (animeIds: string[]) => {
      if (!animeIds || animeIds.length === 0) return;
      const { error } = await supabase
        .from('watchlist')
        .delete()
        .in('anime_id', animeIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success('Removed items from watchlist');
    },
    onError: (error: any) => {
      toast.error(`Failed to remove: ${error?.message || String(error)}`);
    },
  });
}
