import { customizationLabel as label } from '@/lib/customizationLabels';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useEffect, useRef, useState } from 'react';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { contentGraph } from '@/core/content/content-graph';
import { toAnimeCard, type SearchFilters } from '@/core/content/types';
import { searchManga, type MangaSearchOptions } from '@/core/content/manga-client';
import { searchNovels, type NovelSearchOptions } from '@/core/content/novel-client';
import { fetchCustomHome, fetchCustomSearch, fetchCustomCatalogPage } from '@/core/content/custom-source-runtime';
import { useCustomSources } from '@/hooks/api/useCustomSource';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { filterAdultAnime, inferMangaAdultFlag, isExplicitExtensionContent } from '@/lib/contentSafety';
import { UnifiedMediaCard, type UnifiedMediaCardProps } from '@/components/UnifiedMediaCard';
import { TVContentCard } from '@/components/tv/TVContentCard';
import { HomeSectionHeading } from '@/components/home/HomeSectionHeading';
import { Button } from '@/components/ui/button';
import { buildPreferredAnimeRouteId } from '@/lib/animeIdMapping';
import { customSourceBase } from '@/core/content/custom-source-model';
import { nextShelfPage, shelfSourceKey } from '@/lib/customizationSections';
import { runCustomShelfRequest } from '@/lib/customShelfQueue';
import type { CustomShelf as ShelfDefinition, LayoutTarget, ShelfSource } from '@/lib/customization';
import type { CustomMediaCard } from '@/core/extensions/sdk/types';

type CardItem = UnifiedMediaCardProps['item'];
export interface ShelfPage { items: CardItem[]; rawIds: string[]; hasMore: boolean; page: number; nextSkip?: number | null }
const ANIME_FORMATS: SearchFilters['format'] = ['TV', 'TV_SHORT', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'MUSIC'];
function readingCard(item: any, kind: 'manga' | 'novel'): CardItem {
  return { id: String(item.id || item.anilistId || item.malId), name: item.canonicalTitle || item.title?.english || item.title?.romaji || 'Untitled', poster: item.poster || '', mediaType: kind,
    anilistId: item.anilistId, malId: item.malId, type: item.type || item.format || kind, status: item.status, year: item.year, rating: item.score ? item.score / 10 : undefined, chapters: item.chapters, href: item.href, isAdult: inferMangaAdultFlag(item) };
}
const sourceCard = (item: CustomMediaCard, namespace: string, sourceId: string): CardItem => ({ id: item.id, name: item.title, poster: item.image || '', mediaType: 'anime', type: item.badge, status: item.subtitle, href: `${customSourceBase({ namespace, id: sourceId })}/info/${encodeURIComponent(item.id)}` });

/** Source-specific pagination stays separate from the displayed, safety-filtered collection. */
export async function fetchSavedShelf(source: ShelfSource, page: number, showAdult: boolean, signal?: AbortSignal, cursor?: number): Promise<ShelfPage> {
  let items: CardItem[] = [], rawIds: string[] = [], hasMore = false;
  if (source.kind === 'anime') {
    const filters = source.filters as SearchFilters;
    const result = await contentGraph.search({ ...filters, format: filters.format?.length ? filters.format : ANIME_FORMATS, isAdult: showAdult ? undefined : false, page, perPage: 24 });
    rawIds = result.media.map(item => String(item.anilistId || item.malId || item.tatakaiId));
    items = filterAdultAnime(result.media, showAdult).map(media => { const card = toAnimeCard(media); return { ...card, id: card.id, mediaType: 'anime', href: `/anime/${buildPreferredAnimeRouteId({ ...card }) || card.id}` }; });
    hasMore = result.pageInfo.hasNextPage;
  } else if (source.kind === 'manga' || source.kind === 'novel') {
    const filters = source.filters as MangaSearchOptions & NovelSearchOptions & { query?: string };
    const result = source.kind === 'manga' ? await searchManga(filters.query || '', page, 24, { ...filters, adult: showAdult }) : await searchNovels(filters.query || '', page, 24, { ...filters, adult: showAdult });
    rawIds = result.results.map(item => String(item.id || item.anilistId || item.malId));
    items = result.results.filter(item => showAdult || !inferMangaAdultFlag(item as any)).map(item => readingCard(item, source.kind as 'manga' | 'novel'));
    hasMore = result.hasNextPage === true;
  } else if (source.kind === 'provider-search') {
    const result = await fetchCustomSearch(source.namespace, source.sourceId, source.query, page, source.filters as any, signal);
    rawIds = result.results.map(item => item.id);
    items = result.results.filter(item => showAdult || !isExplicitExtensionContent(item)).map(item => sourceCard(item, source.namespace, source.sourceId));
    hasMore = result.hasNextPage;
  } else if (source.kind === 'provider-catalog') {
    if (source.catalogId) {
      const result = await fetchCustomCatalogPage(source.namespace, source.sourceId, source.catalogId, cursor ?? 0, signal);
      rawIds = result.items.map(item => item.id);
      items = result.items.filter(item => showAdult || !isExplicitExtensionContent(item)).map(item => sourceCard(item, source.namespace, source.sourceId));
      return { items, rawIds, hasMore: result.nextSkip !== null, page, nextSkip: result.nextSkip };
    }
    const result = await fetchCustomHome(source.namespace, source.sourceId, page, signal);
    const section = result.sections.find(section => source.sectionId ? section.id === source.sectionId : section.title === source.sectionTitle) || (!source.sectionId && !source.sectionTitle ? result.sections[0] : undefined);
    if (!section) throw new Error('This catalog section is unavailable. Choose a current provider catalog in the editor.');
    rawIds = section.items.map(item => item.id);
    items = section.items.filter(item => showAdult || !isExplicitExtensionContent(item)).map(item => sourceCard(item, source.namespace, source.sourceId));
    hasMore = result.hasNextPage === true;
  }
  signal?.throwIfAborted();
  return { items, rawIds, hasMore, page };
}

