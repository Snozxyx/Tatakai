import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { analytics } from '@/core/analytics/AnalyticsService';

export interface FollowUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
}

/**
 * The follower / following list for a user (docs/Plans.md §5 "Social Connections
 * → dedicated pages"). `user_follows` stores auth user ids, which are
 * `profiles.user_id` — see [[tatakai-two-id-spaces-in-profiles]]; joining on
 * `profiles.id` would return no rows.
 */
export function useFollowList(targetUserId: string | undefined, type: 'followers' | 'following') {
  return useQuery<FollowUser[]>({
    queryKey: ['followList', type, targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];
      // followers: people who follow target (following_id = target) → follower_id
      // following: people target follows (follower_id = target) → following_id
      const matchColumn = type === 'followers' ? 'following_id' : 'follower_id';
      const idColumn = type === 'followers' ? 'follower_id' : 'following_id';

      const { data: rows, error } = await supabase
        .from('user_follows')
        .select(idColumn)
        .eq(matchColumn, targetUserId);
      if (error) throw error;

      const ids = [...new Set((rows ?? []).map((r: any) => r[idColumn]).filter(Boolean))];
      if (ids.length === 0) return [];

      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, banner_url')
        .in('user_id', ids);
      if (profErr) throw profErr;

      return (profiles ?? []) as FollowUser[];
    },
    enabled: !!targetUserId,
  });
}

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
