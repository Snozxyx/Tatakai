import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { activityPermitted, DEFAULT_SOCIAL_PRIVACY, getSocialActivity, publishSocialActivity, type SocialActivity, type SocialPresence, type SocialPrivacy } from '@/lib/socialActivity';

// New migration-backed endpoints are kept typed here until the database type generator runs.
const db = supabase as any;
export function useSocialPrivacy() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const query = useQuery<SocialPrivacy>({
    queryKey: ['social-privacy', user?.id], enabled: !!user, refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await db.from('social_privacy').select('show_online,show_last_seen,share_watching,share_reading').eq('user_id', user!.id).maybeSingle();
      if (error) throw error;
      return data ?? DEFAULT_SOCIAL_PRIVACY;
    },
  });
  const update = useMutation({
    mutationFn: async (next: SocialPrivacy) => {
      const { error } = await db.rpc('set_social_privacy', { p_online: next.show_online, p_last_seen: next.show_last_seen, p_watching: next.share_watching, p_reading: next.share_reading });
      if (error) throw error;
      return next;
    },
    onSuccess: next => {
      cache.setQueryData(['social-privacy', user?.id], next);
      void cache.invalidateQueries({ queryKey: ['social-presence'] });
      window.dispatchEvent(new Event('tatakai:social-activity'));
    },
  });
  return { ...query, update };
}

export function useSocialPresence(userIds: string[] = [], friends = false, enabled = true) {
  const { user } = useAuth();
  const key = [...new Set(userIds)].sort().slice(0, 100).join(',');
  return useQuery<SocialPresence[]>({
    queryKey: ['social-presence', user?.id, friends, key],
    enabled: !!user && enabled && (friends || !!key), staleTime: 10_000, refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('get_social_presence', { p_user_ids: key ? key.split(',') : null, p_friends: friends });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** A single application-wide heartbeat; private settings fail closed while loading. */
export function useSocialPresencePublisher(enabled = true) {
  const { user, profile } = useAuth();
  const { data: privacy } = useSocialPrivacy();
  const location = useLocation();
  useEffect(() => {
    if (!enabled || !user || !privacy || !profile?.is_public) return;
    let disposed = false;
    const send = () => {
      if (disposed) return;
      const visible = document.visibilityState === 'visible';
      const activity = visible && activityPermitted(getSocialActivity(), privacy) ? getSocialActivity() : null;
      void db.rpc('heartbeat_social_activity', {
        p_active: visible, p_kind: activity?.kind ?? null, p_title: activity?.title ?? null,
        p_href: activity?.href ?? null, p_image: activity?.image ?? null, p_detail: activity?.detail ?? null,
      }).then(() => undefined, () => undefined);
    };
    send();
    const timer = window.setInterval(send, 30_000);
    window.addEventListener('tatakai:social-activity', send);
    document.addEventListener('visibilitychange', send);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener('tatakai:social-activity', send);
      document.removeEventListener('visibilitychange', send);
      // No exit heartbeat: it could race a new account or route. The lease expires naturally.
    };
  }, [enabled, user, profile?.is_public, privacy, location.pathname]);
}

export function usePublishSocialActivity(activity: SocialActivity | null) {
  const { kind, title, href, image, detail } = activity ?? {};
  useEffect(() => {
    if (!kind || !title || !href) return;
    publishSocialActivity({ kind, title, href, image, detail });
    return () => publishSocialActivity(null);
  }, [kind, title, href, image, detail]);
}
