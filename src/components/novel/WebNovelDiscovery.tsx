import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';
import { searchWebNovels } from '@/core/content/novel-client';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { HomeSectionHeading } from '@/components/home/HomeSectionHeading';
import { UnifiedMediaCard } from '@/components/UnifiedMediaCard';
import { CardSkeleton } from '@/components/ui/skeleton-custom';
import { Button } from '@/components/ui/button';

export function WebNovelDiscovery() {
  const { t } = useTranslation();
  const { settings } = useContentSafetySettings();
  const feed = useQuery({ queryKey: ['web-novel-discovery', settings.showAdultEverywhere],
    queryFn: () => searchWebNovels('', 1, 18, { adult: settings.showAdultEverywhere }), staleTime: 10 * 60_000, retry: false });
  return <section className="mb-12" aria-label={t('discovery.webNovels')}>
    <HomeSectionHeading icon={<BookOpen className="h-5 w-5 text-primary" />} title={t('discovery.webNovels')}
      subtitle={t('discovery.webNovelSubtitle')} viewAllTo="/search?type=novel&novelTagSource=mangabaka" />
    <div data-mobile-home-rail className="flex gap-4 overflow-x-auto pb-4">
      {feed.isPending ? Array.from({ length: 6 }, (_, index) => <div key={index} className="media-card-rail-item"><CardSkeleton /></div>)
        : feed.data?.results.map(item => <div key={item.id} className="media-card-rail-item"><UnifiedMediaCard item={{ id: item.id!, name: item.canonicalTitle, poster: item.poster || '', mediaType: 'novel', type: 'novel', anilistId: item.anilistId, malId: item.malId, isAdult: item.adult }} /></div>)}
    </div>
    {feed.isError && <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground"><span>{t('discovery.catalogError')}</span><Button variant="outline" size="sm" onClick={() => void feed.refetch()}>{t('discovery.retry')}</Button></div>}
  </section>;
}
