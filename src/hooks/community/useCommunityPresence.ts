import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PresenceUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

/**
 * Ephemeral community presence via Supabase Realtime Presence — "online now"
 * only, nothing persisted. Every mounted session tracks itself on a shared
 * `community-presence` channel keyed by the auth id; the channel's presence
 * state is flattened into a de-duped list + a fast lookup Set.
 *
 * No DB, no migration: this is the single source of the green online dots and
 * the members showcase. Signed-out visitors still observe who's online but
 * don't broadcast themselves.
 */
export function useCommunityPresence() {
  const { user, profile } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const channel = supabase.channel('community-presence', {
      config: { presence: { key: user?.id || `anon-${Math.random().toString(36).slice(2)}` } },
    });

    const sync = () => {
      const state = channel.presenceState<PresenceUser>();
      const byId = new Map<string, PresenceUser>();
      Object.values(state).forEach((entries) => {
        entries.forEach((entry) => {
          if (entry?.user_id) byId.set(entry.user_id, entry);
        });
      });
      setOnlineUsers([...byId.values()]);
    };

    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && user) {
          await channel.track({
            user_id: user.id,
            username: profile?.username ?? null,
            display_name: profile?.display_name ?? null,
            avatar_url: profile?.avatar_url ?? null,
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, profile?.username, profile?.display_name, profile?.avatar_url]);

  const onlineUserIds = useMemo(() => new Set(onlineUsers.map((u) => u.user_id)), [onlineUsers]);

  return { onlineUsers, onlineUserIds, onlineCount: onlineUserIds.size };
}
