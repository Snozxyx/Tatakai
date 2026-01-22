import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { analytics } from '@/services/AnalyticsService';

export function useFollow(targetUserId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Check if following
  const { data: isFollowing, isLoading: checkingFollow } = useQuery({
    queryKey: ['isFollowing', user?.id, targetUserId],
    queryFn: async () => {
      if (!user || !targetUserId) return false;
      const { data, error } = await supabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!user && !!targetUserId,
  });

  // Get counts
  const { data: followStats, isLoading: loadingStats } = useQuery({
    queryKey: ['followStats', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return { followers: 0, following: 0 };

      const [followersRes, followingRes] = await Promise.all([
        supabase
          .from('user_follows')
          .select('id', { count: 'exact', head: true })
          .eq('following_id', targetUserId),
        supabase
          .from('user_follows')
          .select('id', { count: 'exact', head: true })
          .eq('follower_id', targetUserId),
      ]);

      return {
        followers: followersRes.count || 0,
        following: followingRes.count || 0,
      };
    },
    enabled: !!targetUserId,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (!user || !targetUserId) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('user_follows')
        .insert({
          follower_id: user.id,
          following_id: targetUserId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isFollowing', user?.id, targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['followStats', targetUserId] });
      analytics.trackEvent('follow_user', { target_user_id: targetUserId });
      toast.success('Followed user');
    },
    onError: (error) => {
      toast.error('Failed to follow: ' + error.message);
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      if (!user || !targetUserId) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isFollowing', user?.id, targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['followStats', targetUserId] });
      analytics.trackEvent('unfollow_user', { target_user_id: targetUserId });
      toast.success('Unfollowed user');
    },
    onError: (error) => {
      toast.error('Failed to unfollow: ' + error.message);
    },
  });

  return {
    isFollowing,
    checkingFollow,
    followStats,
    loadingStats,
    follow: followMutation.mutate,
    unfollow: unfollowMutation.mutate,
    isFollowingLoading: followMutation.isPending || unfollowMutation.isPending,
  };
}
