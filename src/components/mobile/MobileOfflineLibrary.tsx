import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Download, Play, RefreshCw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useMobileDownload } from '@/hooks/media/useMobileDownload';
import { useNativeDownloadJobs, deleteNativeDownload, refreshNativeDownloads, dismissLegacyDownloadIssue } from '@/core/download/mobile/nativeDownloads';
import { observeOfflineNovels, removeOfflineNovelSeries } from '@/core/download/novelOffline';
import type { OfflineNovel } from '@/core/db/tatakai-db';

export function MobileOfflineLibrary({ embedded = false }: { embedded?: boolean }) {
  useUiTranslation();
  const { jobs, legacyIssues, error, available, ready } = useNativeDownloadJobs();
  const { queue, cancelDownload, retryDownload } = useMobileDownload();
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<string>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const completed = jobs.filter((job) => job.status === 'completed' && job.animeName.toLowerCase().includes(search.toLowerCase()));
  const active = queue.filter((job) => job.status !== 'completed' && job.status !== 'cancelled');
  const remove = async (episodeId: string, title: string) => {
    if (!(await confirm({ get title() { return uiI18n.t('app.delete_i18n_value_0_1260b649', { value0: title }); }, get description() { return uiI18n.t('app.this_removes_the_downloaded_episode_from_this_de_d009b8f3'); }, destructive: true }))) return;
    setPending(episodeId);
    try { await deleteNativeDownload(episodeId); toast.success(uiI18n.t('app.episode_deleted_626c3697')); }
    catch (failure) { toast.error(failure instanceof Error ? failure.message : uiI18n.t('app.unable_to_delete_episode_0a47ecb5')); }
    finally { setPending(undefined); }
  };
  const Container = embedded ? 'div' : 'main';
  const [novelRows, setNovelRows] = useState<OfflineNovel[]>([]);
  useEffect(() => observeOfflineNovels(setNovelRows), []);
  const novelSeries = useMemo(() => {
    const byId = new Map<number, { anilistId: number; novelId: string; title: string; poster: string | null; chapters: OfflineNovel[] }>();
    for (const row of novelRows) {
      if (!row.title.toLowerCase().includes(search.toLowerCase())) continue;
      const existing = byId.get(row.anilistId) ?? {
        anilistId: row.anilistId,
        novelId: row.novelId,
        title: row.title,
        poster: row.posterUrl ?? null,
        chapters: [] as OfflineNovel[],
      };
      existing.chapters.push(row);
      if (!existing.poster && row.posterUrl) existing.poster = row.posterUrl;
      byId.set(row.anilistId, existing);
    }
    return [...byId.values()];
  }, [novelRows, search]);
  const openNovel = (series: (typeof novelSeries)[number]) => {
    const first = [...series.chapters].sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0))[0];
    if (!first) {
      toast.error(uiI18n.t('app.no_chapters_downloaded_b72dc2b8'));
      return;
    }
    const params = new URLSearchParams({ chapterKey: first.chapterKey, paragraph: '0', offline: 'true' });
    if (first.chapterNumber != null) params.set('chapterNumber', String(first.chapterNumber));
    if (first.chapterTitle) params.set('chapterTitle', first.chapterTitle);
    if (first.provider) params.set('provider', String(first.provider));
    navigate(`/novel/read/${encodeURIComponent(series.novelId)}?${params}`);
  };
  const deleteNovels = async (series: (typeof novelSeries)[number]) => {
    if (!(await confirm({ get title() { return uiI18n.t('app.delete_i18n_value_0_1260b649', { value0: series.title }); }, get description() { return uiI18n.t('app.this_removes_the_downloaded_chapters_from_this_d_b5148892'); }, destructive: true }))) return;
    try {
      await removeOfflineNovelSeries(series.anilistId);
      toast.success(uiI18n.t('app.novel_deleted_ce46e34c'));
    } catch {
      toast.error(uiI18n.t('app.unable_to_delete_novel_c3efa271'));
    }
  };
  return (
    <Container className={embedded ? 'space-y-6' : 'mx-auto w-full max-w-3xl space-y-6 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))]'}>
      <div className="flex items-center justify-between gap-3">
        <div>{embedded ? <h2 className="text-lg font-semibold">{uiI18n.t('app.downloaded_episodes_45701653')}</h2> : <h1 className="text-2xl font-semibold">{uiI18n.t('app.downloads_a862c2b2')}</h1>}<p className="mt-1 text-sm text-muted-foreground">{uiI18n.t('app.your_anime_ready_to_watch_offline_b7205fc5')}</p></div>
        <Button variant="outline" size="icon" aria-label={uiI18n.t('app.refresh_downloads_ba47acdb')} onClick={() => void refreshNativeDownloads().catch((failure) => toast.error(String(failure)))}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {(!available || error) && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm">{error || uiI18n.t('app.update_the_mobile_app_to_enable_native_offline_d_9bfe38f1')}</p>}
      {legacyIssues.length > 0 && <section aria-label={uiI18n.t('app.incomplete_older_downloads_9aad2e58')} className="space-y-3">
        {legacyIssues.map((issue) => <div key={issue.name} className="rounded-lg border border-border p-3">
          <p className="font-medium">{issue.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{issue.error}</p>
          <p className="mt-1 text-sm text-muted-foreground">{uiI18n.t('app.open_the_series_and_download_this_episode_again__c0e3b382')}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => navigate(issue.animeId ? `/anime/${encodeURIComponent(issue.animeId)}` : '/search')}>{uiI18n.t('app.find_episode_to_retry_bc345ef5')}</Button>
            <Button size="sm" variant="ghost" onClick={() => dismissLegacyDownloadIssue(issue.name)}>{uiI18n.t('app.dismiss_70afe9ef')}</Button>
          </div>
        </div>)}
      </section>}
      {active.length > 0 && <section aria-label={uiI18n.t('app.download_queue_3f97a878')} className="space-y-3">
        {active.map((job) => <div key={job.id} className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate font-medium">{job.animeTitle || job.title || uiI18n.t('app.download_a479c9c3')}</p><p className="text-xs text-muted-foreground">{job.subtitle} · {job.status === 'failed' ? job.error : uiI18n.t('app.i18n_value_0_i18n_value_1_6ef38cb5', { value0: job.status, value1: Math.round(job.progress || 0) })}</p></div>
            {job.status === 'failed' ? <Button variant="outline" size="sm" onClick={() => retryDownload(job.id)}>{uiI18n.t('app.retry_9f5cd8a2')}</Button> : <Button variant="ghost" size="icon" aria-label={uiI18n.t('app.cancel_download_67bb11d0')} onClick={() => cancelDownload(job.id)}><X className="h-4 w-4" /></Button>}
          </div>
          {job.status !== 'failed' && <progress className="mt-3 h-1.5 w-full accent-primary" max={100} value={job.progress || 0} aria-label={uiI18n.t('app.download_progress_9c8fe84b')} />}
        </div>)}
      </section>}
      <label className="block"><span className="sr-only">{uiI18n.t('app.search_downloaded_anime_eac9476e')}</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={uiI18n.t('app.search_downloaded_anime_eac9476e')} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" /></label>
      <section data-mobile-poster-grid className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-label={uiI18n.t('app.offline_episodes_75ff6d74')}>
        {completed.map((job) => <article key={job.episodeId} data-mobile-poster-card className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <button className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" aria-label={uiI18n.t('app.watch_i18n_value_0_episode_i18n_value_1_35a4b0d1', { value0: job.animeName, value1: job.episodeNumber })} onClick={() => {
            const params = new URLSearchParams({ offline: 'true', mobilePath: `native-offline://${encodeURIComponent(job.episodeId)}`, title: job.animeName, episode: String(job.episodeNumber) });
            navigate(`/watch/${encodeURIComponent(job.episodeId)}?${params}`);
          }}>
            <div data-mobile-poster-image className="relative aspect-[2/3] bg-muted">
              <img src={job.posterUrl || '/placeholder.svg'} alt="" loading="lazy" className="h-full w-full object-cover" onError={(event) => { if (!event.currentTarget.src.endsWith('/placeholder.svg')) event.currentTarget.src = '/placeholder.svg'; }} />
              <span className="absolute bottom-2 right-2 rounded-full bg-black/70 p-2 text-white"><Play className="h-4 w-4" /></span>
            </div>
            <div className="p-3"><h2 data-mobile-poster-title className="line-clamp-2 text-sm font-semibold">{job.animeName}</h2><p className="mt-1 text-xs text-muted-foreground">{uiI18n.t('app.episode_8669aa56')} {job.episodeNumber}</p></div>
          </button>
          <Button className="mb-2 ml-2" size="sm" variant="ghost" disabled={pending === job.episodeId} onClick={() => void remove(job.episodeId, `${job.animeName}, episode ${job.episodeNumber}`)}><Trash2 className="mr-2 h-4 w-4" />{uiI18n.t('app.delete_f6fdbe48')}</Button>
        </article>)}
      </section>
      {!completed.length && novelSeries.length === 0 && <div className="py-10 text-center text-muted-foreground"><Download className="mx-auto mb-3 h-8 w-8" /><p>{available && !ready ? uiI18n.t('app.loading_your_downloads_592c2cc7') : search ? uiI18n.t('app.no_downloaded_episodes_match_your_search_25123f3e') : uiI18n.t('app.download_an_episode_from_the_player_to_watch_it__9d91f1c5')}</p></div>}
      {novelSeries.length > 0 && (
        <section aria-label={uiI18n.t('app.offline_novels_def7bc78')} className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpen className="h-4 w-4" /> {uiI18n.t('app.downloaded_novels_3ef3c9ad')}</h2>
          <div data-mobile-poster-grid className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-label={uiI18n.t('app.offline_novels_def7bc78')}>
            {novelSeries.map((series) => (
              <article key={`novel-${series.anilistId}`} data-mobile-poster-card className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
                <button className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" aria-label={uiI18n.t('app.read_i18n_value_0_offline_2d64b7b0', { value0: series.title })} onClick={() => openNovel(series)}>
                  <div data-mobile-poster-image className="relative aspect-[2/3] bg-muted">
                    <img src={series.poster || '/placeholder.svg'} alt="" loading="lazy" className="h-full w-full object-cover" onError={(event) => { if (!event.currentTarget.src.endsWith('/placeholder.svg')) event.currentTarget.src = '/placeholder.svg'; }} />
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/70 p-2 text-white"><BookOpen className="h-4 w-4" /></span>
                  </div>
                  <div className="p-3"><h2 data-mobile-poster-title className="line-clamp-2 text-sm font-semibold">{series.title}</h2><p className="mt-1 text-xs text-muted-foreground">{series.chapters.length} {series.chapters.length === 1 ? uiI18n.t('app.chapter_09d4c7f1') : uiI18n.t('app.chapters_1fb03542')} {uiI18n.t('app.offline_88d9f333')}</p></div>
                </button>
                <Button className="mb-2 ml-2" size="sm" variant="ghost" onClick={() => void deleteNovels(series)}><Trash2 className="mr-2 h-4 w-4" />{uiI18n.t('app.delete_f6fdbe48')}</Button>
              </article>
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}
