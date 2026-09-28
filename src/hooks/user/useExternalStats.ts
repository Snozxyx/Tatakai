import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TATAKAI_API_URL } from '@/lib/api/api-client';
import type { ExternalStats } from '@/lib/externalIntegrations';

interface ProfileTokens {
  anilist_access_token?: string | null;
  mal_access_token?: string | null;
  anilist_user_id?: string | null;
  mal_user_id?: string | null;
}

/**
 * Fetches normalized AniList / MyAnimeList statistics for the connected user.
 * Computed server-side (TatakaiAPI /sync/stats) so the browser never calls
 * AniList/MAL directly — no CORS, tokens stay on the server. Only the profile
 * owner's linked accounts are read, so pass `enabled: false` when viewing others.
 */
export function useExternalStats(profile: ProfileTokens | null | undefined, enabled = true) {
  const hasAnilist = !!(profile?.anilist_access_token || profile?.anilist_user_id);
  const hasMal = !!(profile?.mal_access_token || profile?.mal_user_id);
  const anyLinked = hasAnilist || hasMal;

  const { data, isLoading } = useQuery<ExternalStats[]>({
    queryKey: ['external-stats', hasAnilist, hasMal],
    enabled: enabled && anyLinked,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return [];
      const res = await fetch(`${TATAKAI_API_URL}/sync/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data ?? []) as ExternalStats[];
    },
  });

  return {
    stats: data ?? [],
    hasAnilist,
    hasMal,
    isLoading: enabled && anyLinked && isLoading,
  };
}
