import { OfflineMediaCard } from '@/components/library/OfflineMediaCard';
import { AutomationProfiles } from '@/components/library/AutomationProfiles';
import { useState, useEffect, useMemo } from 'react';
import { liveQuery } from 'dexie';
import { useMangaDownload } from '@/hooks/media/useMangaDownload';
import { MobileOfflineLibrary } from '@/components/mobile/MobileOfflineLibrary';
import { isMobileNative } from '@/lib/platform/platform';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Download, Play, Trash2, FolderOpen, Search, RefreshCw,
  Plus, FolderSync, HardDrive, Loader2, X, History,
  AlertCircle, CheckCircle2, Ban, Bot, Magnet, Languages, Server, BookOpen,
} from 'lucide-react';
import { ImportAnimeModal } from '@/components/modals/ImportAnimeModal';
import { TorrentDownloadModal } from '@/components/modals/TorrentDownloadModal';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { useIsNativeApp, useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { Skeleton } from '@/components/ui/skeleton-custom';
import { toast } from 'sonner';
import { fetchCombinedSources } from '@/lib/api';
import { useDownload } from '@/hooks/media/useDownload';
import { hasTorrentService } from '@/lib/platform/platform';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getLanguageLabel } from '@/core/download/language-resolver';
import { getKnownServerOptions } from '@/lib/serverNames';
import type { DownloadHistoryEntry } from '@/core/db/tatakai-db';
import type { OfflineMangaSeries } from '@/types/electron-bridge';
import type { OfflineNovel } from '@/core/db/tatakai-db';
import { observeOfflineNovels, removeOfflineNovelSeries } from '@/core/download/novelOffline';

interface OfflineAnime {
  name: string;
  path: string;
  poster: string | null;
  posterUrl?: string;
  episodes: {
    id: string;
    number: number;
    file: string;
    subtitles?: { lang: string; label: string; file: string }[];
  }[];
  totalEpisodes?: number;
  downloadedEpisodes?: number;
}

interface DownloadStats {
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  totalSizeBytes: number;
}

// Canonical languages offered by the resolver, in preference-friendly order.
const AUTO_DL_LANGUAGES = ['ja', 'en', 'hi', 'es', 'pt', 'fr', 'ko', 'zh', 'ar', 'de', 'it', 'th'];

/**
 * Global Auto-Download preferences: preferred audio language and default
 * server. Persisted to localStorage keys the automation engine
 * (`tatakai_default_language`) and the manual download modal
 * (`tatakai_default_server`) both read.
 */
