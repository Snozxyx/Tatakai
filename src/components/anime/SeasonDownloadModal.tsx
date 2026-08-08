import { useState, useEffect } from 'react';
import {
  Download, X, CheckCircle2, Circle, FolderOpen, AlertCircle,
  Bot, Loader2, RefreshCw, Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDownload } from '@/hooks/media/useDownload';
import { useIsNativeApp, useIsDesktopApp, useIsMobileApp } from '@/hooks/ui/useIsNativeApp';
import { toast } from 'sonner';

interface Episode {
  episodeId: string;
  number: number;
  title?: string;
}

interface SeasonDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  episodes: Episode[];
  animeName: string;
  posterUrl: string;
  animeId?: string;
}

// ── Auto-Download Tab ──────────────────────────────────────────────────────

function AutoDownloadTab({
  animeId,
  animeName,
  episodes,
}: {
  animeId?: string;
  animeName: string;
  episodes: Episode[];
}) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const electron = typeof window !== 'undefined' ? (window as any).electron : null;

  useEffect(() => {
    if (!animeId || !electron?.autoDownload?.list) { setLoading(false); return; }
    electron.autoDownload.list().then((list: any[]) => {
      const found = Array.isArray(list) && list.some((item: any) => item.animeId === animeId);
      setIsSubscribed(found);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [animeId]);

  const handleToggle = async () => {
    if (!animeId || !electron?.autoDownload) return;
    setToggling(true);
    try {
      if (isSubscribed) {
        await electron.autoDownload.unsubscribe(animeId);
        setIsSubscribed(false);
        toast.success(`Auto-download disabled for "${animeName}"`);
      } else {
        // Subscribe with next episode = last episode + 1, or ep 1 if none
        const lastEp = episodes.length > 0
          ? Math.max(...episodes.map(e => e.number))
          : 0;
        const nextEp = lastEp + 1;
        await electron.autoDownload.subscribe(animeId, animeName, nextEp);
        setIsSubscribed(true);
        toast.success(`Auto-download enabled for "${animeName}" from episode ${nextEp}`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update auto-download');
    } finally {
      setToggling(false);
    }
  };

  if (!electron?.autoDownload) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
        <Bot className="w-10 h-10 text-muted-foreground opacity-30" />
        <p className="text-muted-foreground text-sm">Auto-download requires the Tatakai desktop app.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const lastEp = episodes.length > 0 ? Math.max(...episodes.map(e => e.number)) : 0;
  const nextEp = lastEp + 1;

  return (
    <div className="space-y-6 py-4">
      {/* Status card */}
      <div className={`rounded-2xl p-5 border transition-all ${isSubscribed
        ? 'bg-primary/10 border-primary/30'
        : 'bg-white/5 border-white/10'}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSubscribed ? 'bg-primary/20' : 'bg-white/10'}`}>
              <Bot className={`w-5 h-5 ${isSubscribed ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="font-semibold text-sm">
                {isSubscribed ? 'Auto-download Active' : 'Auto-download Inactive'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isSubscribed
                  ? `Will auto-download new episodes from Ep ${nextEp} onwards`
                  : 'New episodes will not be downloaded automatically'}
              </p>
            </div>
          </div>
          <Button
            variant={isSubscribed ? 'destructive' : 'default'}
            size="sm"
            onClick={handleToggle}
            disabled={toggling || !animeId}
            className="flex-shrink-0 gap-2 h-9"
          >
            {toggling
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : isSubscribed
                ? <X className="w-4 h-4" />
                : <Bot className="w-4 h-4" />}
            {toggling ? 'Updating...' : isSubscribed ? 'Disable' : 'Enable'}
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="space-y-3 text-sm text-muted-foreground">
        <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
          <Play className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-foreground">How it works</p>
            <p className="text-xs mt-1 leading-relaxed">
              When enabled, the app automatically downloads new episodes when they become available
              using your installed extensions. Downloads go to your Tatakai library folder.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
          <Download className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-foreground">Current series status</p>
            <p className="text-xs mt-1">
              {episodes.length} episode{episodes.length !== 1 ? 's' : ''} available
              {lastEp > 0 && `. Latest is Episode ${lastEp}.`}
              {isSubscribed && ` Auto-download will start from Episode ${nextEp}.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────

export const SeasonDownloadModal = ({
  isOpen,
  onClose,
  episodes,
  animeName,
  posterUrl,
  animeId,
}: SeasonDownloadModalProps) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isStarting, setIsStarting] = useState(false);
  const [downloadPath, setDownloadPath] = useState<string>('');
  const { startDownload, downloadStates = {} } = useDownload();
  const isNative = useIsNativeApp();
  const isDesktop = useIsDesktopApp();
  const isMobile = useIsMobileApp();

  useEffect(() => {
    if (isOpen && !isNative) {
      toast.error('Downloads are only available in the native mobile or desktop app');
      onClose();
    }
  }, [isOpen, isNative, onClose]);

  useEffect(() => {
    if (isOpen && isDesktop && (window as any).electron) {
      const savedPath = localStorage.getItem('tatakai_download_path');
      if (savedPath) {
        setDownloadPath(savedPath);
      } else {
        (window as any).electron.getDownloadsDir().then((dir: string) => setDownloadPath(dir));
      }
    } else if (isOpen && isMobile) {
      setDownloadPath('App Storage');
    }
  }, [isOpen, isDesktop, isMobile]);

  const toggleEpisode = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === episodes.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(episodes.map(e => e.episodeId)));
  };

  const handleDownload = async () => {
    setIsStarting(true);
    const episodesToDownload = episodes.filter(e => selectedIds.has(e.episodeId));
    const basePath = downloadPath || localStorage.getItem('tatakai_download_path') || '';
    if (isDesktop && !basePath) {
      toast.error('Pick a download folder', {
        description: 'Complete Setup or choose a folder in desktop settings.',
      });
      setIsStarting(false);
      return;
    }
    for (const ep of episodesToDownload) {
      let url: string | undefined;
      let headers: Record<string, string> | undefined;
      const rt = typeof window !== 'undefined' ? window.tatakaiRuntime : undefined;
      if (rt?.resolveEpisodeSources) {
        try {
          const resolved = await rt.resolveEpisodeSources({
            episodeId: ep.episodeId,
            animeName,
            episodeNumber: ep.number,
          });
          const sources = resolved?.sources || [];
          const pick =
            sources.find((s: { url?: string }) => s.url && /\.m3u8(\?|$)/i.test(String(s.url))) ||
            sources.find((s: { url?: string }) => !!s.url) ||
            sources[0];
          url = pick?.url ? String(pick.url) : undefined;
          headers = resolved?.headers;
        } catch { /* runtime may still be stubbed */ }
      }
      const result = await startDownload({
        episodeId: ep.episodeId,
        animeName,
        episodeNumber: ep.number,
        posterUrl,
        url: url || '',
        headers,
        downloadPath: basePath || undefined,
      });
      if (!result.ok && result.reason === 'missing_stream_url') {
        toast.error(`Episode ${ep.number}: no stream URL`, {
          description: 'Open the episode once in the player, then retry.',
        });
      } else if (!result.ok) {
        toast.error(`Episode ${ep.number}: download failed`);
      }
    }
    setIsStarting(false);
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in ${isDesktop ? 'inset-x-0 top-[32px] bottom-0' : 'inset-0'}`}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <GlassPanel className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Download className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              Download
            </h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="episodes">
            <TabsList className="bg-white/5 border border-white/10 rounded-xl p-1 w-full">
              <TabsTrigger value="episodes" className="flex-1 gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">
                <Download className="w-4 h-4" /> Episodes
              </TabsTrigger>
              <TabsTrigger value="auto" className="flex-1 gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">
                <Bot className="w-4 h-4" /> Auto-Download
              </TabsTrigger>
            </TabsList>

            {/* Episodes tab */}
            <TabsContent value="episodes" className="mt-4 space-y-4">
              <div className="flex items-center justify-between py-2 border-y border-white/10 text-sm">
                <span className="text-muted-foreground">{selectedIds.size} selected</span>
                <Button variant="ghost" size="sm" onClick={selectAll} className="text-primary hover:text-primary/80 text-xs sm:text-sm">
                  {selectedIds.size === episodes.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>

              <ScrollArea className="h-[280px] sm:h-[360px] pr-2 sm:pr-4">
                <div className="grid grid-cols-1 gap-2">
                  {episodes.map((ep) => {
                    const state = downloadStates[ep.episodeId];
                    const isSelected = selectedIds.has(ep.episodeId);
                    return (
                      <div
                        key={ep.episodeId}
                        onClick={() => state?.status !== 'downloading' && toggleEpisode(ep.episodeId)}
                        className={`flex items-center justify-between p-2 sm:p-3 rounded-lg sm:rounded-xl border transition-all cursor-pointer ${
                          isSelected ? 'bg-primary/10 border-primary/30' : 'bg-white/5 border-transparent hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          {isSelected
                            ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                            : <Circle className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0" />}
                          <div className="min-w-0">
                            <span className="font-bold text-sm sm:text-base">Ep {ep.number}</span>
                            {ep.title && <span className="text-xs text-muted-foreground block truncate max-w-[150px] sm:max-w-[300px]">{ep.title}</span>}
                          </div>
                        </div>
                        {state && (
                          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                            {state.status === 'downloading' && (
                              <div className="text-right">
                                <span className="text-[10px] sm:text-xs font-mono text-primary">{state.progress > 0 ? `${(state.progress).toFixed(0)}%` : '...'}</span>
                                <div className="w-12 sm:w-20 h-1 bg-muted rounded-full overflow-hidden mt-1">
                                  <div className="h-full bg-primary transition-all duration-300" style={{ width: `${state.progress}%` }} />
                                </div>
                              </div>
                            )}
                            {state.status === 'completed' && <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />}
                            {state.status === 'failed' && <X className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="flex items-center text-[10px] sm:text-xs text-muted-foreground px-1">
                <FolderOpen className="w-3 h-3 flex-shrink-0 mr-1" />
                <span className="truncate">{downloadPath || 'App Storage'}</span>
              </div>

              <Button
                onClick={handleDownload}
                disabled={selectedIds.size === 0 || isStarting}
                className="w-full h-12 sm:h-14 rounded-xl sm:rounded-2xl text-base sm:text-lg font-bold glow-primary"
              >
                {isStarting ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Starting Downloads...</>
                ) : (
                  `Start Downloading ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`
                )}
              </Button>
            </TabsContent>

            {/* Auto-download tab */}
            <TabsContent value="auto" className="mt-4">
              <AutoDownloadTab animeId={animeId} animeName={animeName} episodes={episodes} />
            </TabsContent>
          </Tabs>
        </GlassPanel>
      </div>
    </div>
  );
};
