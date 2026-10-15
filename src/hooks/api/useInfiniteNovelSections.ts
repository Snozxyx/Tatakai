import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useRef, useCallback } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { searchNovels } from '@/core/content/novel-client';
import type { UnifiedMediaCardProps } from '@/components/UnifiedMediaCard';
import {
  Sword, Heart, Laugh, Sparkles, Rocket, Ghost, Flower2, Compass, Search, Brain, Zap, Flame, BookOpen,
} from 'lucide-react';
import { inferMangaAdultFlag } from '@/lib/contentSafety';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';

export type NovelSectionLayout = 'grid' | 'carousel' | 'featured' | 'compact' | 'masonry';
export type NovelSectionIcon = React.ComponentType<{ className?: string }>;

export interface NovelSection {
  id: string;
  title: string;
  genre: string;
  layout: NovelSectionLayout;
  items: UnifiedMediaCardProps['item'][];
  icon?: NovelSectionIcon;
}

const SECTION_ICONS: Record<string, NovelSectionIcon> = {
  Sword, Heart, Laugh, Sparkles, Rocket, Ghost, Flower2, Compass, Search, Brain, Zap, Flame, BookOpen,
};

// Same shelf rhythm as the manga endless feed, pointed at novel genres.
const SHELVES: Array<{ id: string; title: string; genre: string; icon: string }> = [
  { id: 'novel-fantasy', get title() { return uiI18n.t('app.fantasy_worlds_0afad65b'); }, genre: 'Fantasy', icon: 'Sparkles' },
  { id: 'novel-action', get title() { return uiI18n.t('app.action_packed_25c21d11'); }, genre: 'Action', icon: 'Sword' },
  { id: 'novel-romance', get title() { return uiI18n.t('app.romance_tales_eda7f54b'); }, genre: 'Romance', icon: 'Heart' },
  { id: 'novel-isekai', get title() { return uiI18n.t('app.otherworld_journeys_8ff7f87a'); }, genre: 'Isekai', icon: 'Rocket' },
  { id: 'novel-mystery', get title() { return uiI18n.t('app.mysteries_thrills_cb7c6ced'); }, genre: 'Mystery', icon: 'Search' },
  { id: 'novel-horror', get title() { return uiI18n.t('app.dark_haunting_5c553caa'); }, genre: 'Horror', icon: 'Ghost' },
  { id: 'novel-comedy', get title() { return uiI18n.t('app.laugh_out_loud_b2c96947'); }, genre: 'Comedy', icon: 'Laugh' },
  { id: 'novel-drama', get title() { return uiI18n.t('app.dramatic_sagas_fd0d835d'); }, genre: 'Drama', icon: 'Flower2' },
  { id: 'novel-adventure', get title() { return uiI18n.t('app.grand_adventures_762e2c4c'); }, genre: 'Adventure', icon: 'Compass' },
  { id: 'novel-scifi', get title() { return uiI18n.t('app.beyond_tomorrow_c9a45004'); }, genre: 'Sci-Fi', icon: 'Zap' },
  { id: 'novel-psychological', get title() { return uiI18n.t('app.mind_benders_8af0b0b4'); }, genre: 'Psychological', icon: 'Brain' },
  { id: 'novel-historical', get title() { return uiI18n.t('app.echoes_of_history_0cc7c578'); }, genre: 'Historical', icon: 'BookOpen' },
];

const SHELVES_PER_PAGE = 2;
const SHELF_ITEMS = 10;

function dedupeItems(items: UnifiedMediaCardProps['item'][]): UnifiedMediaCardProps['item'][] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.anilistId || item.malId || item.id || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapRowsToItems(rawItems: any[], canShowAdult: boolean): UnifiedMediaCardProps['item'][] {
  return rawItems
    .filter((item) => {
      const isAdult = inferMangaAdultFlag(item);
      return !isAdult || canShowAdult;
    })
    .map((item) => ({
      id: String(item.anilistId || item.malId || item.id),
      name: item.canonicalTitle || item.title?.english || item.title?.romaji || item.title?.native || 'Unknown',
      poster: item.poster || '',
      type: 'novel' as const,
      status: item.status || undefined,
      rating: typeof item.score === 'number' && Number.isFinite(item.score) ? (item.score / 10).toFixed(1) : undefined,
      chapters: typeof item.chapters === 'number' && item.chapters > 0 ? item.chapters : undefined,
      malId: typeof item.malId === 'number' ? item.malId : undefined,
      anilistId: typeof item.anilistId === 'number' ? item.anilistId : undefined,
      isAdult: inferMangaAdultFlag(item),
      mediaType: 'novel' as const,
    }));
}

/**
 * The novel hub's endless feed — same design as the manga one, two genre
 * shelves per scroll page, each shelf a `searchNovels` genre query.
 */
export function useInfiniteNovelSections() {
  useUiTranslation();
  const { settings } = useContentSafetySettings();
  const showAdult = settings.showAdultEverywhere;

  return useInfiniteQuery({
    queryKey: ['infiniteNovelSections', showAdult],
    queryFn: async ({ pageParam = 1 }): Promise<{ sections: NovelSection[]; hasNextPage: boolean }> => {
      const start = (pageParam - 1) * SHELVES_PER_PAGE;
      const shelves = SHELVES.slice(start, start + SHELVES_PER_PAGE);
      const sections: NovelSection[] = await Promise.all(
        shelves.map(async (shelf) => {
          const res = await searchNovels('', 1, SHELF_ITEMS, {
            genre: shelf.genre,
            sort: 'POPULARITY_DESC',
            adult: showAdult,
          }).catch(() => null);
          return {
            id: shelf.id,
            title: shelf.title,
            genre: shelf.genre,
            layout: 'carousel' as NovelSectionLayout,
            icon: SECTION_ICONS[shelf.icon],
            items: dedupeItems(mapRowsToItems(res?.results ?? [], showAdult)),
          };
        }),
      );
      return {
        sections: sections.filter((s) => s.items.length > 0),
        hasNextPage: start + SHELVES_PER_PAGE < SHELVES.length,
      };
    },
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.hasNextPage ? lastPageParam + 1 : undefined,
    initialPageParam: 1,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/** Within-shelf pagination — second genre page appended to a shelf rail. */
export function useNovelSectionItems(sectionId: string) {
  useUiTranslation();
  const shelf = SHELVES.find((s) => s.id === sectionId);
  const pageRef = useRef(1);
  const query = useQuery({
    queryKey: ['novel-section-items', sectionId],
    queryFn: async () => {
      if (!shelf) return [];
      pageRef.current += 1;
      const res = await searchNovels('', pageRef.current, SHELF_ITEMS, {
        genre: shelf.genre,
        sort: 'POPULARITY_DESC',
      }).catch(() => null);
      return mapRowsToItems(res?.results ?? [], true);
    },
    enabled: false,
    staleTime: 10 * 60 * 1000,
  });

  const loadMore = useCallback(() => {
    void query.refetch();
  }, [query]);

  return {
    items: (query.data ?? []) as UnifiedMediaCardProps['item'][],
    loadMore,
    isFetching: query.isFetching,
    hasMore: true,
    sentinelRef: { current: null } as React.RefObject<HTMLDivElement | null>,
  };
}
