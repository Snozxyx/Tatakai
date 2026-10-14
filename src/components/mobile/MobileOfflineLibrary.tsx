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
  const { jobs, legacyIssues, error, available, ready } = useNativeDownloadJobs();
  const { queue, cancelDownload, retryDownload } = useMobileDownload();
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<string>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const completed = jobs.filter((job) => job.status === 'completed' && job.animeName.toLowerCase().includes(search.toLowerCase()));
  const active = queue.filter((job) => job.status !== 'completed' && job.status !== 'cancelled');
  const remove = async (episodeId: string, title: string) => {
    if (!(await confirm({ title: `Delete ${title}?`, description: 'This removes the downloaded episode from this device.', destructive: true }))) return;
    setPending(episodeId);
    try { await deleteNativeDownload(episodeId); toast.success('Episode deleted'); }
    catch (failure) { toast.error(failure instanceof Error ? failure.message : 'Unable to delete episode'); }
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
      toast.error('No chapters downloaded');
      return;
    }
    const params = new URLSearchParams({ chapterKey: first.chapterKey, paragraph: '0', offline: 'true' });
    if (first.chapterNumber != null) params.set('chapterNumber', String(first.chapterNumber));
    if (first.chapterTitle) params.set('chapterTitle', first.chapterTitle);
    if (first.provider) params.set('provider', String(first.provider));
    navigate(`/novel/read/${encodeURIComponent(series.novelId)}?${params}`);
  };
  const deleteNovels = async (series: (typeof novelSeries)[number]) => {
    if (!(await confirm({ title: `Delete ${series.title}?`, description: 'This removes the downloaded chapters from this device.', destructive: true }))) return;
    try {
      await removeOfflineNovelSeries(series.anilistId);
      toast.success('Novel deleted');
    } catch {
      toast.error('Unable to delete novel');
    }
  };
  return (
    <Container className={embedded ? 'space-y-6' : 'mx-auto w-full max-w-3xl space-y-6 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))]'}>
      <div className="flex items-center justify-between gap-3">
        <div>{embedded ? <h2 className="text-lg font-semibold">Downloaded episodes</h2> : <h1 className="text-2xl font-semibold">Downloads</h1>}<p className="mt-1 text-sm text-muted-foreground">Your anime, ready to watch offline.</p></div>
        <Button variant="outline" size="icon" aria-label="Refresh downloads" onClick={() => void refreshNativeDownloads().catch((failure) => toast.error(String(failure)))}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {(!available || error) && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm">{error || 'Update the mobile app to enable native offline downloads.'}</p>}
      {legacyIssues.length > 0 && <section aria-label="Incomplete older downloads" className="space-y-3">
        {legacyIssues.map((issue) => <div key={issue.name} className="rounded-lg border border-border p-3">
          <p className="font-medium">{issue.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{issue.error}</p>
          <p className="mt-1 text-sm text-muted-foreground">Open the series and download this episode again. Your original files are preserved.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => navigate(issue.animeId ? `/anime/${encodeURIComponent(issue.animeId)}` : '/search')}>Find episode to retry</Button>
            <Button size="sm" variant="ghost" onClick={() => dismissLegacyDownloadIssue(issue.name)}>Dismiss</Button>
          </div>
        </div>)}
      </section>}
      {active.length > 0 && <section aria-label="Download queue" className="space-y-3">
        {active.map((job) => <div key={job.id} className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate font-medium">{job.animeTitle || job.title || 'Download'}</p><p className="text-xs text-muted-foreground">{job.subtitle} · {job.status === 'failed' ? job.error : `${job.status} ${Math.round(job.progress || 0)}%`}</p></div>
            {job.status === 'failed' ? <Button variant="outline" size="sm" onClick={() => retryDownload(job.id)}>Retry</Button> : <Button variant="ghost" size="icon" aria-label="Cancel download" onClick={() => cancelDownload(job.id)}><X className="h-4 w-4" /></Button>}
          </div>
          {job.status !== 'failed' && <progress className="mt-3 h-1.5 w-full accent-primary" max={100} value={job.progress || 0} aria-label="Download progress" />}
        </div>)}
      </section>}
      <label className="block"><span className="sr-only">Search downloaded anime</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search downloaded anime" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" /></label>
      <section data-mobile-poster-grid className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-label="Offline episodes">
        {completed.map((job) => <article key={job.episodeId} data-mobile-poster-card className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <button className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Watch ${job.animeName}, episode ${job.episodeNumber}`} onClick={() => {
            const params = new URLSearchParams({ offline: 'true', mobilePath: `native-offline://${encodeURIComponent(job.episodeId)}`, title: job.animeName, episode: String(job.episodeNumber) });
            navigate(`/watch/${encodeURIComponent(job.episodeId)}?${params}`);
          }}>
            <div data-mobile-poster-image className="relative aspect-[2/3] bg-muted">
              <img src={job.posterUrl || '/placeholder.svg'} alt="" loading="lazy" className="h-full w-full object-cover" onError={(event) => { if (!event.currentTarget.src.endsWith('/placeholder.svg')) event.currentTarget.src = '/placeholder.svg'; }} />
              <span className="absolute bottom-2 right-2 rounded-full bg-black/70 p-2 text-white"><Play className="h-4 w-4" /></span>
            </div>
            <div className="p-3"><h2 data-mobile-poster-title className="line-clamp-2 text-sm font-semibold">{job.animeName}</h2><p className="mt-1 text-xs text-muted-foreground">Episode {job.episodeNumber}</p></div>
          </button>
          <Button className="mb-2 ml-2" size="sm" variant="ghost" disabled={pending === job.episodeId} onClick={() => void remove(job.episodeId, `${job.animeName}, episode ${job.episodeNumber}`)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
        </article>)}
      </section>
      {!completed.length && novelSeries.length === 0 && <div className="py-10 text-center text-muted-foreground"><Download className="mx-auto mb-3 h-8 w-8" /><p>{available && !ready ? 'Loading your downloads…' : search ? 'No downloaded episodes match your search.' : 'Download an episode from the player to watch it here.'}</p></div>}
      {novelSeries.length > 0 && (
        <section aria-label="Offline novels" className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpen className="h-4 w-4" /> Downloaded novels</h2>
          <div data-mobile-poster-grid className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-label="Offline novels">
            {novelSeries.map((series) => (
              <article key={`novel-${series.anilistId}`} data-mobile-poster-card className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
                <button className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Read ${series.title} offline`} onClick={() => openNovel(series)}>
                  <div data-mobile-poster-image className="relative aspect-[2/3] bg-muted">
                    <img src={series.poster || '/placeholder.svg'} alt="" loading="lazy" className="h-full w-full object-cover" onError={(event) => { if (!event.currentTarget.src.endsWith('/placeholder.svg')) event.currentTarget.src = '/placeholder.svg'; }} />
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/70 p-2 text-white"><BookOpen className="h-4 w-4" /></span>
                  </div>
                  <div className="p-3"><h2 data-mobile-poster-title className="line-clamp-2 text-sm font-semibold">{series.title}</h2><p className="mt-1 text-xs text-muted-foreground">{series.chapters.length} {series.chapters.length === 1 ? 'chapter' : 'chapters'} · Offline</p></div>
                </button>
                <Button className="mb-2 ml-2" size="sm" variant="ghost" onClick={() => void deleteNovels(series)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
              </article>
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}
