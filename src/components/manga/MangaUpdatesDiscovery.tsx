import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { BookOpen, ExternalLink, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { resolveBackendOrigin } from '@/lib/api/backendOrigin';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { HomeSectionHeading } from '@/components/home/HomeSectionHeading';
import { UnifiedMediaCard } from '@/components/UnifiedMediaCard';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/ui/skeleton-custom';

export interface UpdatesEntry {
  id: string; seriesId: string; title: string; poster: string | null;
  type: string; adult?: boolean; href: string; chapter: string | null; date: string | null;
}
interface Feed { results: UpdatesEntry[]; page: number; hasNextPage: boolean; partial: boolean }
export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function useUpdates(kind: 'new' | 'releases', weekStart?: Date) {
  const { settings } = useContentSafetySettings();
  const start = weekStart ? localDate(weekStart) : '';
  const endDate = weekStart ? new Date(weekStart) : null;
  endDate?.setDate(endDate.getDate() + 6);
  const end = endDate ? localDate(endDate) : '';
  return useInfiniteQuery({
    queryKey: ['mangaupdates-feed', kind, start, end, settings.showAdultEverywhere],
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }): Promise<Feed> => {
      const params = new URLSearchParams({ kind, start, end, page: String(pageParam), adult: settings.showAdultEverywhere ? '1' : '0' });
      const response = await fetch(`${resolveBackendOrigin()}/api/proxy/mangaupdates-feed?${params}`, { signal });
      if (!response.ok) throw new Error('MangaUpdates unavailable');
      return response.json();
    },
    getNextPageParam: last => last.hasNextPage ? last.page + 1 : undefined,
    staleTime: 5 * 60_000, retry: false,
  });
}
function FeedStatus({ feed }: { feed: ReturnType<typeof useUpdates> }) {
  const { t } = useTranslation();
  return <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground" role="status">
    {feed.isError && <><span>{t('discovery.feedError')}</span><Button variant="outline" size="sm" onClick={() => void feed.refetch()}>{t('discovery.retry')}</Button></>}
    {feed.data?.pages.some(page => page.partial) && <span>{t('discovery.partial')}</span>}
    {feed.hasNextPage && <Button variant="outline" size="sm" disabled={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>{t(feed.isFetchingNextPage ? 'discovery.loading' : 'discovery.loadMore')}</Button>}
  </div>;
}
export function MangaWhatsNew() {
  const { t } = useTranslation();
  const feed = useUpdates('new');
  const items = [...new Map((feed.data?.pages.flatMap(page => page.results) || []).map(item => [item.seriesId, item])).values()];
  return <section className="mb-12" aria-label={t('discovery.whatsNew')}>
    <HomeSectionHeading icon={<Sparkles className="h-5 w-5 text-primary" />} title={t('discovery.whatsNew')} subtitle={t('discovery.newSubtitle')}
      action={<a href="https://www.mangaupdates.com/stats/new" target="_blank" rel="noreferrer" className="ui-forward-link flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">MangaUpdates <ExternalLink className="h-3.5 w-3.5" /></a>} />
    <div data-mobile-home-rail className="flex gap-4 overflow-x-auto pb-4">
      {feed.isPending ? Array.from({ length: 6 }, (_, i) => <div key={i} className="media-card-rail-item"><CardSkeleton /></div>)
        : items.map(item => <div key={item.seriesId} className="media-card-rail-item"><UnifiedMediaCard item={{ id: item.seriesId, name: item.title, poster: item.poster || '', mediaType: 'manga', type: item.type, isAdult: item.adult, href: item.href }} /></div>)}
    </div>
    {!feed.isPending && !feed.isError && !items.length && <p className="text-sm text-muted-foreground">{t('discovery.noNew')}</p>}
    <FeedStatus feed={feed} />
  </section>;
}
export function MangaReleaseCalendar({ weekStart }: { weekStart: Date }) {
  const { t, i18n } = useTranslation();
  const feed = useUpdates('releases', weekStart);
  const [type, setType] = useState('all');
  const items = [...new Map((feed.data?.pages.flatMap(page => page.results) || []).map(item => [`${item.seriesId}:${item.date}:${item.chapter}`, item])).values()];
  return <section aria-label={t('discovery.mangaReleases')}>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {['all', 'manga', 'manhwa', 'manhua'].map(value => <Button key={value} size="sm" variant={type === value ? 'default' : 'outline'} aria-pressed={type === value} onClick={() => setType(value)}>{t(`discovery.${value}`)}</Button>)}
      <a href="https://www.mangaupdates.com/releases" target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">MangaUpdates <ExternalLink className="h-3.5 w-3.5" /></a>
    </div>
    <p className="mb-4 text-sm text-muted-foreground">{t('discovery.releaseNote')}</p>
    {feed.isPending ? <div className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)}</div>
      : !feed.isError && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => {
          const day = new Date(weekStart); day.setDate(day.getDate() + index);
          const dayItems = items.filter(item => item.date === localDate(day) && (type === 'all' || item.type === type));
          return <div key={index} className="min-w-0 space-y-2">
            <h2 className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold">{day.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}</h2>
            {dayItems.map(item => {
              const content = <><div className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">{item.poster ? <img src={item.poster} alt="" loading="lazy" className="h-full w-full object-cover" /> : <BookOpen className="h-4 w-4 text-muted-foreground" />}</div><div className="min-w-0"><p className="line-clamp-2 text-xs font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{t(`discovery.${item.type}`)}{item.chapter ? ` · ${t('discovery.chapter', { number: item.chapter })}` : ''}</p></div></>;
              const className = 'flex gap-2 rounded-xl border border-border bg-card p-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
              return item.href.startsWith('/') ? <Link key={item.id} to={item.href} className={className}>{content}</Link> : <a key={item.id} href={item.href} target="_blank" rel="noreferrer" className={className}>{content}<ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" /></a>;
            })}
            {!dayItems.length && <p className="px-3 py-4 text-xs text-muted-foreground">{t('discovery.noReleases')}</p>}
          </div>;
        })}
      </div>}
    <FeedStatus feed={feed} />
  </section>;
}
