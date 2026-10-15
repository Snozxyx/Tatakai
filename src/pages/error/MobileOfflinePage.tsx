import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
/**
 * Mobile Offline Library Page — downloads hub for the native app.
 *
 * Sections (all live):
 *  - Active downloads: anime + manga rows with real-time progress + cancel.
 *  - Downloaded manga: persisted Dexie offline chapters (survive restarts) with
 *    offline read + delete.
 *  - Downloaded anime: completed history from the download-history service.
 *  - Failed this session: terminal failures with retry guidance.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  Loader2, Download, Trash2, Play, HardDrive, FolderOpen, BookOpen,
  CheckCircle2, XCircle, X, FileVideo, ChevronDown, RotateCw, Sparkles,
} from 'lucide-react';
import { useMobileDownload, type MobileDownloadQueueItem } from '@/hooks/media/useMobileDownload';
import { toast } from 'sonner';
import { db, type DownloadHistoryEntry, type OfflineChapter } from '@/core/db/tatakai-db';
import { getHistoryByStatus } from '@/core/download/download-history-service';
import { peekAutoDownloadNext } from '@/core/download/mobile/autoDownloadNext';
import { evictWatchedAnime } from '@/core/download/mobile/storageManager';
import { triggerHaptic } from '@/lib/haptics';
import { getMobileOfflineEpisodeId } from '@/core/download/mobile/offlineEpisodeId';

function formatBytes(bytes?: number | null): string {
  const v = Number(bytes || 0);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v < 1024) return `${v} B`;
  const kb = v / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(uiI18n.language);
  } catch {
    return '';
  }
}

function ActiveRow({ item, onCancel }: { item: MobileDownloadQueueItem; onCancel: (id: string) => void }) {
  useUiTranslation();
  const pct = Math.max(0, Math.min(100, Math.round(item.progress ?? 0)));
  const sub =
    item.kind === 'manga'
      ? (item.subtitle || 'Chapter')
      : (item.subtitle || (item.episode != null ? `Episode ${item.episode}` : 'Episode'));
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      {item.posterUrl ? (
        <img src={item.posterUrl} alt="" className="h-14 w-10 shrink-0 rounded-lg object-cover" />
      ) : item.kind === 'manga' ? (
        <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10"><BookOpen className="w-5 h-5 text-primary" /></span>
      ) : (
        <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10"><FileVideo className="w-5 h-5 text-primary" /></span>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{item.animeTitle || item.title || uiI18n.t('app.download_a479c9c3')}</p>
        <p className="text-xs text-muted-foreground truncate">{sub}</p>
        <div className="mt-1.5 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-[width]" style={{ width: `${item.status === 'queued' ? 2 : pct}%` }} />
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
          {item.status === 'queued' ? uiI18n.t('app.waiting_3650b57a') : uiI18n.t('app.i18n_value_0_cac4fa79', { value0: pct })}
        </p>
      </div>
      <Button size="sm" variant="ghost" className="h-10 w-10 p-0 shrink-0" onClick={() => { void triggerHaptic('warning'); onCancel(item.id); }} aria-label={uiI18n.t('app.cancel_download_67bb11d0')}>
        <X className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );
}

function seriesKey(id: number, title: string): string {
  return id > 0 ? String(id) : title.trim().toLowerCase();
}

export default function MobileOfflinePage() {
  useUiTranslation();
  const navigate = useNavigate();
  const { isNative, queue, activeDownloads, cancelDownload, retryDownload } = useMobileDownload();
  const [freeingWatched, setFreeingWatched] = useState(false);
  // One-shot auto-download-next intent (armed when an episode finishes).
  // Plain render read (cheap localStorage JSON parse) — no hook, so it stays
  // above the `!isNative` early return and always reflects the latest intent.
  let upNext: ReturnType<typeof peekAutoDownloadNext> = null;
  try {
    upNext = peekAutoDownloadNext();
  } catch {
    upNext = null;
  }
  const [mangaChapters, setMangaChapters] = useState<OfflineChapter[]>([]);
  const [animeHistory, setAnimeHistory] = useState<DownloadHistoryEntry[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [deleteMangaTarget, setDeleteMangaTarget] = useState<OfflineChapter | null>(null);
  const [deleteAnimeTarget, setDeleteAnimeTarget] = useState<DownloadHistoryEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'anime' | 'manga'>('all');

  const mangaGroups = useMemo(() => {
    const groups = new Map<string, { key: string; title: string; posterUrl?: string | null; items: OfflineChapter[] }>();
    for (const chapter of mangaChapters) {
      const key = seriesKey(chapter.anilistId, chapter.title);
      const group = groups.get(key) || { key, title: chapter.title, posterUrl: chapter.posterUrl, items: [] };
      group.posterUrl ||= chapter.posterUrl;
      group.items.push(chapter);
      groups.set(key, group);
    }
    return [...groups.values()].map((group) => ({
      ...group,
      items: group.items.sort((a, b) => (a.chapterNumber ?? Number.MAX_SAFE_INTEGER) - (b.chapterNumber ?? Number.MAX_SAFE_INTEGER)),
    }));
  }, [mangaChapters]);

  const animeGroups = useMemo(() => {
    const groups = new Map<string, { key: string; title: string; posterUrl?: string; items: DownloadHistoryEntry[] }>();
    for (const episode of animeHistory) {
      const key = seriesKey(episode.animeId, episode.animeTitle);
      const group = groups.get(key) || { key, title: episode.animeTitle, posterUrl: episode.posterUrl, items: [] };
      group.posterUrl ||= episode.posterUrl;
      if (!group.items.some((item) => item.episodeNumber === episode.episodeNumber)) group.items.push(episode);
      groups.set(key, group);
    }
    return [...groups.values()].map((group) => ({
      ...group,
      items: group.items.sort((a, b) => a.episodeNumber - b.episodeNumber),
    }));
  }, [animeHistory]);

  const libraryStats = useMemo(() => ({
    titles: mangaGroups.length + animeGroups.length,
    items: mangaChapters.length + animeHistory.length,
    bytes:
      mangaChapters.reduce((sum, item) => sum + (item.sizeBytes || 0), 0) +
      animeHistory.reduce((sum, item) => sum + (item.fileSizeBytes || 0), 0),
  }), [animeGroups.length, animeHistory, mangaChapters, mangaGroups.length]);

  const refreshLists = useCallback(async () => {
    try {
      const [chapters, history] = await Promise.all([
        db.offlineChapters.orderBy('downloadedAt').reverse().toArray().catch(() => [] as OfflineChapter[]),
        getHistoryByStatus('completed', 50).catch(() => [] as DownloadHistoryEntry[]),
      ]);
      setMangaChapters(chapters);
      setAnimeHistory(history);
    } finally {
      setLoadingLists(false);
    }
  }, []);

  useEffect(() => {
    if (isNative) void refreshLists();
  }, [isNative, refreshLists]);

  // Completion persistence is asynchronous (history/offline chapter Dexie
  // writes happen just after the monitor flips to completed). Refresh shortly
  // after a terminal transition so an active row moves into Anime/Manga without
  // requiring the user to leave and reopen the page.
  useEffect(() => {
    if (!isNative || !queue.some((item) => item.status === 'completed')) return;
    const timer = window.setTimeout(() => void refreshLists(), 300);
    return () => window.clearTimeout(timer);
  }, [isNative, queue, refreshLists]);

  if (!isNative) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <GlassPanel className="p-8 text-center max-w-md">
          <HardDrive className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">{uiI18n.t('app.mobile_only_3d4144d9')}</h2>
          <p className="text-muted-foreground mb-4">{uiI18n.t('app.downloads_are_only_available_in_the_mobile_app_fe8dce5a')}</p>
          <Button onClick={() => navigate('/')}>{uiI18n.t('app.go_home_19445d72')}</Button>
        </GlassPanel>
      </div>
    );
  }

  const failedItems = queue.filter((q) => q.status === 'failed');
  const hasAnything =
    activeDownloads.length > 0 || mangaChapters.length > 0 || animeHistory.length > 0 || failedItems.length > 0 || !!upNext;

  const handleFreeWatched = async () => {
    setFreeingWatched(true);
    try {
      const removed = await evictWatchedAnime();
      if (removed > 0) {
        void triggerHaptic('success');
        toast.success(uiI18n.t('app.freed_i18n_value_0_watched_itemi18n_value_1_2ae19113', { value0: removed, value1: removed > 1 ? 's' : '' }));
        await refreshLists();
      } else {
        toast.info(uiI18n.t('app.nothing_to_free_0ba8374b'), { get description() { return uiI18n.t('app.no_watched_downloads_found_or_auto_evict_is_off__bffe8865'); } });
      }
    } catch {
      void triggerHaptic('error');
      toast.error(uiI18n.t('app.could_not_free_storage_bbf1f284'));
    } finally {
      setFreeingWatched(false);
    }
  };

  const handleReadManga = (ch: OfflineChapter) => {
    void triggerHaptic('tap');
    const params = new URLSearchParams();
    params.set('chapterKey', ch.chapterKey);
    if (ch.chapterNumber != null) params.set('chapterNumber', String(ch.chapterNumber));
    params.set('offline', 'true');
    navigate(`/manga/read/${ch.anilistId}?${params.toString()}`);
  };

  const handlePlayAnime = (entry: DownloadHistoryEntry) => {
    const localPath = String(entry.localPath || '').trim();
    if (!localPath) {
      void triggerHaptic('error');
      toast.error(uiI18n.t('app.this_download_has_no_playable_local_file_33e9a8e2'));
      return;
    }
    // Rows written before the size-floor validation (e.g. a few-hundred-byte
    // block page saved as video) can never play — say so instead of opening
    // the player into "Error loading video".
    if (entry.fileSizeBytes != null && entry.fileSizeBytes < 64 * 1024 && !/^torrent-session:\/\//i.test(localPath)) {
      void triggerHaptic('error');
      toast.error(uiI18n.t('app.this_file_is_broken_too_small_to_be_video_0fea618c'), {
        get description() { return uiI18n.t('app.delete_it_and_download_the_episode_again_95334846'); },
      });
      return;
    }

    void triggerHaptic('navigate');
    const params = new URLSearchParams({
      offline: 'true',
      mobilePath: localPath,
      title: entry.animeTitle,
      episode: String(entry.episodeNumber),
    });
    if (entry.episodeName) params.set('episodeTitle', entry.episodeName);
    if (entry.posterUrl) params.set('poster', entry.posterUrl);

    const torrentSession = localPath.match(/^torrent-session:\/\/(.+)$/i)?.[1];
    if (torrentSession) params.set('sessionId', torrentSession);

    const offlineEpisodeId = getMobileOfflineEpisodeId(
      localPath, entry.episodeId || `mobile-${entry.animeId}?ep=${entry.episodeNumber}`,
    );
    navigate(`/watch/${encodeURIComponent(offlineEpisodeId)}?${params.toString()}`);
  };

  const handleDeleteManga = async () => {
    if (!deleteMangaTarget) return;
    setIsDeleting(true);
    try {
      const { deleteOfflineMangaChapter } = await import('@/core/download/mobile/mobileMangaDownloader');
      await deleteOfflineMangaChapter(deleteMangaTarget.anilistId, deleteMangaTarget.chapterKey);
      setMangaChapters((prev) => prev.filter((c) => c.id !== deleteMangaTarget.id));
      void triggerHaptic('success');
      toast.success(uiI18n.t('app.chapter_deleted_15135ad5'));
    } catch {
      void triggerHaptic('error');
      toast.error(uiI18n.t('app.failed_to_delete_07931ff7'));
    } finally {
      setIsDeleting(false);
      setDeleteMangaTarget(null);
    }
  };

  const handleRetryAnime = async (entry: DownloadHistoryEntry) => {
    // History rows from older builds lack episodeId — fall back to matching
    // the live queue by series + episode number.
    const episodeId =
      entry.episodeId ||
      queue.find((q) => q.kind === 'anime' && q.animeTitle === entry.animeTitle && q.episode === entry.episodeNumber)?.id;
    if (!episodeId) {
      void triggerHaptic('error');
      toast.info(uiI18n.t('app.re_download_from_the_series_page_6fb02b8d'), {
        get description() { return uiI18n.t('app.this_entry_is_from_an_older_version_and_cannot_b_4de05d79'); },
      });
      return;
    }
    if (queue.some((q) => q.id === episodeId && (q.status === 'queued' || q.status === 'downloading'))) {
      toast.info(uiI18n.t('app.already_downloading_7a98b1fa'));
      return;
    }
    setRetryingId(entry.id);
    try {
      const { retryMobileDownload, deleteMobileAnimeDownload } = await import('@/core/download/mobile/mobileDownloader');
      const res = await retryMobileDownload(episodeId);
      if (res.ok) {
        // Drop the broken row so the retry never plays stale bytes; the new
        // attempt records a fresh row on completion.
        await deleteMobileAnimeDownload(entry.id, entry.animeTitle, entry.episodeNumber);
        void triggerHaptic('success');
        toast.success(uiI18n.t('app.re_downloading_episode_i18n_value_0_5c48db88', { value0: entry.episodeNumber }));
        await refreshLists();
      } else {
        const reason = 'reason' in res && typeof res.reason === 'string' ? res.reason : 'unknown';
        if (reason === 'missing_stream_url') {
          toast.info(uiI18n.t('app.re_download_from_the_series_page_6fb02b8d'), {
            get description() { return uiI18n.t('app.the_original_stream_link_expired_open_the_anime__c8bb671d'); },
          });
        } else {
          toast.error(uiI18n.t('app.could_not_restart_the_download_86256d4a'), { description: String(reason || '') });
        }
      }
    } catch (error) {
      void triggerHaptic('error');
      toast.error(uiI18n.t('app.could_not_restart_the_download_86256d4a'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRetryingId(null);
    }
  };

  const handleDeleteAnime = async () => {
    if (!deleteAnimeTarget) return;
    setIsDeleting(true);
    try {
      const { deleteMobileAnimeDownload } = await import('@/core/download/mobile/mobileDownloader');
      const res = await deleteMobileAnimeDownload(deleteAnimeTarget.id, deleteAnimeTarget.animeTitle, deleteAnimeTarget.episodeNumber);
      if (!res.ok) {
        throw new Error(typeof (res as { reason?: unknown }).reason === 'string' ? String((res as { reason?: unknown }).reason) : 'delete failed');
      }
      {
        setAnimeHistory((prev) => prev.filter((h) => h.id !== deleteAnimeTarget.id));
        void triggerHaptic('success');
        toast.success(uiI18n.t('app.episode_i18n_value_0_deleted_from_disk_188a11db', { value0: deleteAnimeTarget.episodeNumber }));
      }
    } catch {
      void triggerHaptic('error');
      toast.error(uiI18n.t('app.failed_to_delete_episode_cd5a71e4'));
    } finally {
      setIsDeleting(false);
      setDeleteAnimeTarget(null);
    }
  };

  return (
    <div className="min-h-screen">
      <Background />
      <MobileNav />

      <main className="pb-28 pt-4">
        <div className="container mx-auto px-4 max-w-3xl">
          <section className="mb-5 overflow-hidden rounded-3xl border border-white/10 bg-card/75 p-4 shadow-xl backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <FolderOpen className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold tracking-tight">{uiI18n.t('app.offline_library_ac6cdd78')}</h1>
                <p className="text-sm text-muted-foreground">{uiI18n.t('app.your_anime_and_manga_ready_anywhere_000a37e1')}</p>
              </div>
              {activeDownloads.length > 0 && (
                <Badge variant="secondary" className="shrink-0 tabular-nums">
                  <Download className="mr-1 h-3 w-3 animate-pulse" />
                  {activeDownloads.length}
                </Badge>
              )}
            </div>

            <div className="mt-4 grid grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/[0.07] bg-black/10 py-3 text-center">
              <div><p className="text-lg font-bold tabular-nums">{libraryStats.titles}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{uiI18n.t('app.titles_a116f725')}</p></div>
              <div><p className="text-lg font-bold tabular-nums">{libraryStats.items}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{uiI18n.t('app.items_44d25b5d')}</p></div>
              <div><p className="text-lg font-bold tabular-nums">{formatBytes(libraryStats.bytes)}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{uiI18n.t('app.storage_9e092dda')}</p></div>
            </div>
            {animeHistory.length > 0 && (
              <button
                type="button"
                onClick={handleFreeWatched}
                disabled={freeingWatched}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
              >
                {freeingWatched ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {freeingWatched ? uiI18n.t('app.freeing_86bb725c') : uiI18n.t('app.free_up_watched_episodes_9aad4dbc')}
              </button>
            )}
          </section>

          {/* Auto-download-next intent: Ep N finished → Ep N+1 is one tap away
              (or already auto-fetched when its player button resolved). */}
          {upNext && (
            <button
              type="button"
              onClick={() => { void triggerHaptic('navigate'); navigate(`/anime/${upNext.animeId}`); }}
              className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-3 text-left shadow-sm transition-colors hover:bg-primary/15 active:scale-[0.99]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                <Sparkles className="h-5 w-5 text-primary" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{uiI18n.t('app.up_next_episode_ae0c9365')} {upNext.nextEpisode}</span>
                <span className="block truncate text-xs text-muted-foreground">{upNext.animeTitle} {uiI18n.t('app.tap_to_open_b5ebec22')}</span>
              </span>
              <Download className="h-4 w-4 shrink-0 text-primary" />
            </button>
          )}

          {(animeGroups.length > 0 || mangaGroups.length > 0) && (
            <div role="tablist" aria-label={uiI18n.t('app.offline_library_filter_ad5e4a86')} className="mb-5 grid grid-cols-3 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
              {(['all', 'anime', 'manga'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  role="tab"
                  aria-selected={libraryFilter === filter}
                  onClick={() => { void triggerHaptic('select'); setLibraryFilter(filter); }}
                  className={`min-h-10 rounded-xl px-3 text-sm font-semibold capitalize transition-colors ${libraryFilter === filter ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {uiI18n.t(({"all":"app.all_d87c4480","anime":"app.anime_11a3e059","manga":"app.manga_1c404c69"})[filter])}
                </button>
              ))}
            </div>
          )}

          {/* Active downloads */}
          {activeDownloads.length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                {uiI18n.t('app.downloading_now_7620e312')}
              </h2>
              <div className="space-y-2">
                {activeDownloads.map((item) => (
                  <ActiveRow key={item.id} item={item} onCancel={cancelDownload} />
                ))}
              </div>
            </section>
          )}

          {loadingLists ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !hasAnything ? (
            <GlassPanel className="p-12 text-center">
              <HardDrive className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">{uiI18n.t('app.no_downloads_75c52423')}</h3>
              <p className="text-muted-foreground mb-6">
                {uiI18n.t('app.download_episodes_from_the_video_player_or_chapt_e6de3c65')}
              </p>
              <Button onClick={() => { void triggerHaptic('navigate'); navigate('/'); }}>{uiI18n.t('app.browse_2f3b5c55')}</Button>
            </GlassPanel>
          ) : (
            <div className="space-y-8">
              {/* Downloaded manga */}
              {mangaChapters.length > 0 && libraryFilter !== 'anime' && (
                <section>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                    {uiI18n.t('app.manga_24d9ab42')} {mangaGroups.length} {uiI18n.t('app.title_3c6de1b7')}{mangaGroups.length > 1 ? 's' : ''}
                  </h2>
                  <div className="space-y-2">
                    {mangaGroups.map((group) => (
                      <details key={group.key} onToggle={(event) => { if (event.currentTarget.open) void triggerHaptic('open'); }} className="group overflow-hidden rounded-2xl border border-white/10 bg-card/65 shadow-sm">
                        <summary className="flex min-h-24 cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
                          {group.posterUrl ? (
                            <img src={group.posterUrl} alt={uiI18n.t('app.i18n_value_0_poster_9f90b803', { value0: group.title })} className="h-20 w-14 shrink-0 rounded-xl object-cover shadow-md" loading="lazy" />
                          ) : (
                            <span className="flex h-20 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/15"><BookOpen className="h-6 w-6 text-primary" /></span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{group.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {group.items.length} {uiI18n.t('app.chapter_09d4c7f1')}{group.items.length > 1 ? 's' : ''} · {formatBytes(group.items.reduce((sum, item) => sum + (item.sizeBytes || 0), 0))}
                            </p>
                          </div>
                          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="space-y-1 border-t border-white/[0.07] p-2">
                          {group.items.map((ch) => (
                            <div key={ch.id} className="flex items-center gap-2 rounded-xl px-2 py-2.5 hover:bg-white/[0.04]">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">{ch.chapterNumber != null ? uiI18n.t('app.chapter_i18n_value_0_e0f6e591', { value0: ch.chapterNumber }) : uiI18n.t('app.chapter_46b00590')}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {ch.pageCount ? uiI18n.t('app.i18n_value_0_pages_c74d13bd', { value0: ch.pageCount }) : ''}{ch.sizeBytes ? uiI18n.t('app.i18n_value_0_92e4cd32', { value0: formatBytes(ch.sizeBytes) }) : ''}{ch.downloadedAt ? uiI18n.t('app.i18n_value_0_92e4cd32', { value0: formatDate(ch.downloadedAt) }) : ''}
                                </p>
                              </div>
                              <Button size="sm" variant="ghost" className="h-9 px-3 gap-1.5" onClick={() => handleReadManga(ch)}>
                                <Play className="w-4 h-4" /><span className="text-xs font-semibold">{uiI18n.t('app.read_852b438f')}</span>
                              </Button>
                              <Button size="sm" variant="ghost" className="h-10 w-10 p-0 text-destructive" onClick={() => { void triggerHaptic('warning'); setDeleteMangaTarget(ch); }} aria-label={uiI18n.t('app.delete_chapter_i18n_value_0_eeb87bd0', { value0: ch.chapterNumber ?? '' })}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              )}

              {/* Downloaded anime */}
              {animeHistory.length > 0 && libraryFilter !== 'manga' && (
                <section>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                    {uiI18n.t('app.anime_d84bc466')} {animeGroups.length} {uiI18n.t('app.title_3c6de1b7')}{animeGroups.length > 1 ? 's' : ''}
                  </h2>
                  <div className="space-y-2">
                    {animeGroups.map((group) => (
                      <details key={group.key} onToggle={(event) => { if (event.currentTarget.open) void triggerHaptic('open'); }} className="group overflow-hidden rounded-2xl border border-white/10 bg-card/65 shadow-sm">
                        <summary className="flex min-h-24 cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
                          {group.posterUrl ? (
                            <img src={group.posterUrl} alt={uiI18n.t('app.i18n_value_0_poster_9f90b803', { value0: group.title })} className="h-20 w-14 shrink-0 rounded-xl object-cover shadow-md" loading="lazy" />
                          ) : (
                            <span className="flex h-20 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/15"><FileVideo className="h-6 w-6 text-primary" /></span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{group.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {group.items.length} {uiI18n.t('app.episode_39ae6b3c')}{group.items.length > 1 ? 's' : ''} · {formatBytes(group.items.reduce((sum, item) => sum + (item.fileSizeBytes || 0), 0))}
                            </p>
                          </div>
                          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="space-y-1 border-t border-white/[0.07] p-2">
                          {group.items.map((h) => {
                            const broken = h.fileSizeBytes != null && h.fileSizeBytes < 64 * 1024 && !/^torrent-session:\/\//i.test(String(h.localPath || ''));
                            return (
                            <div
                              key={h.id}
                              className="flex min-h-12 w-full items-center gap-2 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.04]"
                            >
                              <button
                                type="button"
                                onClick={() => handlePlayAnime(h)}
                                className="flex min-w-0 flex-1 items-center gap-3 text-left active:bg-white/[0.08]"
                                aria-label={uiI18n.t('app.play_episode_i18n_value_0_73de362f', { value0: h.episodeNumber })}
                              >
                                {broken ? (
                                  <XCircle className="h-4 w-4 shrink-0 text-amber-400" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium">{uiI18n.t('app.episode_8669aa56')} {h.episodeNumber}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {h.fileSizeBytes ? formatBytes(h.fileSizeBytes) : uiI18n.t('app.downloaded_c6197029')}{h.completedAt ? uiI18n.t('app.i18n_value_0_92e4cd32', { value0: formatDate(h.completedAt) }) : ''}
                                    {broken ? uiI18n.t('app.broken_ece1ac31') : ''}
                                  </p>
                                </div>
                                <Badge variant="secondary" className="shrink-0 text-[10px]">
                                  {h.sourceType === 'torrent' ? uiI18n.t('app.torrent_4d15a5de') : h.sourceType === 'hls' ? uiI18n.t('app.hls_63d70cec') : uiI18n.t('app.video_bc17c1f0')}
                                </Badge>
                                <Play className="h-4 w-4 shrink-0 text-primary" />
                              </button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-9 w-9 shrink-0 p-0"
                                disabled={retryingId === h.id}
                                onClick={() => { void triggerHaptic('tap'); void handleRetryAnime(h); }}
                                aria-label={uiI18n.t('app.re_download_episode_i18n_value_0_68515806', { value0: h.episodeNumber })}
                                title={uiI18n.t('app.re_download_7cd09bcd')}
                              >
                                {retryingId === h.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RotateCw className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-9 w-9 shrink-0 p-0 text-destructive"
                                onClick={() => { void triggerHaptic('warning'); setDeleteAnimeTarget(h); }}
                                aria-label={uiI18n.t('app.delete_episode_i18n_value_0_f00796b4', { value0: h.episodeNumber })}
                                title={uiI18n.t('app.delete_from_disk_a8a34e56')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            );
                          })}
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              )}

              {/* Failed this session — anime retries in place, manga deep-links
                  to its page (chapter resolution only exists there). */}
              {failedItems.length > 0 && (
                <section>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                    {uiI18n.t('app.failed_09fef5d8')}
                  </h2>
                  <div className="space-y-2">
                    {failedItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-red-500/[0.06] border border-red-500/20">
                        <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.animeTitle || item.title || uiI18n.t('app.download_a479c9c3')}</p>
                          <p className="text-xs text-red-300/80 truncate">
                            {item.error || uiI18n.t('app.download_failed_1544b795')}
                          </p>
                        </div>
                        {item.kind === 'anime' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-9 shrink-0 gap-1.5 px-3"
                            onClick={() => { void triggerHaptic('tap'); retryDownload(item.id); }}
                            aria-label={uiI18n.t('app.retry_download_of_i18n_value_0_1ff9c62c', { value0: item.animeTitle || 'episode' })}
                          >
                            <RotateCw className="w-4 h-4" /><span className="text-xs font-semibold">{uiI18n.t('app.retry_9f5cd8a2')}</span>
                          </Button>
                        ) : item.anilistId ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-9 shrink-0 gap-1.5 px-3"
                            onClick={() => { void triggerHaptic('navigate'); navigate(`/manga/${item.anilistId}`); }}
                            aria-label={uiI18n.t('app.open_manga_to_re_download_8e4ab91c')}
                          >
                            <BookOpen className="w-4 h-4" /><span className="text-xs font-semibold">{uiI18n.t('app.open_cf9b7706')}</span>
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Delete anime dialog — removes the file(s) from disk + the history row */}
      <Dialog open={!!deleteAnimeTarget} onOpenChange={() => setDeleteAnimeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uiI18n.t('app.delete_episode_5b551de8')}</DialogTitle>
            <DialogDescription>
              {uiI18n.t('app.delete_episode_d97bdfa5')} {deleteAnimeTarget?.episodeNumber} {uiI18n.t('app.of_110df343')}{deleteAnimeTarget?.animeTitle}{uiI18n.t('app.from_disk_bb092799')}
              {deleteAnimeTarget?.fileSizeBytes ? uiI18n.t('app.this_frees_i18n_value_0_72884aae', { value0: formatBytes(deleteAnimeTarget.fileSizeBytes) }) : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteAnimeTarget(null)} disabled={isDeleting}>
              {uiI18n.t('app.cancel_77dfd213')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteAnime} disabled={isDeleting}>
              {isDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {uiI18n.t('app.delete_f6fdbe48')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete manga dialog */}
      <Dialog open={!!deleteMangaTarget} onOpenChange={() => setDeleteMangaTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uiI18n.t('app.delete_chapter_c7ce3b5c')}</DialogTitle>
            <DialogDescription>
              {uiI18n.t('app.delete_f6fdbe48')} {deleteMangaTarget?.chapterNumber != null ? uiI18n.t('app.ch_i18n_value_0_4d827531', { value0: deleteMangaTarget.chapterNumber }) : uiI18n.t('app.this_chapter_b2f51d36')} {uiI18n.t('app.of_110df343')}{deleteMangaTarget?.title}”?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteMangaTarget(null)} disabled={isDeleting}>
              {uiI18n.t('app.cancel_77dfd213')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteManga} disabled={isDeleting}>
              {isDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {uiI18n.t('app.delete_f6fdbe48')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
