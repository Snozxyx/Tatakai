import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  searchNovels,
  getNovelDetail,
  getNovelChapters,
  type NovelSearchOptions,
} from '@/core/content/novel-client';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { MEDIA_METADATA_STALE_TIME } from '@/lib/cache/mediaMetadataCache';

export function useNovelSearch(
  query: string,
  page = 1,
  limit = 20,
  options: NovelSearchOptions = {},
) {
  return useQuery({
    queryKey: ['novel-search', query, page, limit, JSON.stringify(options)],
    queryFn: () => searchNovels(query, page, limit, options),
    enabled: query.trim().length > 0,
    staleTime: 2 * 60 * 1000,
  });
}

export function useInfiniteNovelSearch(
  query: string,
  limit = 20,
  enabled = true,
  options: NovelSearchOptions = {},
) {
  return useInfiniteQuery({
    queryKey: ['novel-search', query, limit, JSON.stringify(options)],
    queryFn: ({ pageParam = 1 }) => searchNovels(query, pageParam as number, limit, options),
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? (lastPage.currentPage ?? 1) + 1 : undefined,
    initialPageParam: 1,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useNovelDetail(novelId: string | undefined) {
  return useQuery({
    queryKey: ['novel-detail', novelId],
    queryFn: () => getNovelDetail(String(novelId)),
    enabled: Boolean(novelId),
    staleTime: MEDIA_METADATA_STALE_TIME,
  });
}

export function useNovelChapters(novelId: string | undefined, title?: string, fullScan = false) {
  const client = useQueryClient();
  const detail = client.getQueryData<Awaited<ReturnType<typeof getNovelDetail>>>(['novel-detail', novelId])?.detail;
  const titles = [...new Set([title, detail?.title?.english, detail?.title?.romaji, ...(detail?.title?.synonyms || []), detail?.canonicalTitle].filter((value): value is string => Boolean(value && value !== 'Untitled')))];
  return useQuery({
    queryKey: ['novel-chapters', novelId, titles, fullScan ? 'full' : 'fast'],
    queryFn: () => getNovelChapters(String(novelId), titles[0], titles, {fullScan}),
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === novelId ? previous : undefined,
    enabled: Boolean(novelId) && titles.length > 0,
    staleTime: query => query.state.data?.mappedChapters.length ? 5 * 60 * 1000 : 30000,
    refetchInterval: query => query.state.data?.sourcesPending ? 2000 : false,
  });
}

const NOVEL_GENRES = [
  'Action', 'Adventure', 'Fantasy', 'Isekai', 'Romance', 'Drama', 'Mystery',
  'Horror', 'Sci-Fi', 'Slice of Life', 'Supernatural', 'Thriller', 'Harem',
  'Martial Arts', 'Historical', 'Psychological', 'Comedy',
];

/**
 * The novel hub's above-the-fold data — mirrors `useMangaHome`.
 *
 * One shared query key (adult flag included, like the manga hub) so
 * `NovelHomePage` and `IndexNovelShowcase` split the cost of the top lanes.
 */
export function useNovelHome() {
  const { settings } = useContentSafetySettings();
  const adult = settings.showAdultEverywhere;

  const query = useQuery({
    queryKey: ['novel-home', adult],
    queryFn: async () => {
      const [trending, popular, topRated, adultLatest, adultPopular] = await Promise.all([
        searchNovels('', 1, 12, { sort: 'TRENDING_DESC' }).catch(() => null),
        searchNovels('', 1, 12, { sort: 'POPULARITY_DESC' }).catch(() => null),
        searchNovels('', 1, 8, { sort: 'SCORE_DESC' }).catch(() => null),
        adult
          ? searchNovels('', 1, 12, { sort: 'POPULARITY_DESC', adult: true }).catch(() => null)
          : null,
        adult
          ? searchNovels('', 1, 12, { sort: 'TRENDING_DESC', adult: true }).catch(() => null)
          : null,
      ]);
      return {
        spotlight: topRated?.results ?? [],
        trending: trending?.results ?? [],
        popular: popular?.results ?? [],
        topRated: topRated?.results ?? [],
        newChapters: [] as NonNullable<typeof trending>['results'],
        adultLatest: adultLatest?.results ?? [],
        adultPopular: adultPopular?.results ?? [],
        genres: NOVEL_GENRES,
        fetchedAt: Date.now(),
      };
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return { ...query, adult };
}
