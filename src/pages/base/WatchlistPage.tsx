import { useHistoryPreference } from '@/hooks/ui/useHistoryPreference';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWatchlist } from '@/hooks/user/useWatchlist';
import { useMangaReadlist } from '@/hooks/user/useMangaReadlist';
import { useScrollRestoration } from '@/hooks/ui/useScrollRestoration';
import { WatchlistTab } from '@/components/profile/tabs/WatchlistTab';
import { MangaReadlistTab } from '@/components/profile/tabs/MangaReadlistTab';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ThemedSelect } from '@/components/ui/themed-select';
export default function WatchlistPage() {
  const { t } = useTranslation(); const navigate = useNavigate();
  const anime = useWatchlist(); const manga = useMangaReadlist();
  const [tab, setTab] = useHistoryPreference('tab', 'anime');
  const [status, setStatus] = useHistoryPreference('status', 'all');
  useScrollRestoration('watchlist', { useWindow: true, ready: !anime.isPending && !manga.isPending });
  const filter = <T extends { status: string }>(items: T[]) => status === 'all' ? items : items.filter(item => status === 'current' ? ['watching','reading'].includes(item.status) : status === 'planned' ? ['plan_to_watch','plan_to_read'].includes(item.status) : item.status === status);
  return <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-8"><h1 className="text-3xl font-bold">{t('feedback.library')}</h1>
    {(anime.isError || manga.isError) && <p role="alert">{t('feedback.libraryError')}</p>}
    <ThemedSelect aria-label={t('feedback.filterStatus')} value={status} onChange={e => setStatus(e.target.value)}>{['all','current','planned','completed','on_hold','dropped'].map(value => <option key={value} value={value}>{t(`feedback.status.${value}`)}</option>)}</ThemedSelect>
    <Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="anime">{t('feedback.anime')}</TabsTrigger><TabsTrigger value="manga">{t('feedback.mangaManhwa')}</TabsTrigger></TabsList>
      <TabsContent value="anime"><WatchlistTab watchlist={filter(anime.data || [])} loading={anime.isPending} onNavigate={navigate}/></TabsContent>
      <TabsContent value="manga"><MangaReadlistTab mangaReadlist={filter(manga.data || [])} loading={manga.isPending} onNavigate={navigate}/></TabsContent>
    </Tabs>
  </div>;
}
