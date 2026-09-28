import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface SuggestedUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
}

/**
 * "Who to follow" source that works on low-data DBs where the
 * `get_leaderboard_active` RPC returns nothing. Pulls public profiles the
 * viewer isn't already following (and isn't themselves). The SocialWidget
 * falls back to the leaderboard only if this comes back empty.
 * Follows/profile ids are auth ids — see [[tatakai-two-id-spaces-in-profiles]].
 */
export function useSuggestedUsers(limit = 8) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['suggested-users', user?.id, limit],
    queryFn: async (): Promise<SuggestedUser[]> => {
      let followingIds: string[] = [];
      if (user) {
        const { data: follows } = await supabase
          .from('user_follows')
          .select('following_id')
          .eq('follower_id', user.id);
        followingIds = (follows || []).map((f: any) => f.following_id).filter(Boolean);
      }
      const exclude = new Set<string>(followingIds);
      if (user) exclude.add(user.id);

      // Over-fetch so we still have `limit` rows after removing self + follows.
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, banner_url')
        .eq('is_public', true)
        .not('username', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit + followingIds.length + 10);
      if (error) throw error;

      return ((data || []) as any[])
        .filter((p) => p.user_id && !exclude.has(p.user_id))
        .slice(0, limit);
    },
  });
}