function AutoDownloadSettings() {
  const [language, setLanguage] = useState<string>(
    () => localStorage.getItem('tatakai_default_language') || 'ja',
  );
  const [server, setServer] = useState<string>(
    () => localStorage.getItem('tatakai_default_server') || '',
  );
  const serverOptions = useMemo(() => getKnownServerOptions(), []);

  const onLanguage = (v: string) => {
    setLanguage(v);
    localStorage.setItem('tatakai_default_language', v);
    toast.success(`Preferred audio language set to ${getLanguageLabel(v)}`);
  };
  const onServer = (v: string) => {
    setServer(v);
    if (v) localStorage.setItem('tatakai_default_server', v);
    else localStorage.removeItem('tatakai_default_server');
    toast.success(v ? 'Default server updated' : 'Default server set to Auto');
  };

  const selectClass =
    'w-full h-10 rounded-lg bg-background border border-input px-3 text-sm ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring cursor-pointer';

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-sm">Download preferences</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="download-audio-language" className="flex items-center gap-2 text-sm font-medium">
            <Languages className="w-3.5 h-3.5" /> Preferred audio language
          </label>
          <select id="download-audio-language" value={language} onChange={(e) => onLanguage(e.target.value)} className={selectClass}>
            {AUTO_DL_LANGUAGES.map((code) => (
              <option key={code} value={code} className="bg-background">
                {getLanguageLabel(code)}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">Used for auto-downloads and as the default in the download picker.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="download-default-server" className="flex items-center gap-2 text-sm font-medium">
            <Server className="w-3.5 h-3.5" /> Default server
          </label>
          <select id="download-default-server" value={server} onChange={(e) => onServer(e.target.value)} className={selectClass}>
            <option value="" className="bg-background">Auto (recommended)</option>
            {serverOptions.map((s) => (
              <option key={s.key} value={s.key} className="bg-background">
                {s.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">Preferred first — the app falls back to others when unavailable.</p>
        </div>
      </div>
    </section>
  );
}

export default function OfflineLibraryPage() {
  // ── Library state ──────────────────────────────────────────────────────────
  const [animes, setAnimes] = useState<OfflineAnime[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [downloadPath, setDownloadPath] = useState<string | null>(null);
  const [mangaSeries, setMangaSeries] = useState<OfflineMangaSeries[]>([]);
  const [novelRows, setNovelRows] = useState<OfflineNovel[]>([]);
  const [recoveryState, setRecoveryState] = useState<{ autoResume: boolean; jobs: { id: string; type: string; title: string }[] }>({ autoResume: false, jobs: [] });
  const [resuming, setResuming] = useState(false);

  // ── History state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('library');
  const [history, setHistory] = useState<DownloadHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStats, setHistoryStats] = useState<DownloadStats>({
    total: 0, completed: 0, failed: 0, cancelled: 0, totalSizeBytes: 0,
  });

  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { downloadStates = {}, cancelDownload } = useDownload();
  const { downloadStates: mangaDownloadStates, cancelChapter, enqueueChapter } = useMangaDownload();
  const confirm = useConfirm();
  useEffect(() => {
    const bridge = (window as any).electron;
    if (!isDesktopApp || !bridge?.getDownloadRecovery) return;
    let cancelled = false;
    const refresh = () => bridge.getDownloadRecovery().then((value: typeof recoveryState) => { if (!cancelled) setRecoveryState(value); }).catch(() => {});
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [isDesktopApp]);

  // Read tab from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && ['library', 'automation', 'history'].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  // Get active downloads
  const activeDownloads = Object.entries(downloadStates).filter(
    ([_, state]) => state.status === 'downloading' || state.status === 'queued'
  );
  const activeMangaDownloads = Object.values(mangaDownloadStates).filter(
    state => state.status === 'downloading' || state.status === 'queued',
  );

  useEffect(() => {
    if (activeTab !== 'history') return;
    const subscription = liveQuery(async () => {
      const { getHistory, getDownloadStats } = await import('@/core/download/download-history-service');
      return Promise.all([getHistory(200), getDownloadStats()]);
    }).subscribe(([entries, stats]) => {
      setHistory(entries); setHistoryStats(stats); setHistoryLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [activeTab]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getDownloadPath = () => localStorage.getItem('tatakai_download_path') || null;

  // ── Library loaders ────────────────────────────────────────────────────────
  const loadOfflineLibrary = async () => {
    if (isMobileNative()) { setLoading(false); return; }
    if (!isNative) { setLoading(false); return; }
    try {
      const customPath = getDownloadPath();
      setDownloadPath(customPath);
      const library = await (window as any).electron.getOfflineLibrary(customPath);
      const items = library || [];

      // Convert tatakai-media:// poster URLs to HTTP stream URLs for image display.
      const electron = (window as any).electron;
      if (electron?.streamLocalFile) {
        await Promise.all(items.map(async (anime: any) => {
          if (anime.poster && anime.poster.startsWith('tatakai-media://')) {
            try {
              const result = await electron.streamLocalFile(anime.poster);
              if (result?.success && result.url) {
                anime.poster = result.url;
              }
            } catch {
              // Keep original on error
            }
          }
        }));
      }

      setAnimes(items);
    } catch (err) {
      console.error('Failed to load offline library:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Manga library loader ─────────────────────────────────────────────────────
  const loadMangaLibrary = async () => {
    const electron = (window as any).electron;
    if (!isNative || !electron?.manga?.getOfflineLibrary) return;
    try {
      const customPath = getDownloadPath();
      const library: OfflineMangaSeries[] = (await electron.manga.getOfflineLibrary(customPath)) || [];
      if (electron?.streamLocalFile) {
        await Promise.all(library.map(async (s) => {
          const raw = s.poster || s.posterUrl || null;
          if (raw && raw.startsWith('tatakai-media://')) {
            try {
              const result = await electron.streamLocalFile(raw);
              if (result?.success && result.url) s.poster = result.url;
            } catch { /* keep original */ }
          } else if (raw) {
            s.poster = raw;
          }
        }));
      }
      setMangaSeries(library);
    } catch (err) {
      console.error('Failed to load offline manga library:', err);
    }
  };

  // ── History loaders ────────────────────────────────────────────────────────
  useEffect(() => {
    const onMangaUpdated = () => { void loadMangaLibrary(); };
    window.addEventListener('tatakai:offline-manga-updated', onMangaUpdated);
    return () => window.removeEventListener('tatakai:offline-manga-updated', onMangaUpdated);
  }, []);
  const loadHistoryData = async () => {
    setHistoryLoading(true);
    try {
      const { getHistory, getDownloadStats } = await import('@/core/download/download-history-service');
      const [h, s] = await Promise.all([getHistory(200), getDownloadStats()]);
      setHistory(h);
      setHistoryStats(s);
    } catch (err) {
      console.error('Failed to load download history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => { loadOfflineLibrary(); loadMangaLibrary(); }, [isNative]);

  // Downloaded novels live in Dexie on every platform — observe them directly.
  useEffect(() => observeOfflineNovels(setNovelRows), []);

  useEffect(() => {
    if (activeTab === 'history') loadHistoryData();
  }, [activeTab]);

  // ── Library handlers ───────────────────────────────────────────────────────
  const handleSyncLibrary = async () => {
    if (!isNative) return;
    setSyncing(true);
    try {
      const customPath = getDownloadPath();
      const result = await (window as any).electron.syncOfflineLibrary(customPath);
      toast.success(result.message);
      await loadOfflineLibrary();
      await loadMangaLibrary();
    } catch (err) {
      console.error('Sync failed:', err);
      toast.error('Failed to sync library');
    } finally {
      setSyncing(false);
    }
  };

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFilePaths, setImportFilePaths] = useState<string[]>([]);

  const handleImportVideos = async () => {
    if (!isNative) return;
    try {
      const electron = (window as any).electron;
      // Try new two-phase import (select first, then show anime search modal)
      if (electron?.selectImportFiles) {
        const paths = await electron.selectImportFiles();
        if (Array.isArray(paths) && paths.length > 0) {
          setImportFilePaths(paths);
          setImportModalOpen(true);
        }
      } else if (electron?.importVideoFiles) {
        // Fallback: legacy single-step import
        const result = await electron.importVideoFiles();
        if (result?.success) {
          toast.success(result.message);
          await loadOfflineLibrary();
        } else if (result?.message !== 'No files selected' && result?.message !== 'Import cancelled') {
          toast.error(result?.message || 'Import failed');
        }
      }
    } catch (err) {
      console.error('Import failed:', err);
      toast.error('Failed to import videos');
    }
  };

  const handleRepairAnime = async (anime: OfflineAnime, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isNative) return;
    try {
      toast.info(`Repairing ${anime.name}...`);
      let posterUrl = anime.posterUrl || null;
      let subtitles: any[] = [];
      if (anime.episodes.length > 0) {
        try {
          const sources = await fetchCombinedSources(
            anime.episodes[0].id, anime.name, anime.episodes[0].number, 'hd-2', 'sub'
          );
          subtitles = sources.subtitles || sources.tracks || [];
        } catch { /* best-effort */ }
      }
      const result = await (window as any).electron.repairAnime({
        animePath: anime.path, posterUrl, subtitles, animeName: anime.name,
      });
      if (result.success) { toast.success(result.message); await loadOfflineLibrary(); }
      else toast.error(result.error || 'Repair failed');
    } catch (err) {
      console.error('Repair failed:', err);
      toast.error('Failed to repair anime');
    }
  };

  const handleOpenFolder = async () => {
    if (!isNative) return;
    try { await (window as any).electron.openDownloadsFolder(getDownloadPath()); }
    catch (err) { console.error('Failed to open folder:', err); }
  };

  const handleDeleteAnime = async (anime: OfflineAnime, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isNative) return;
    if (!(await confirm({ title: `Delete "${anime.name}" and all its episodes?`, description: 'This action cannot be undone.', destructive: true }))) return;
    try {
      toast.loading(`Deleting ${anime.name}...`);
      const result = await (window as any).electron.deleteAnime(anime.path);
      if (result.success) { toast.success(result.message); await loadOfflineLibrary(); }
      else toast.error(result.error || 'Failed to delete anime');
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error('Failed to delete anime');
    }
  };

  // ── Manga handlers ─────────────────────────────────────────────────────────
  const handleDeleteMangaSeries = async (series: OfflineMangaSeries, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isNative) return;
    if (!(await confirm({ title: `Delete "${series.title}" and all downloaded chapters?`, description: 'This action cannot be undone.', destructive: true }))) return;
    try {
      toast.loading(`Deleting ${series.title}...`);
      const result = await (window as any).electron.manga.deleteSeries({ anilistId: series.anilistId, customRoot: getDownloadPath() || undefined });
      if (result?.success) { toast.success(`Deleted ${series.title}`); await loadMangaLibrary(); }
      else toast.error(result?.error || 'Failed to delete series');
    } catch (err) {
      console.error('Delete manga failed:', err);
      toast.error('Failed to delete manga series');
    }
  };

  const handleOpenMangaFolder = async (series: OfflineMangaSeries, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isNative) return;
    try { await (window as any).electron.manga.openFolder({ anilistId: series.anilistId, customRoot: getDownloadPath() || undefined }); }
    catch (err) { console.error('Failed to open manga folder:', err); }
  };

  const handleReadManga = (series: OfflineMangaSeries) => {
    const first = series.chapters?.[0];
    if (!first) { toast.error('No chapters downloaded'); return; }
    const params = new URLSearchParams({ chapterKey: first.chapterKey });
    if (first.chapterNumber != null) params.set('chapterNumber', String(first.chapterNumber));
    if (first.provider) params.set('provider', String(first.provider));
    // offline=true marks this as a local-only read so ProtectedRoute keeps the
    // reader reachable during maintenance / a ban / a server outage.
    params.set('offline', 'true');
    navigate(`/manga/read/${series.anilistId}?${params.toString()}`);
  };

  // ── Novel handlers (Dexie-backed, every platform) ──────────────────────────
  const novelSeries = useMemo(() => {
    const byId = new Map<number, { anilistId: number; novelId: string; title: string; poster: string | null; chapters: OfflineNovel[] }>();
    for (const row of novelRows) {
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
    return [...byId.values()].map((s) => ({
      ...s,
      chapters: s.chapters.sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0)),
    }));
  }, [novelRows]);

  const handleReadNovel = (series: (typeof novelSeries)[number]) => {
    const first = series.chapters[0];
    if (!first) { toast.error('No chapters downloaded'); return; }
    const params = new URLSearchParams({ chapterKey: first.chapterKey });
    if (first.chapterNumber != null) params.set('chapterNumber', String(first.chapterNumber));
    if (first.chapterTitle) params.set('chapterTitle', first.chapterTitle);
    if (first.provider) params.set('provider', String(first.provider));
    params.set('paragraph', '0');
    params.set('offline', 'true');
    navigate(`/novel/read/${encodeURIComponent(series.novelId)}?${params.toString()}`);
  };

  const handleDeleteNovelSeries = async (series: (typeof novelSeries)[number], e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirm({ title: `Delete "${series.title}" and all downloaded chapters?`, description: 'This action cannot be undone.', destructive: true }))) return;
    try {
      const count = await removeOfflineNovelSeries(series.anilistId);
      toast.success(`Deleted ${series.title} (${count} chapters)`);
    } catch {
      toast.error('Failed to delete novel series');
    }
  };

  const handlePlayAnime = (anime: OfflineAnime) => {
    const first = anime.episodes[0];
    if (!first) { toast.error('No episodes downloaded'); return; }
    navigate(`/watch/${encodeURIComponent(first.id)}?offline=true&path=${encodeURIComponent(anime.path)}`);
  };

  // ── Not-native gate ────────────────────────────────────────────────────────
  if (isMobileNative()) return <main className="mx-auto max-w-3xl space-y-6 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))]">
    <header className="space-y-1"><h1 className="text-2xl font-semibold">Offline Library</h1><p className="text-sm text-muted-foreground">Downloads and automatic rules, in one place.</p></header>
    <Tabs defaultValue="library" className="space-y-6">
      <TabsList className="h-11 bg-muted/50"><TabsTrigger value="library" className="h-9 px-4">Library</TabsTrigger><TabsTrigger value="automation" className="h-9 px-4">Auto-download</TabsTrigger></TabsList>
      <TabsContent value="library"><MobileOfflineLibrary embedded /></TabsContent><TabsContent value="automation"><AutomationProfiles /><div className="mt-8"><AutoDownloadSettings /></div></TabsContent>
    </Tabs>
  </main>;
  if (!isNative) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6 text-center">
        <GlassPanel className="p-12 space-y-6 max-w-md">
          <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Download className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold">Native Feature</h1>
          <p className="text-muted-foreground">
            The offline library is only available in the Tatakai Desktop and Mobile apps.
          </p>
          <Button onClick={() => navigate('/')} className="w-full h-12 rounded-full">
            Back to Home
          </Button>
        </GlassPanel>
      </div>
    );
  }

  const [torrentModalOpen, setTorrentModalOpen] = useState(false);

  const filteredAnimes = animes.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
  const filteredManga = mangaSeries.filter(m => (m.title || '').toLowerCase().includes(search.toLowerCase()));
  const filteredNovels = novelSeries.filter(n => (n.title || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />

      {/* Desktop app renders the solid 80px fixed Sidebar, so clear it at every
          width (pl-6 slid the heading under the rail). Mobile app hides the rail
          (bottom MobileNav instead); web clears the floating pill via md:pl-32. */}
      <main className={isDesktopApp
        ? 'lg:pl-3 pl-6 pr-6 py-8 max-w-[1440px] mx-auto space-y-6'
        : isNative
        ? 'pl-6 pr-6 py-8 max-w-[1440px] mx-auto space-y-6'
        : 'pl-6 md:pl-32 pr-6 py-8 max-w-[1440px] mx-auto space-y-6'
      }>
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Offline Library</h1>
            <p className="text-muted-foreground">Watch and read offline. Manage your downloads in one place.</p>
          </div>

          {activeTab === 'library' && <div className="flex flex-wrap items-center gap-2">

            <Button variant="outline" size="sm" onClick={handleSyncLibrary} disabled={syncing} className="gap-2">
              <FolderSync className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Folder'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleImportVideos} className="gap-2">
              <Plus className="w-4 h-4" />
              Import Videos
            </Button>
            {isNative && hasTorrentService() && (window as any).tatakaiRuntime?.startTorrentSession && (
              <Button variant="outline" size="sm" onClick={() => setTorrentModalOpen(true)} className="gap-2">
                <Magnet className="w-4 h-4" />
                Torrent Download
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleOpenFolder} className="gap-2">
              <FolderOpen className="w-4 h-4" />
              Open Folder
            </Button>
          </div>}
        </div>

        {/* Search bar */}
        {activeTab === 'library' && isDesktopApp && recoveryState.jobs.length > 0 && (window as any).electron?.getDownloadRecovery && (
          <GlassPanel className="p-4 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">Continue interrupted anime and manga downloads from saved progress.</p>
            <Button variant="outline" size="sm" disabled={resuming || recoveryState.jobs.length === 0} onClick={async () => {
              setResuming(true);
              try {
                const result = await (window as any).electron.resumeInterruptedDownloads();
                setRecoveryState(await (window as any).electron.getDownloadRecovery());
                if (!result.success) toast.error('Some downloads could not resume. Try again after reconnecting.');
                else toast.success('Interrupted downloads resumed');
              } catch { toast.error('Could not resume downloads'); }
              finally { setResuming(false); }
            }} className="gap-2">
              <Play className="h-4 w-4" /> {resuming ? 'Resuming…' : `Resume interrupted (${recoveryState.jobs.length})`}
            </Button>
          </GlassPanel>
        )}
        {activeTab === 'library' && <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative group flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              type="search"
              aria-label="Search offline library"
              placeholder="Search downloaded anime, manga and novels"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-12 pr-4 rounded-lg bg-background border border-input focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring text-sm"
            />
          </div>
          {(animes.length > 0 || mangaSeries.length > 0 || novelSeries.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {animes.length > 0 && (
                <>
                  <div className="flex items-center gap-2"><HardDrive className="w-4 h-4" /><span>{animes.length} anime</span></div>
                  <div className="flex items-center gap-2"><Download className="w-4 h-4" /><span>{animes.reduce((a, b) => a + b.episodes.length, 0)} episodes</span></div>
                </>
              )}
              {mangaSeries.length > 0 && (
                <>
                  <div className="flex items-center gap-2"><BookOpen className="w-4 h-4" /><span>{mangaSeries.length} series</span></div>
                  <div className="flex items-center gap-2"><Download className="w-4 h-4" /><span>{mangaSeries.reduce((a, b) => a + (b.chapterCount ?? b.chapters?.length ?? 0), 0)} chapters</span></div>
                </>
              )}
              {novelSeries.length > 0 && (
                <>
                  <div className="flex items-center gap-2"><BookOpen className="w-4 h-4" /><span>{novelSeries.length} novels</span></div>
                  <div className="flex items-center gap-2"><Download className="w-4 h-4" /><span>{novelSeries.reduce((a, b) => a + b.chapters.length, 0)} chapters</span></div>
                </>
              )}
            </div>
          )}
        </div>}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="max-w-full overflow-x-auto border-b border-border pb-3">
          <TabsList className="h-11 w-full sm:w-max bg-transparent rounded-none p-0 gap-1">
            <TabsTrigger value="library" className="gap-2 rounded-lg data-[state=active]:bg-muted data-[state=active]:shadow-none px-4">
              <HardDrive className="hidden sm:block w-4 h-4" />
              Library
            </TabsTrigger>
            <TabsTrigger value="automation" className="gap-2 rounded-lg data-[state=active]:bg-muted data-[state=active]:shadow-none px-4">
              <Bot className="hidden sm:block w-4 h-4" />
              Auto-Download
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2 rounded-lg data-[state=active]:bg-muted data-[state=active]:shadow-none px-4">
              <History className="hidden sm:block w-4 h-4" />
              History
              {historyStats.failed > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold">
                  {historyStats.failed}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          </div>

          {/* ── Library Tab ── */}

          <TabsContent value="library" className="space-y-6 mt-0">

            {/* Active Downloads */}
            {activeDownloads.length + activeMangaDownloads.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  Active Downloads ({activeDownloads.length + activeMangaDownloads.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeMangaDownloads.map(state => (
                    <GlassPanel key={state.jobId} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold">{state.title || 'Downloading manga…'}</h3>
                          <p className="text-xs text-muted-foreground">{state.chapterLabel || `Chapter ${state.chapterKey}`}</p>
                        </div>
                        <button onClick={() => void cancelChapter(state.anilistId, state.chapterKey)} title="Cancel chapter download" className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/5" role="progressbar" aria-valuenow={state.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Chapter download progress">
                        <div className="h-full bg-primary" style={{ width: `${state.progress}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground">{state.status === 'queued' ? 'Queued' : `${Math.round(state.progress)}% · ${state.page || 0}/${state.totalPages || 0} pages`}</p>
                    </GlassPanel>
                  ))}
                  {activeDownloads.map(([episodeId, state]) => (
                    <GlassPanel key={episodeId} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm truncate">{(state as any).animeName || 'Downloading…'}</h3>
                          <p className="text-xs text-muted-foreground">Episode {(state as any).episodeNumber || 1}</p>
                        </div>
                        <button
                          onClick={() => cancelDownload(episodeId)}
                          className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                          title="Cancel download"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${state.progress || 0}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{state.status === 'queued' ? 'Queued' : `${state.progress?.toFixed(0) || 0}%`}</span>
                          <div className="flex items-center gap-3">
                            {state.speed && <span>{state.speed}</span>}
                            {state.eta && <span>ETA: {state.eta}</span>}
                          </div>
                        </div>
                      </div>
                    </GlassPanel>
                  ))}
                </div>
              </div>
            )}

            {/* Anime Grid */}
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-[2/3] rounded-2xl" />)}
              </div>
            ) : filteredAnimes.length > 0 ? (
              <section aria-label="Downloaded anime" className="space-y-4">
                <h2 className="text-lg font-semibold">Anime</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6">
                  {filteredAnimes.map(anime => <OfflineMediaCard key={anime.path} title={anime.name} poster={anime.poster} count={anime.episodes.length}
                    onOpen={() => handlePlayAnime(anime)} onRepair={event => void handleRepairAnime(anime, event)} onDelete={event => void handleDeleteAnime(anime, event)} />)}
                </div>
              </section>
            ) : filteredManga.length > 0 || filteredNovels.length > 0 ? null : (
              <div className="py-16 text-center space-y-4">
                <Download className="mx-auto h-8 w-8 text-muted-foreground" />
                <div className="space-y-2"><h2 className="text-xl font-semibold">{search ? 'No matching downloads' : 'Your offline library starts here'}</h2>
                  <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">{search ? 'Try a different title or clear your search to see everything.' : 'Download episodes and chapters from a series, or import videos using the toolbar above.'}</p>
                </div>
                {search ? <Button variant="outline" onClick={() => setSearch('')}>Clear search</Button> : <Button onClick={() => navigate('/search')}>Find a series</Button>}
              </div>
            )}

            {filteredManga.length > 0 && <section aria-label="Downloaded manga and comics" className="space-y-4">
              <h2 className="text-lg font-semibold">Manga & comics</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6">
                {filteredManga.map(series => <OfflineMediaCard key={series.anilistId} title={series.title} poster={series.poster} count={series.chapterCount ?? series.chapters?.length ?? 0} kind={series.kind || 'manga'}
                  onOpen={() => handleReadManga(series)} onReveal={event => void handleOpenMangaFolder(series, event)} onDelete={event => void handleDeleteMangaSeries(series, event)} />)}
              </div>
            </section>}

            {filteredNovels.length > 0 && <section aria-label="Downloaded light novels" className="space-y-4">
              <h2 className="text-lg font-semibold">Light novels</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6">
                {filteredNovels.map(series => <OfflineMediaCard key={`novel-${series.anilistId}`} title={series.title} poster={series.poster} count={series.chapters.length} kind="novel"
                  onOpen={() => handleReadNovel(series)} onDelete={event => void handleDeleteNovelSeries(series, event)} />)}
              </div>
            </section>}
          </TabsContent>

          {/* ── Auto-Download Tab ── */}
          <TabsContent value="automation" className="mt-0 space-y-8">
            <AutomationProfiles />
            <AutoDownloadSettings />
          </TabsContent>

          {/* ── History Tab ── */}
          <TabsContent value="history" className="space-y-6 mt-0">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <History className="w-5 h-5 text-primary" />
                  Download History
                </h2>
                <p className="text-sm text-muted-foreground">
                  Track every automated and manual download attempt — completions, failures, and cancellations.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={loadHistoryData} disabled={historyLoading} className="gap-2">
                  <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={history.length === 0}
                  onClick={async () => {
                    if (!(await confirm({ title: 'Clear the entire download history? This cannot be undone.', destructive: true }))) return;
                    const { clearHistory } = await import('@/core/download/download-history-service');
                    await clearHistory();
                    toast.success('Download history cleared');
                    loadHistoryData();
                  }}
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All
                </Button>
              </div>
            </div>

            <dl className="flex flex-wrap gap-x-8 gap-y-4 border-y border-border py-4 text-sm">
              <div><dt className="text-xs text-muted-foreground">Attempts</dt><dd className="mt-1 font-semibold tabular-nums">{historyStats.total}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Completed</dt><dd className="mt-1 font-semibold tabular-nums">{historyStats.completed}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Failed</dt><dd className="mt-1 font-semibold tabular-nums">{historyStats.failed}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Downloaded</dt><dd className="mt-1 font-semibold tabular-nums">{historyStats.totalSizeBytes >= 1_073_741_824 ? `${(historyStats.totalSizeBytes / 1_073_741_824).toFixed(2)} GB` : `${(historyStats.totalSizeBytes / 1_048_576).toFixed(0)} MB`}</dd></div>
            </dl>

            {/* History list */}
            {historyLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 border border-dashed border-white/10 rounded-2xl bg-white/[0.01] text-center space-y-3">
                <History className="w-12 h-12 text-muted-foreground opacity-30" />
                <p className="font-medium text-muted-foreground">No download history yet</p>
                <p className="text-xs text-muted-foreground/70 max-w-xs">
                  Automated or manual downloads will appear here when they complete, fail, or are cancelled.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((entry) => (
                  <GlassPanel key={entry.id} className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left: status dot + info */}
                      <div className="flex items-start gap-3">
                        <div className="mt-1 flex-shrink-0">
                          {entry.status === 'completed' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : entry.status === 'failed' ? (
                            <AlertCircle className="w-4 h-4 text-red-500" />
                          ) : (
                            <Ban className="w-4 h-4 text-yellow-500" />
                          )}
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <h4 className="font-bold text-sm leading-tight">
                            {entry.animeTitle}
                            {entry.episodeName ? ` — ${entry.episodeName}` : ''}
                          </h4>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span>{entry.mediaType === 'manga' ? entry.chapterLabel || `Chapter ${entry.chapterNumber ?? entry.chapterKey}` : `Ep ${entry.episodeNumber}`}</span>
                            {entry.quality && <span>· {entry.quality}</span>}
                            {entry.resolvedLanguage && (
                              <span className="uppercase">· {entry.resolvedLanguage}</span>
                            )}
                            {entry.sourceType && <span>· {entry.sourceType}</span>}
                            {entry.extensionName && <span>· {entry.extensionName}</span>}
                            {entry.fileSizeBytes && (
                              <span>· {(entry.fileSizeBytes / 1_048_576).toFixed(1)} MB</span>
                            )}
                          </div>
                          {entry.errorMessage && (
                            <p className="text-xs text-red-400 font-semibold mt-1">
                              Error: {entry.errorMessage}
                            </p>
                          )}
                          {entry.localPath && (
                            <p className="text-[10px] text-muted-foreground/60 font-mono truncate max-w-xs md:max-w-sm mt-0.5">
                              {entry.localPath}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: timestamp + retry */}
                      <div className="flex items-center gap-3 flex-shrink-0 self-end md:self-center">
                        <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {new Date(entry.completedAt).toLocaleString()}
                        </p>
                        {entry.status === 'failed' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="gap-1.5 text-xs rounded-lg h-8 px-3 font-bold"
                            onClick={async () => {
                              const toastId = toast.loading('Triggering retry…');
                              try {
                                if (entry.mediaType === 'manga') {
                                  const snapshot = localStorage.getItem(`tatakai:manga:retry:${entry.episodeId}`);
                                  if (!snapshot) throw new Error('Chapter retry details are unavailable. Retry from the manga page.');
                                  const { series, chapter } = JSON.parse(snapshot);
                                  const result = await enqueueChapter(series, chapter);
                                  if (!result.ok) throw new Error('Chapter download could not start');
                                  toast.success('Chapter retry queued', { id: toastId });
                                  return;
                                }
                                const { db } = await import('@/core/db/tatakai-db');
                                const { checkAndRunAutomation } = await import('@/core/download/automation-engine');
                                const rule = await db.downloadRules.where('animeId').equals(entry.animeId).first();
                                if (rule) {
                                  rule.lastCheckedEpisode = Math.max(0, entry.episodeNumber - 1);
                                  await db.downloadRules.put(rule);
                                }
                                await checkAndRunAutomation();
                                toast.success('Retry triggered!', { id: toastId });
                                setTimeout(loadHistoryData, 2000);
                              } catch (err) {
                                toast.error('Retry failed', { id: toastId });
                              }
                            }}
                          >
                            <RefreshCw className="w-3 h-3" />
                            Retry
                          </Button>
                        )}
                      </div>
                    </div>
                  </GlassPanel>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <MobileNav />

      {/* Import Anime Modal */}
      <ImportAnimeModal
        open={importModalOpen}
        filePaths={importFilePaths}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => loadOfflineLibrary()}
      />

      {/* Torrent Download Modal */}
      <TorrentDownloadModal
        open={torrentModalOpen}
        onClose={() => setTorrentModalOpen(false)}
        downloadPath={getDownloadPath() || undefined}
      />
    </div>
  );
}
