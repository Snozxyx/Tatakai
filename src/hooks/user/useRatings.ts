import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface RatingProfile {
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
}

interface Rating {
  id: string;
  user_id: string;
  anime_id: string;
  rating: number;
  review: string | null;
  created_at: string;
  updated_at: string;
  profile?: RatingProfile;
}

interface AnimeRatingStats {
  average: number;
  count: number;
  distribution: { [key: number]: number };
}

export function useAnimeRatings(animeId: string | undefined) {
  return useQuery({
    queryKey: ['ratings', animeId],
    queryFn: async () => {
      const { data: ratings, error } = await supabase
        .from('ratings')
        .select('*')
        .eq('anime_id', animeId!)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      if (!ratings || ratings.length === 0) return [] as Rating[];
      
      // Fetch profiles for all raters
      const userIds = [...new Set(ratings.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, username')
        .in('user_id', userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      
      return ratings.map(r => ({
        ...r,
        profile: profileMap.get(r.user_id),
      })) as Rating[];
    },
    enabled: !!animeId,
  });
}

export function useAnimeRatingStats(animeId: string | undefined) {
  const { data: ratings } = useAnimeRatings(animeId);
  
  return useQuery({
    queryKey: ['rating_stats', animeId],
    queryFn: async (): Promise<AnimeRatingStats> => {
      if (!ratings || ratings.length === 0) {
        return { average: 0, count: 0, distribution: {} };
      }
      
      const distribution: { [key: number]: number } = {};
      let total = 0;
      
      ratings.forEach(r => {
        total += r.rating;
        distribution[r.rating] = (distribution[r.rating] || 0) + 1;
      });
      
      return {
        average: total / ratings.length,
        count: ratings.length,
        distribution,
      };
    },
    enabled: !!ratings,
  });
}

export function useUserRating(animeId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['user_rating', user?.id, animeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ratings')
        .select('*')
        .eq('anime_id', animeId!)
        .eq('user_id', user!.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as Rating | null;
    },
    enabled: !!user && !!animeId,
  });
}

export function useRateAnime() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({
      animeId,
      rating,
      review,
    }: {
      animeId: string;
      rating: number;
      review?: string;
    }) => {
      const { data, error } = await supabase
        .from('ratings')
        .upsert({
          user_id: user!.id,
          anime_id: animeId,
          rating,
          review,
        }, { onConflict: 'user_id,anime_id' })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ratings', variables.animeId] });
      queryClient.invalidateQueries({ queryKey: ['rating_stats', variables.animeId] });
      queryClient.invalidateQueries({ queryKey: ['user_rating'] });
      toast.success('Rating saved');
    },
    onError: () => {
      toast.error('Failed to save rating');
    },
  });
}

export function useDeleteRating() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (animeId: string) => {
      const { error } = await supabase
        .from('ratings')
        .delete()
        .eq('anime_id', animeId);
      
      if (error) throw error;
    },
    onSuccess: (_, animeId) => {
      queryClient.invalidateQueries({ queryKey: ['ratings', animeId] });
      queryClient.invalidateQueries({ queryKey: ['rating_stats', animeId] });
      queryClient.invalidateQueries({ queryKey: ['user_rating'] });
      toast.success('Rating removed');
    },
    onError: () => {
      toast.error('Failed to remove rating');
    },
  });
}
