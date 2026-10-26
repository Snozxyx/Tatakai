import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { hasPremiumCosmetics } from '@/lib/profileCosmetics';
import { readProfileCustomization, type ProfileCustomization } from '@/lib/profileSettings';

type Request = { id: string; resolve: (value: ProfileCustomization) => void; reject: (error: unknown) => void };
let queued: Request[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

/** Coalesce identity requests from a feed into bounded queries, rather than fetching per avatar. */
function loadIdentity(id: string): Promise<ProfileCustomization> {
  return new Promise((resolve, reject) => {
    queued.push({ id, resolve, reject });
    if (timer) return;
    timer = setTimeout(() => {
      const requests = queued;
      queued = [];
      timer = undefined;
      const ids = [...new Set(requests.map(request => request.id))];
      for (let start = 0; start < ids.length; start += 100) {
        const batch = ids.slice(start, start + 100);
        const pending = requests.filter(request => batch.includes(request.id));
        void Promise.all([
          supabase.from('profiles').select('user_id, app_settings, is_admin, role').in('user_id', batch),
          supabase.from('user_badges').select('user_id, badge_key').in('user_id', batch),
        ]).then(([profiles, badges]) => {
          if (profiles.error) throw profiles.error;
          if (badges.error) throw badges.error;
          const byId = new Map(profiles.data.map(profile => [profile.user_id, profile]));
          for (const request of pending) {
            const profile = byId.get(request.id);
            const grants = badges.data.filter(badge => badge.user_id === request.id).map(badge => ({ key: badge.badge_key }));
            request.resolve(readProfileCustomization(profile, hasPremiumCosmetics(profile, grants)));
          }
        }).catch(error => pending.forEach(request => request.reject(error)));
      }
    }, 10);
  });
}

export function useIdentityCosmetics(userId?: string | null) {
  const query = useQuery({
    queryKey: ['profile_cosmetics', userId],
    enabled: !!userId,
    queryFn: () => loadIdentity(userId!),
    staleTime: 60_000,
    retry: 1,
  });
  return query.data ?? readProfileCustomization(null);
}
