import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { BookOpen, Film, Loader2, ScrollText, TrendingUp } from 'lucide-react';
import { AdultPageShell } from '@/components/content/AdultPageShell';
import { BoardHero } from '@/components/anime/discover/BoardHero';
import { PillGroup, type PillOption } from '@/components/anime/discover/PillGroup';
import { PosterCard } from '@/components/anime/discover/PosterCard';
import { POSTER_GRID_CLASS, PosterGridSkeleton } from '@/components/anime/discover/DiscoverPosterGrid';
import { SectionHeading } from '@/components/anime/discover/SectionHeading';
import { RAIL_LENGTH, type PosterItem } from '@/components/anime/discover/types';
import { Button } from '@/components/ui/button';
import { ThemedSelect } from '@/components/ui/themed-select';
import { adultApi, type AdultMedia, type AdultPage } from '@/lib/adultApi';
import { selectMediaTitle, selectReadingTitle } from '@/lib/titleLanguage';
import { normalizeAdultCategories, selectedAdultCategories } from '@/lib/adultContentPolicy';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { useSettingsModal } from '@/contexts/SettingsModalContext';

type Kind = 'anime' | 'manga' | 'novel';
const kinds: PillOption<Kind>[] = [
  { id: 'anime', label: 'Anime', icon: <Film size={16} strokeWidth={1.5} /> },
  { id: 'manga', label: 'Manga', icon: <BookOpen size={16} strokeWidth={1.5} /> },
  { id: 'novel', label: 'Novels', icon: <ScrollText size={16} strokeWidth={1.5} /> },
];
function poster(media: AdultMedia): PosterItem {
  return { key: media.id, href: '/adult/' + media.mediaType + '/' + encodeURIComponent(String(media.anilistId || media.id)),
    title: media.mediaType === 'anime' ? selectMediaTitle(media) : selectReadingTitle(media), poster: media.coverImageLarge || '/placeholder.svg',
    anilistId: media.mediaType === 'anime' ? media.anilistId : undefined, isAdult: media.isAdult,
    meta: [media.format, media.startDate?.year].filter(Boolean).join(' · '), score: media.averageScore != null ? (media.averageScore / 10).toFixed(1) : undefined };
}

export default function AdultTrendingPage() {
  const [params, setParams] = useSearchParams();
  const requestedKind = params.get('kind');
  const kind: Kind = requestedKind === 'manga' || requestedKind === 'novel' ? requestedKind : 'anime';
  const { settings } = useContentSafetySettings();
  const { openSettings } = useSettingsModal();
  const categories = selectedAdultCategories(normalizeAdultCategories(settings.adultCategories));
  const query = useInfiniteQuery({
    queryKey: ['adult-trending', kind, categories.join(','), params.toString()],
    queryFn: ({ pageParam, signal }) => adultApi<AdultPage & { note?: string }>('trending', {
      kind, page: String(pageParam), limit: '24', q: params.get('q') || undefined, genre: params.get('genre') || undefined,
      source: params.get('source') || undefined, sort: params.get('sort') || undefined,
    }, signal),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => last.pageInfo?.hasNextPage ? (last.pageInfo.currentPage || pages.length) + 1 : undefined,
    enabled: categories.length > 0,
  });
  const media = [...new Map((query.data?.pages.flatMap(page => page.media) || []).map(row => [row.id, row])).values()];
  const items = media.map(poster);
  const podium = items.slice(0, RAIL_LENGTH);
  const rest = items.slice(RAIL_LENGTH);
  const first = query.data?.pages[0];
  const manualRanking = ['q', 'genre', 'source', 'sort'].some(key => params.has(key));
  const storedRanking = first?.source === 'db' || manualRanking;
  const subject = kind === 'novel' ? 'novels' : kind;
  const heading = params.get('sort') === 'score' ? 'Highest rated ' + subject : params.get('sort') === 'latest' ? 'Recently updated ' + subject : storedRanking ? 'Popular ' + subject : 'Trending ' + subject;
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    next.delete('page');
    if (key === 'kind') { next.delete('source'); next.delete('sort'); }
    setParams(next);
  };
  return <AdultPageShell header={false}>
    {!categories.length ? <div className="gallery-state"><TrendingUp size={24} strokeWidth={1.5} /><h2>Adult categories are hidden</h2><Button variant="outline" onClick={() => openSettings('nsfw')}>Content settings</Button></div> : <>
      <BoardHero className="adult-trending-board" eyebrow={storedRanking ? 'Catalog rankings' : 'Trending'} heading={heading}
        description={storedRanking ? 'Ranked from the stored catalog' : 'Ranked by current AniList activity'} leader={podium[0]}
        items={podium} isLoading={query.isPending} backdrop={media[0]?.bannerImage} ctaLabel={kind === 'anime' ? 'Open anime' : 'Open series'}>
        <PillGroup options={kinds} value={kind} onChange={value => change('kind', value)} label="Trending catalog" />
      </BoardHero>
      <section className="mt-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <SectionHeading title="The full board" meta={first?.pageInfo?.total != null ? first.pageInfo.total.toLocaleString() + ' titles' : undefined} />
          <div className="flex flex-wrap gap-2">
            {kind === 'manga' && <ThemedSelect aria-label="Ranking source" value={params.get('source') || ''} onChange={event => change('source', event.target.value)}><option value="">All titles</option><option value="pornhwadb">Pornhwa</option></ThemedSelect>}
            <ThemedSelect aria-label="Ranking order" value={params.get('sort') || ''} onChange={event => change('sort', event.target.value)}><option value="">Trending</option><option value="popular">Popular</option><option value="score">Highest rated</option><option value="latest">Recently updated</option></ThemedSelect>
          </div>
        </div>
        {first?.note && <p role="status" className="mb-6 text-sm text-muted-foreground">{first.note}</p>}
        {query.error ? <div className="gallery-state" role="alert"><h2>Rankings are unavailable</h2><p>{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Try again</Button></div>
          : query.isPending ? <PosterGridSkeleton count={14} />
          : !items.length ? <div className="gallery-state"><TrendingUp size={24} strokeWidth={1.5} /><h2>No titles match these filters</h2><Button variant="outline" onClick={() => setParams({ kind })}>Clear filters</Button></div>
          : rest.length > 0 ? <div className={POSTER_GRID_CLASS}>{rest.map((item, index) => <PosterCard key={item.key} item={item} rank={index + RAIL_LENGTH + 1} preview={kind === 'anime'} />)}</div>
          : <p className="text-sm text-muted-foreground">All ranked titles are shown above</p>}
        {query.hasNextPage && <div className="gallery-load-more"><Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage && <Loader2 size={16} className="animate-spin" />}Load more</Button></div>}
      </section>
    </>}
  </AdultPageShell>;
}
