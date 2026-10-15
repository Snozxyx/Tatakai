import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOnlinePresence } from '@/hooks/api/usePresence';
export interface PresenceUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}
/** Observe app-wide presence instead of only visitors on the community route. */
export function useCommunityPresence() {
  const entries = useOnlinePresence();
  const ids = useMemo(
    () =>
      [
        ...new Set(
          entries
            .map((entry) => entry.user_id)
            .filter((id): id is string => !!id)
        ),
      ].sort(),
    [entries]
  );
  const key = ids.join(',');
  const onlineUserIds = useMemo(() => new Set(ids), [ids]);
  const { data = [] } = useQuery({
    queryKey: ['online-member-profiles', key],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const result: PresenceUser[] = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const { data, error } = await supabase
          .from('profiles')
          .select('user_id,username,display_name,avatar_url')
          .in('user_id', ids.slice(offset, offset + 100));
        if (error) throw error;
        result.push(...(data || []));
      }
      return result;
    },
  });
  return {
    onlineUsers: ids.length ? data : [],
    onlineUserIds,
    onlineCount: onlineUserIds.size,
  };
}
