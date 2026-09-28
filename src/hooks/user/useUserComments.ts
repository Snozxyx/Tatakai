import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UserCommentRow {
  created_at: string;
}

// A user's comment timestamps, for the growth series and community analytics.
// `comments` has a public SELECT policy (`USING (true)`), so this covers any
// profile. Returns rows (not just a count) so months can be bucketed.
export function useUserComments(userId?: string) {
  return useQuery({
    queryKey: ['user_comments_rows', userId],
    queryFn: async (): Promise<UserCommentRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('comments')
        .select('created_at')
        .eq('user_id', userId);
      if (error) throw error;
      return (data || []) as UserCommentRow[];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
