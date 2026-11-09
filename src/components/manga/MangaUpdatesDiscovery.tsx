import { cachedCalendarFeed } from '@/lib/calendarFeedCache';
import { releaseMangaHref } from '@/lib/releaseNavigation';
import { deduplicateReleases } from '@/lib/calendarReleases';
import { useEffect, useState } from 'react';
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
import { CalendarDateHeaders } from '@/components/calendar/CalendarDateHeaders';
import { CalendarArtwork, CalendarReleasePreview } from '@/components/calendar/CalendarReleasePreview';
import { calendarDateKey, calendarDay } from '@/lib/calendarDates';

export interface UpdatesEntry {
  id: string; seriesId: string; title: string; poster: string | null;
  bannerImage?: string | null;
  provider?: string; canonicalSeriesId?: string | null; releaseKind?: string; volume?: string | null; region?: string | null;
  type: string; adult?: boolean; href: string; chapter: string | null; date: string | null;
}
interface Feed { results: UpdatesEntry[]; page: number; hasNextPage: boolean; partial: boolean; stale?: boolean; dayIndex?: number }
export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function useUpdates(kind: 'new' | 'releases', weekStart?: Date, provider = 'mangaupdates', initialDay = 0) {
  const { settings } = useContentSafetySettings();
  const start = weekStart ? localDate(weekStart) : '';
  const endDate = weekStart ? new Date(weekStart) : null;
  endDate?.setDate(endDate.getDate() + 6);
  const end = endDate ? localDate(endDate) : '';
  return useInfiniteQuery({
    queryKey: ['mangaupdates-feed', kind, start, end, provider, settings.showAdultEverywhere],
    initialPageParam: { day: initialDay, page: 1 },
    queryFn: async ({ pageParam, signal }): Promise<Feed> => {
      const daily = kind === 'releases' && provider === 'mangaupdates' && weekStart;
      const date = daily ? new Date(weekStart) : null;
      date?.setDate(date.getDate() + pageParam.day);
      const day = date ? localDate(date) : null;
      const params = new URLSearchParams({ kind, start: day || start, end: day || end, provider, page: String(pageParam.page), adult: settings.showAdultEverywhere ? '1' : '0' });
      return cachedCalendarFeed(params.toString(), async () => {
        const response = await fetch(`${resolveBackendOrigin()}/api/proxy/mangaupdates-feed?${params}`, { signal });
        if (!response.ok) throw new Error('MangaUpdates unavailable');
        const result = await response.json();
        return { ...result, dayIndex: pageParam.day } as Feed;
      });
    },
    getNextPageParam: (last, pages) => {
      if (kind !== 'releases' || provider !== 'mangaupdates' || !weekStart) return last.hasNextPage ? { day: 0, page: last.page + 1 } : undefined;
      const days = Array.from({ length:7 }, (_, day) => ({ day, latest: pages.filter(page => page.dayIndex === day).slice(-1)[0] }));
      const missing = days.find(day => !day.latest);
      if (missing) return { day: missing.day, page: 1 };
      const next = days.filter(day => day.latest?.hasNextPage).sort((a,b) => a.latest!.page - b.latest!.page)[0];
      return next ? { day: next.day, page: next.latest!.page + 1 } : undefined;
    },
    staleTime: 5 * 60_000, gcTime: 30 * 60_000, retry: false,
  });
}
function FeedStatus({ feed }: { feed: ReturnType<typeof useUpdates> }) {
  const { t } = useTranslation();
  return <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground" role="status">
    {feed.isError && <><span>{t('discovery.feedError')}</span><Button variant="outline" size="sm" onClick={() => void feed.refetch()}>{t('discovery.retry')}</Button></>}
    {feed.data?.pages.some(page => page.stale) && <span>{t('calendarView.cached')}</span>}
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
        : items.map(item => <div key={item.seriesId} className="media-card-rail-item"><UnifiedMediaCard item={{ id: item.seriesId, name: item.title, poster: item.poster || '', mediaType: 'manga', type: item.type, isAdult: item.adult, href: releaseMangaHref(item) }} /></div>)}
    </div>
    {!feed.isPending && !feed.isError && !items.length && <p className="text-sm text-muted-foreground">{t('discovery.noNew')}</p>}
    <FeedStatus feed={feed} />
  </section>;
}
export function MangaReleaseCalendar({ weekStart, selectedDay, onSelectDate }: {
  weekStart: Date; selectedDay?: number; onSelectDate?: (date: Date) => void;
}) {
  const { t, i18n } = useTranslation();
  const feed = useUpdates('releases', weekStart, 'mangaupdates', selectedDay ?? 0);
  const otaku = useUpdates('releases', weekStart, 'otakucalendar');
  const { hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } = feed;
  useEffect(() => {
    if (hasNextPage && !isFetching && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetching, isFetchNextPageError, fetchNextPage]);
  const [type, setType] = useState('all');
  const items = deduplicateReleases([...(feed.data?.pages.flatMap(page => page.results) || []), ...(otaku.data?.pages.flatMap(page => page.results) || [])]);
  const visibleDays = selectedDay == null ? Array.from({ length: 7 }, (_, index) => index) : [selectedDay];
  const metadata = (item: UpdatesEntry) => [
    t(`discovery.${item.type}`),
    item.chapter ? t('discovery.chapter', { number: item.chapter }) : item.volume ? `Vol. ${item.volume}` : null,
    item.provider === 'otakucalendar' ? 'OtakuCalendar' : 'MangaUpdates', item.region,
  ].filter(Boolean).join(' · ');
  return <section className="calendar-manga-calendar" aria-label={t('discovery.mangaReleases')}>
    <div className="calendar-manga-controls">
      {['all', 'manga', 'manhwa', 'manhua'].map(value => <Button key={value} size="sm" variant={type === value ? 'default' : 'outline'} aria-pressed={type === value} onClick={() => setType(value)}>{t(`discovery.${value}`)}</Button>)}
      <a href="https://www.mangaupdates.com/releases" target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">MangaUpdates <ExternalLink className="h-3.5 w-3.5" /></a>
    </div>
    <p className="calendar-release-note">{t('calendarView.releaseDateOnly')}</p>
    <div className="calendar-timeline-scroll calendar-manga-scroll" tabIndex={0} aria-busy={feed.isPending && otaku.isPending}>
      <CalendarDateHeaders weekStart={weekStart} days={visibleDays} todayKey={calendarDateKey(new Date())}
        label={t('calendarView.releases')} onSelect={onSelectDate} />
      <div className={`calendar-manga-columns ${visibleDays.length === 7 ? 'calendar-week' : ''}`}
        style={{ gridTemplateColumns: `64px repeat(${visibleDays.length}, minmax(0, 1fr))` }}>
        <div className="calendar-manga-gutter"><BookOpen aria-hidden="true" /></div>
        {visibleDays.map(index => {
          const day = calendarDay(weekStart, index);
          const dayItems = items.filter(item => item.date === localDate(day) && (type === 'all' || item.type === type));
          return <div key={index} className={`calendar-manga-day ${visibleDays.length === 1 ? 'calendar-manga-day-single' : ''}`}>
            {dayItems.map(item => <CalendarReleasePreview key={item.id} trigger={
              <button type="button" className="calendar-manga-event" aria-label={`${item.title}, ${metadata(item)}`}>
                <CalendarArtwork src={item.bannerImage || item.poster} />
                <span className="calendar-event-title">{item.title}</span>
                <span className="calendar-event-meta">{item.chapter ? t('discovery.chapter', { number: item.chapter }) : item.volume ? `Vol. ${item.volume}` : t(`discovery.${item.type}`)}</span>
                <span className="calendar-event-detail">{item.region || (item.provider === 'otakucalendar' ? 'OtakuCalendar' : 'MangaUpdates')}</span>
              </button>
            }>
              <div className="calendar-preview-banner">
                <CalendarArtwork src={item.bannerImage || item.poster} />
                <span>{day.toLocaleDateString(i18n.language, { dateStyle: 'full' })}</span>
              </div>
              <div className="calendar-preview-body">
                <h3>{item.title}</h3>
                <p className="calendar-preview-meta">{metadata(item)}</p>
                <p className="calendar-preview-meta">{t('calendarView.releaseDateOnly')}</p>
                <Link className="calendar-preview-action" to={releaseMangaHref(item)}>{t('calendarView.openRelease')} <ExternalLink className="size-4" aria-hidden="true" /></Link>
              </div>
            </CalendarReleasePreview>)}
            {!dayItems.length && <p className="calendar-manga-empty">{t(feed.hasNextPage || feed.isFetching || otaku.isPending ? 'discovery.loading' : feed.isError || otaku.isError ? 'discovery.partial' : 'discovery.noReleases')}</p>}
          </div>;
        })}
      </div>
      <div className="calendar-manga-feed-status">
        <div aria-label="MangaUpdates"><FeedStatus feed={feed} /></div>
        <div aria-label="OtakuCalendar"><span className="text-xs text-muted-foreground">OtakuCalendar</span><FeedStatus feed={otaku} /></div>
      </div>
    </div>
  </section>;
}
