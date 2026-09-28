import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Live feed: invalidate feed / poll queries when posts, votes, polls, or
 * reposts change anywhere. Mirrors the watchroom realtime wiring.
 */
export function useFeedRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidateFeed = () => queryClient.invalidateQueries({ queryKey: ['feed'] });

    const channel = supabase
      .channel('community-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_posts' }, invalidateFeed)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_votes' }, invalidateFeed)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_reposts' }, invalidateFeed)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_poll_votes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['feed'] });
        queryClient.invalidateQueries({ queryKey: ['post-poll'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
