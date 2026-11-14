import { useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { adultApi, type AdultPage } from '@/lib/adultApi';
import { getContentModeCacheKey } from '@/lib/adultMode';
import { selectMediaTitle, selectReadingTitle } from '@/lib/titleLanguage';
import { UnifiedMediaCard } from '@/components/UnifiedMediaCard';
import { HomeSectionHeading } from '@/components/home/HomeSectionHeading';
import { Button } from '@/components/ui/button';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { normalizeAdultCategories, selectedAdultCategories } from '@/lib/adultContentPolicy';

/** The familiar home cards, backed exclusively by the active adult catalog. */
export function AdultInfiniteHome({ kind }: { kind: 'anime' | 'manga' | 'novel' }) {
  const { settings } = useContentSafetySettings();
  const enabled = selectedAdultCategories(normalizeAdultCategories(settings.adultCategories)).length > 0;
  const query = useInfiniteQuery({
    queryKey: ['adult-home-feed', kind, getContentModeCacheKey()],
    queryFn: ({ pageParam, signal }) => adultApi<AdultPage>('search', { kind, page: String(pageParam), limit: '24', sort: 'popular' }, signal),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => last.pageInfo.hasNextPage ? (last.pageInfo.currentPage || pages.length) + 1 : undefined,
    enabled, staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (!sentinel.current || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void fetchNextPage(); }, { rootMargin: '600px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const rows = [...new Map((query.data?.pages.flatMap(page => page.media) || []).map(row => [row.id, row])).values()];
  return <section className="space-y-6" data-adult-infinite-feed={kind}>
    <HomeSectionHeading title={'More ' + (kind === 'novel' ? 'novels' : kind)} />
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {rows.map(media => <UnifiedMediaCard key={media.id} libraryActions={Boolean(media.anilistId)} item={{
        id: media.id, href: '/adult/' + media.mediaType + '/' + encodeURIComponent(String(media.anilistId || media.id)),
        name: kind === 'anime' ? selectMediaTitle(media) : selectReadingTitle(media), poster: media.coverImageLarge || '',
        banner: media.bannerImage, description: media.description, mediaType: media.mediaType, type: media.format, status: media.status,
        anilistId: media.anilistId, malId: media.malId, isAdult: true, chapters: media.chapters,
      }} />)}
    </div>
    <div ref={sentinel} className="flex min-h-12 items-center justify-center">
      {(query.isPending || query.isFetchingNextPage) && <Loader2 size={20} className="animate-spin text-muted-foreground" aria-label="Loading more titles" />}
      {query.error && <Button variant="outline" onClick={() => query.refetch()}>Try again</Button>}
      {query.hasNextPage && !query.isFetchingNextPage && <Button variant="ghost" onClick={() => query.fetchNextPage()}>Load more</Button>}
    </div>
  </section>;
}
