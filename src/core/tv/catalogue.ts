import { useInfiniteQuery } from '@tanstack/react-query';
import { contentGraph } from '@/core/content/content-graph';
import { toAnimeCard } from '@/core/content/types';
import { getPreferredTitleLanguage } from '@/lib/titleLanguage';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';

/** Empty advanced searches return no catalogue; browsing uses the paginated feed. */
export function useTVCatalogue(query: string, format?: string, showAdult = false) {
  useUiTranslation();
  const search = query.trim();
  return useInfiniteQuery({
    queryKey: ['tv-catalogue', search, format, showAdult, getPreferredTitleLanguage()],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const page = Number(pageParam), perPage = 24;
      const result = search
        ? await contentGraph.search({ query: search, page, perPage })
        : await contentGraph.getPopular(page, perPage);
      const raw = result.media;
      const cards = raw.filter(item => (showAdult || !item.isAdult) &&
        (!format || (format === 'movie' ? item.format === 'MOVIE' : item.format === 'TV' || item.format === 'TV_SHORT'))).map(toAnimeCard);
      return {
        animes: cards,
        ids: raw.map(item => toAnimeCard(item).id),
        currentPage: page,
        hasMore: 'pageInfo' in result ? result.pageInfo.hasNextPage : raw.length >= perPage,
      };
    },
    getNextPageParam: (last, pages) => {
      const seen = new Set(pages.slice(0, -1).flatMap(page => page.ids));
      return last.hasMore && last.ids.some(id => !seen.has(id)) ? last.currentPage + 1 : undefined;
    },
    staleTime: 5 * 60 * 1000,
  });
}