export function SavedCustomShelf({ shelf, target, preview = false }: { shelf: ShelfDefinition; target: LayoutTarget; preview?: boolean }) {
  useUiTranslation();
  const element = useRef<HTMLElement>(null);
  const [activated, setActivated] = useState(false);
  useEffect(() => {
    if (!element.current || activated) return;
    if (typeof IntersectionObserver === 'undefined') {
      const timer = window.setTimeout(() => setActivated(true), 80);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setActivated(true); observer.disconnect(); } }, { rootMargin: target === 'mobile' ? '250px' : '500px' });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [activated, target]);
  const { settings: safety } = useContentSafetySettings();
  const provider = shelf.source.kind === 'provider-search' || shelf.source.kind === 'provider-catalog' ? shelf.source : undefined;
  const sources = useCustomSources();
  const unavailable = provider && !sources.isLoading && !sources.data?.some(source => source.namespace === provider.namespace && source.id === provider.sourceId);
  const result = useInfiniteQuery({ queryKey: ['custom-home-shelf', shelfSourceKey(shelf.source), safety.showAdultEverywhere], initialPageParam: { page: 1, cursor: 0 }, enabled: activated && !unavailable,
    queryFn: ({ pageParam, signal }) => runCustomShelfRequest(() => fetchSavedShelf(shelf.source, pageParam.page, safety.showAdultEverywhere, signal, pageParam.cursor), signal),
    getNextPageParam: (last, pages) => {
      const next = nextShelfPage(last.rawIds, pages.slice(0, -1).flatMap(page => page.rawIds), last.hasMore, last.page);
      return next ? { page: next, cursor: last.nextSkip ?? 0 } : undefined;
    }, retry: false, staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000, refetchOnWindowFocus: false });
  const cards = useMemo(() => [...new Map(result.data?.pages.flatMap(page => page.items).map(item => [item.id, item]) || []).values()], [result.data]);
  return <section ref={element} style={!activated ? { minHeight: 320 } : undefined}>
    <HomeSectionHeading title={shelf.title} />
    {unavailable ? <p role="status" className="rounded-xl border border-border p-4 text-muted-foreground">{label("This provider is unavailable on this device. Connect it in Extensions to restore this section.")}</p> : result.isError ? <div role="alert"><p className="text-muted-foreground">{String(result.error instanceof Error ? result.error.message : label("This section could not load."))}</p><Button variant="outline" onClick={() => void result.refetch()}>{label("Retry section")}</Button></div> : !activated || result.isLoading ? <p role="status">{label("Loading section…")}</p> : !cards.length ? <p className="text-muted-foreground">{label("No titles match these filters.")}</p> : <div data-mobile-home-rail className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{cards.map(item => target === 'tv' ? <TVContentCard key={item.id} item={item} /> : <UnifiedMediaCard key={item.id} item={item} libraryActions={!provider} />)}</div>}
    {!unavailable && result.hasNextPage && <Button className="mt-4" variant="outline" disabled={result.isFetchingNextPage || preview} onClick={() => void result.fetchNextPage()}>{result.isFetchingNextPage ? label("Loading…") : label("Load more")}</Button>}
  </section>;
}
