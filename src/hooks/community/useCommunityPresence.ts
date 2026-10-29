import { useMemo } from 'react';
import { useSocialPresence } from './useSocialActivity';
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
  const { data = [] } = useSocialPresence(ids);
  const onlineUsers = data.filter(person => person.online);
  const onlineUserIds = new Set(onlineUsers.map(person => person.user_id));
  return { onlineUsers, onlineUserIds, onlineCount: onlineUserIds.size };
}
