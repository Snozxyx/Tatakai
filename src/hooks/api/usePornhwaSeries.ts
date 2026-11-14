import { useQuery } from '@tanstack/react-query';
import { adultApi, type AdultMedia } from '@/lib/adultApi';
import { resolvePornhwaIdentity } from '@/lib/pornhwaIdentity';
import type { PornhwaSeries } from '@/lib/pornhwaChapters';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { normalizeAdultCategories } from '@/lib/adultContentPolicy';

export function usePornhwaSeries(id: string | undefined, media?: Partial<AdultMedia>) {
  const { settings } = useContentSafetySettings();
  const lookup = /^pornhwadb:\d+$/.test(id || '') ? id : media?.sourceIds?.pornhwadb ? 'pornhwadb:' + media.sourceIds.pornhwadb : media?.tatakaiId ? 'tatakai:' + media.tatakaiId : 'anilist:' + id;
  const query = useQuery({
    queryKey: ['adult-pornhwa', lookup],
    queryFn: async ({ signal }) => {
      const identity = await resolvePornhwaIdentity(id!, media, signal);
      if (!identity) return null;
      return { ...await adultApi<Omit<PornhwaSeries, 'identity'>>('pornhwa/' + identity.pornhwaId, {}, signal), identity };
    },
    enabled: Boolean(id && media && settings.showAdultEverywhere && normalizeAdultCategories(settings.adultCategories).explicit),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  return { ...query, hideSpoilers: settings.hideAdultChapterSpoilers !== false };
}
