import { useMemo, useRef, useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getMangaSections, getMangaSectionItems } from '@/core/content/manga-client';
import { UnifiedMediaCardProps } from '@/components/UnifiedMediaCard';
import {
  Sword, Heart, Laugh, Sparkles, Rocket, Ghost, Flower2, Compass, Search, Brain, Zap, Flame
} from 'lucide-react';
import { inferMangaAdultFlag } from '@/lib/contentSafety';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';

export type SectionLayout = 'grid' | 'carousel' | 'featured' | 'compact' | 'masonry';
export type SectionIcon = React.ComponentType<{ className?: string }>;

export interface MangaSection {
  id: string;
  title: string;
  genre: string;
  layout: SectionLayout;
  items: UnifiedMediaCardProps["item"][];
  icon?: SectionIcon;
}

/**
 * Icon *name* → component. The server sends the name so the shelf list can live
 * outside the bundle; the mapping stays here because lucide components can't
 * cross an HTTP boundary.
 */
const SECTION_ICONS: Record<string, SectionIcon> = {
  Sword, Heart, Laugh, Sparkles, Rocket, Ghost, Flower2, Compass, Search, Brain, Zap, Flame,
};

const LAYOUTS: readonly SectionLayout[] = ['grid', 'carousel', 'featured', 'compact', 'masonry'];

/** Cards the shelf renders. The server sends 7 so the adult filter has slack. */
const FIXED_SECTION_ITEMS = 5;

function toLayout(value: string): SectionLayout {
  return (LAYOUTS as readonly string[]).includes(value) ? (value as SectionLayout) : 'grid';
}

function dedupeItems(items: UnifiedMediaCardProps["item"][]): UnifiedMediaCardProps["item"][] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.anilistId || item.malId || item.id || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapSearchRowsToItems(rawItems: any[], canShowAdult: boolean): UnifiedMediaCardProps["item"][] {
  return rawItems
    .filter(item => {
      const isAdult = inferMangaAdultFlag(item);
      return !isAdult || canShowAdult;
    })
    .map(item => ({
      id: String(item.anilistId || item.malId || item.id),
      name: item.canonicalTitle || item.title?.english || item.title?.romaji || item.title?.native || "Unknown",
      poster: item.poster || "",
      type: item.mediaType || "manga",
      status: item.status || undefined,
      rating: typeof item.score === "number" && Number.isFinite(item.score) ? (item.score / 10).toFixed(1) : undefined,
      chapters: typeof item.chapters === "number" && item.chapters > 0 ? item.chapters : undefined,
      malId: typeof item.malId === "number" ? item.malId : undefined,
      anilistId: typeof item.anilistId === "number" ? item.anilistId : undefined,
      mediaType: "manga" as const,
    }));
}

/**
 * The manga hub's endless feed, one request per scroll page.
 *
 * The shelf catalogue — 61 genre/tag/origin shelves, their order, their filters
 * and their AniList queries — lives in the API (`services/mangaSections.ts`) and
 * arrives four shelves at a time from `/api/v3/manga/sections?page=N`.
 *
 * What that replaced: a module-level `Math.random()` shuffle over a local shelf
 * list, then four parallel `/manga/search` calls per scroll page, each asking for
 * 20 heavy records to render 5 cards and upserting 20 mapping rows on the way.
 * Four requests became one, the order became stable (so the response is cacheable
 * and shelves keep their identity across refetches), and the shelves are now
 * filtered by real AniList tags instead of free-text guesses like
 * `"cultivation manga"`.
 */
export function useInfiniteMangaSections({ showAdult }: { showAdult: boolean }) {
  return useInfiniteQuery({
    queryKey: ['infiniteMangaSections', showAdult],
    queryFn: async ({ pageParam = 1 }) => {
      const feed = await getMangaSections(pageParam, showAdult);

      const sections: MangaSection[] = feed.sections.map((section) => ({
        id: section.id,
        title: section.title,
        genre: section.genre,
        layout: toLayout(section.layout),
        icon: SECTION_ICONS[section.icon],
        // Keep ALL fetched items — SectionContent paginates within each shelf.
        items: dedupeItems(mapSearchRowsToItems(section.items, showAdult)),
      }));

      return {
        sections: sections.filter((s) => s.items.length >= FIXED_SECTION_ITEMS),
        nextPage: feed.hasNextPage ? feed.page + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

const SECTION_SCROLL_PAGE_SIZE = 20;

/**
 * Infinite scroll within a single shelf.
 *
 * The initial 5-7 items come from the parent shelf feed (`seedItems`); subsequent
 * pages arrive from `/api/v3/manga/sections/:id/items?page=N`, so a genre's
 * shelf can grow without limit instead of being hard-capped at a handful of cards.
 */
export function useMangaSectionItems(
  sectionId: string,
  isMobile: boolean,
  seedItems: UnifiedMediaCardProps["item"][] = [],
) {
  const { settings } = useContentSafetySettings();

  const query = useInfiniteQuery({
    queryKey: ['mangaSectionItems', sectionId, settings.showAdultEverywhere],
    queryFn: async ({ pageParam = 1 }) => {
      const data = await getMangaSectionItems(sectionId, pageParam, {
        adult: settings.showAdultEverywhere,
        perPage: SECTION_SCROLL_PAGE_SIZE,
      });
      if (!data) return null;
      return data.items;
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < SECTION_SCROLL_PAGE_SIZE) return undefined;
      return allPages.length + 1;
    },
    initialPageParam: 1,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 1000, // short cache for scroll data
    enabled: Boolean(sectionId),
  });

  const fetchedItems = useMemo(() => {
    return dedupeItems(
      (query.data?.pages.filter(Boolean) ?? [])
        .map((page) => (page as unknown) as UnifiedMediaCardProps["item"][])
        .flat(),
    );
  }, [query.data?.pages]);

  const items = useMemo(() => dedupeItems([...seedItems, ...fetchedItems]), [seedItems, fetchedItems]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (query.isFetchingNextPage) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && query.hasNextPage) {
            query.fetchNextPage();
          }
        },
        { rootMargin: isMobile ? "200px" : "400px" },
      );
      if (node) observerRef.current.observe(node);
    },
    // query object methods are stable, isMobile is a simple boolean
    [query, isMobile],
  );

  // Expose the sentinel ref to the component for placement
  return {
    items,
    loadMore: query.fetchNextPage,
    isFetching: query.isFetchingNextPage,
    hasMore: Boolean(query.hasNextPage),
    sentinelRef,
  };
}
