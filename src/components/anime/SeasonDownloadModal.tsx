import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Download, X, CheckCircle2, Circle, FolderOpen, AlertCircle,
  Bot, Loader2, RefreshCw, Play, Languages, Server,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDownload } from '@/hooks/media/useDownload';
import { useIsNativeApp, useIsDesktopApp, useIsMobileApp } from '@/hooks/ui/useIsNativeApp';
import { normalizeLanguage, getLanguageLabel } from '@/core/download/language-resolver';
import { getSimpleServerDisplayName } from '@/lib/serverNames';
import { streamExtensionSources } from '@/hooks/media/useExtensionSourceStream';
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
  anilistId?: number | null;
  malId?: number | null;
}

// ── Source normalization ────────────────────────────────────────────────────
// A downloadable source distilled from the runtime's `resolveEpisodeSources`
// output. Embeds are dropped — only HLS (.m3u8) and torrent can be downloaded.

interface DlSubtitle {
  url: string;
  lang: string;   // normalized code where possible, else raw
  label: string;  // human label shown in the player track menu
}

interface DlSource {
  url: string;
  serverKey: string;
  serverName: string;
  langCode: string;   // normalized: 'ja', 'en', …
  langLabel: string;  // human label: 'Japanese', 'English', …
  isTorrent: boolean;
  quality?: string;
  providerPriority: number;
  subtitles: DlSubtitle[]; // caption tracks to download alongside the video
}

/**
 * Pull caption tracks off a raw resolved source. Sources expose them as
 * `.subtitles` and/or `.tracks` (`{lang|language|label, url, file}`); thumbnail
 * "tracks" are excluded. Deduped by URL.
 */
function extractSubtitles(src: any): DlSubtitle[] {
  const raw: any[] = [
    ...(Array.isArray(src?.subtitles) ? src.subtitles : []),
    ...(Array.isArray(src?.tracks) ? src.tracks : []),
  ];
  const seen = new Set<string>();
  const out: DlSubtitle[] = [];
  for (const t of raw) {
    const url = String(t?.url || t?.file || '').trim();
    if (!url || seen.has(url)) continue;
    const rawLang = String(t?.lang || t?.language || t?.label || '').trim();
    if (!rawLang || rawLang.toLowerCase() === 'thumbnails' || /thumbnails/i.test(url)) continue;
    seen.add(url);
    const langCode = normalizeLanguage(rawLang) || rawLang.toLowerCase();
    out.push({ url, lang: langCode, label: String(t?.label || rawLang) });
  }
  return out;
}

const isM3U8 = (src: any): boolean =>
  !!src.isM3U8 || src.sourceType === 'hls' || /\.m3u8($|[?#/])/i.test(String(src.url || ''));

const isTorrentSrc = (src: any): boolean =>
  (typeof src.isTorrent === 'boolean' ? src.isTorrent : src.sourceType === 'torrent') ||
  /^magnet:/i.test(String(src.url || '')) ||
  /\.torrent($|[?#])/i.test(String(src.url || ''));

const isEmbedSrc = (src: any): boolean => {
  if (typeof src.isEmbed === 'boolean') return src.isEmbed;
  const t = String(src.sourceType || '');
  if (t === 'hls' || t === 'mp4' || t === 'torrent') return false;
  return !/\.m3u8($|[?#/])/i.test(String(src.url || ''));
};

const DUB_LABELS: Record<string, string> = {
  ar: 'Arabic', fr: 'French', de: 'German', pl: 'Polish', zh: 'Chinese',
  es: 'Spanish', pt: 'Portuguese', it: 'Italian', ko: 'Korean',
  hi: 'Hindi', ta: 'Tamil', te: 'Telugu',
};

const rawLangLabel = (src: any, fallbackCategory: string): string => {
  const explicit = String(src.language || src.languageLabel || '').trim();
  if (explicit) return explicit;
  if (src.audioLanguage) {
    const code = String(src.audioLanguage).toLowerCase();
    if (code === 'ja') return 'Japanese';
    if (code === 'en') return 'English';
    return DUB_LABELS[code] || code.toUpperCase();
  }
  return fallbackCategory || 'Japanese';
};

/**
 * Distil a runtime `resolveEpisodeSources` result into downloadable HLS/torrent
 * sources, tagged with a normalized language code and a server key/name.
 */
function normalizeDlSources(resolved: any, fallbackCategory = 'sub'): DlSource[] {
  const raw: any[] = Array.isArray(resolved?.sources) ? resolved.sources : [];
  const out: DlSource[] = [];
  raw.forEach((src) => {
    const url = String(src?.url || '').trim();
    if (!url) return;
    if (isEmbedSrc(src) && !isTorrentSrc(src)) return; // embeds aren't downloadable
    const label = rawLangLabel(src, fallbackCategory);
    const langCode = normalizeLanguage(String(src.audioLanguage || label)) || 'ja';
    const serverKey = String(
      src.providerKey || src.providerName || src.server || src.source || 'toko',
    ).trim();
    const serverName = String(
      src.providerName || src.server || src.source || serverKey,
    ).trim();
    out.push({
      url,
      serverKey,
      serverName,
      langCode,
      langLabel: getLanguageLabel(langCode) || label,
      isTorrent: isTorrentSrc(src),
      quality: src.quality ? String(src.quality) : undefined,
      providerPriority: Number.isFinite(src?.providerPriority)
        ? Number(src.providerPriority)
        : Number.MAX_SAFE_INTEGER,
      subtitles: extractSubtitles(src),
    });
  });
  return out.sort((a, b) => a.providerPriority - b.providerPriority);
}

/**
 * Resolve downloadable sources for one episode.
 *
 * Primary path is the Extension-API SSE stream — the same connection the player
 * uses, which reliably yields real stream URLs. The local runtime one-shot
 * `resolveEpisodeSources` is only a fallback: on its own it frequently returns
 * nothing, which is what produced the "no stream URL" download failures.
 *
 * The stream resolves by AniList id / title + episode number (not the internal
 * episodeId), so it works even when a provider's id mapping is missing.
 */
async function resolveEpisode(episodeId: string, animeName: string, episodeNumber: number, anilistId?: number | null, malId?: number | null, category = 'sub'): Promise<{ sources: DlSource[]; headers?: Record<string, string> }> {
  // 1. Reliable path: the player's Extension-API SSE stream.
  try {
    const streamed = await streamExtensionSources('toko', {
      anilistId: anilistId ?? undefined,
      titles: animeName ? [animeName] : undefined,
      episode: episodeNumber,
      resolution: '1080p',
      preferredLanguage: category,
      route: 'sources',
    });
    const dl = normalizeDlSources({ sources: streamed }, category);
    if (dl.length > 0) return { sources: dl };
  } catch {
    /* fall through to the local runtime resolver */
  }

  // 2. Fallback: local runtime one-shot resolver.
  const rt = typeof window !== 'undefined' ? window.tatakaiRuntime : undefined;
  if (!rt?.resolveEpisodeSources) return { sources: [] };
  try {
    const resolved = await rt.resolveEpisodeSources({
      episodeId,
      animeName,
      episodeNumber,
      anilistId,
      malId,
      preferredLanguage: category,
      method: 'single',
      resolution: '1080p',
    });
    return { sources: normalizeDlSources(resolved, category), headers: (resolved as any)?.headers };
  } catch {
    return { sources: [] };
  }
}


/** Numbered step header used to walk the user through the download flow. */
function StepHeader({ n, label, hint }: { n: number; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-bold shrink-0">
        {n}
      </span>
      <h3 className="text-sm font-semibold tracking-tight">{label}</h3>
      {hint && <span className="ml-auto text-[11px] text-muted-foreground truncate">{hint}</span>}
    </div>
  );
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
  anilistId,
  malId,
}: SeasonDownloadModalProps) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isStarting, setIsStarting] = useState(false);
  const [downloadPath, setDownloadPath] = useState<string>('');
  const { startDownload, downloadStates = {} } = useDownload();
  const isNative = useIsNativeApp();
  const isDesktop = useIsDesktopApp();
  const isMobile = useIsMobileApp();

  // Language / server discovery for the download flow.
  const [probing, setProbing] = useState(false);
  const [probed, setProbed] = useState(false);       // a probe has completed at least once
  const [probeNonce, setProbeNonce] = useState(0);    // bump to force a re-probe
  const [probeSources, setProbeSources] = useState<DlSource[]>([]);
  const [selectedLangCode, setSelectedLangCode] = useState<string>('');
  const [selectedServerKey, setSelectedServerKey] = useState<string>('auto');

  const languageOptions = useMemo(() => {
    const m = new Map<string, string>();
    probeSources.forEach(s => { if (!m.has(s.langCode)) m.set(s.langCode, s.langLabel); });
    return Array.from(m, ([code, label]) => ({ code, label }));
  }, [probeSources]);

  const serverOptions = useMemo(() => {
    const m = new Map<string, string>();
    probeSources
      .filter(s => !selectedLangCode || s.langCode === selectedLangCode)
      .forEach(s => { if (!m.has(s.serverKey)) m.set(s.serverKey, s.serverName); });
    return Array.from(m, ([key, name]) => ({ key, name: getSimpleServerDisplayName(name, name) }));
  }, [probeSources, selectedLangCode]);

  const representativeId = episodes[0]?.episodeId;

  // Cache resolved sources per episode so the probe's work is reused at download
  // time and repeated Start clicks don't re-scrape. Cleared when the anime changes.
  const resolvedCacheRef = useRef<Map<string, { sources: DlSource[]; headers?: Record<string, string> }>>(new Map());
  const resolveEpisodeCached = useCallback(
    async (ep: Episode, category = 'sub') => {
      const key = `${ep.episodeId}:${category}`;
      const hit = resolvedCacheRef.current.get(key);
      if (hit) return hit;
      const res = await resolveEpisode(ep.episodeId, animeName, ep.number, anilistId, malId, category);
      if (res.sources.length > 0) resolvedCacheRef.current.set(key, res);
      return res;
    },
    [animeName, anilistId, malId],
  );

  useEffect(() => { resolvedCacheRef.current.clear(); setProbed(false); }, [representativeId]);


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

  // Probe a representative episode to discover available languages & servers.
  // This is the background warm-up kicked off the moment the modal opens.
  useEffect(() => {
    if (!isOpen || !isNative || !representativeId) return;
    let cancelled = false;
    setProbing(true);
    const rep = episodes[0];
    resolveEpisodeCached(rep)
      .then(({ sources }) => {
        if (cancelled) return;
        setProbeSources(sources);
        // Honor the user's global preferred language (Auto-Download settings)
        // when it's among the detected languages; otherwise keep the current
        // pick if still valid, else fall back to the first available.
        const savedLang = normalizeLanguage(localStorage.getItem('tatakai_default_language') || '');
        const firstLang = sources[0]?.langCode || '';
        setSelectedLangCode(prev => {
          if (savedLang && sources.some(s => s.langCode === savedLang)) return savedLang;
          if (prev && sources.some(s => s.langCode === prev)) return prev;
          return firstLang;
        });
        // Seed the preferred server from the global default when a detected
        // server shares its base provider key.
        const savedServerBase = (localStorage.getItem('tatakai_default_server') || '').split('-')[0];
        if (savedServerBase) {
          const match = sources.find(s => (s.serverKey || '').split('-')[0] === savedServerBase);
          if (match) setSelectedServerKey(prev => (prev === 'auto' ? match.serverKey : prev));
        }
      })
      .finally(() => { if (!cancelled) { setProbing(false); setProbed(true); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isNative, representativeId, resolveEpisodeCached, probeNonce]);

  // Warm up resolution for selected episodes in the background so Start is
  // instant. Capped count + low concurrency so we don't hammer the host.
  useEffect(() => {
    if (!isOpen || !isNative) return;
    let cancelled = false;
    const pending = episodes
      .filter(e => selectedIds.has(e.episodeId) && !resolvedCacheRef.current.has(`${e.episodeId}:sub`))
      .slice(0, 24);
    if (pending.length === 0) return;
    (async () => {
      let idx = 0;
      const worker = async () => {
        while (!cancelled && idx < pending.length) {
          await resolveEpisodeCached(pending[idx++]);
        }
      };
      await Promise.all(Array.from({ length: Math.min(2, pending.length) }, worker));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isNative, selectedIds, resolveEpisodeCached]);

  // Keep the chosen server valid as the language (and thus server list) changes.
  useEffect(() => {
    if (selectedServerKey !== 'auto' && !serverOptions.some(s => s.key === selectedServerKey)) {
      setSelectedServerKey('auto');
    }
  }, [serverOptions, selectedServerKey]);

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

    const langCode = selectedLangCode;
    const noSourceInLang: Episode[] = []; // chosen language had no downloadable source
    const allServersFailed: Episode[] = []; // sources existed but every server failed

    for (const ep of episodesToDownload) {
      const { sources, headers } = await resolveEpisodeCached(ep);

      // Restrict to the chosen language (strict — never silently cross languages).
      let candidates = langCode ? sources.filter(s => s.langCode === langCode) : sources;
      if (langCode && candidates.length === 0) { noSourceInLang.push(ep); continue; }

      // Chosen server first, then cascade through the rest by priority.
      if (selectedServerKey && selectedServerKey !== 'auto') {
        candidates = [
          ...candidates.filter(s => s.serverKey === selectedServerKey),
          ...candidates.filter(s => s.serverKey !== selectedServerKey),
        ];
      }

      let started = false;
      if (candidates.length === 0) {
        // Nothing structured came back — fall back to the manager's own resolve.
        const res = await startDownload({
          episodeId: ep.episodeId, animeName, episodeNumber: ep.number,
          posterUrl, url: '', headers, downloadPath: basePath || undefined,
          resolvedLanguage: langCode || undefined,
        });
        started = res.ok;
        if (!res.ok && res.reason === 'missing_stream_url') {
          toast.error(`Episode ${ep.number}: no stream URL`, {
            description: 'Open the episode once in the player, then retry.',
          });
        } else if (!res.ok) {
          toast.error(`Episode ${ep.number}: download failed`);
        }
      } else {
        for (const src of candidates) {
          const res = await startDownload({
            episodeId: ep.episodeId, animeName, episodeNumber: ep.number,
            posterUrl, url: src.url, headers, downloadPath: basePath || undefined,
            subtitles: src.subtitles?.length ? src.subtitles : undefined,
            resolvedLanguage: src.langCode || langCode || undefined,
          });
          if (res.ok) { started = true; break; }
        }
        if (!started) allServersFailed.push(ep);
      }
    }
    if (allServersFailed.length > 0) {
      toast.error(
        `${allServersFailed.length} episode${allServersFailed.length > 1 ? 's' : ''} failed on every server`,
        { description: langCode ? `Tried all ${getLanguageLabel(langCode)} servers.` : undefined },
      );
    }

    // Every server for the chosen language came up empty → offer another language.
    if (noSourceInLang.length > 0 && langCode) {
      const alt = languageOptions.find(l => l.code !== langCode);
      const count = noSourceInLang.length;
      toast.error(
        `No ${getLanguageLabel(langCode)} source for ${count} episode${count > 1 ? 's' : ''}`,
        alt ? {
          description: `Switch to ${alt.label} and try again?`,
          action: { label: `Use ${alt.label}`, onClick: () => setSelectedLangCode(alt.code) },
        } : undefined,
      );
    }

    setIsStarting(false);
  };

  if (!isOpen) return null;

  // Selection summary shown on the Start button.
  const selLangLabel = languageOptions.find(l => l.code === selectedLangCode)?.label;
  const selServerLabel = selectedServerKey === 'auto'
    ? 'Auto server'
    : (serverOptions.find(s => s.key === selectedServerKey)?.name || 'Auto server');
  const startSummary = [selLangLabel, selServerLabel].filter(Boolean).join(' · ');
  const showSourcePicker = isNative && (probing || languageOptions.length > 0 || (probed && !probing));

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
            <TabsContent value="episodes" className="mt-4 space-y-5">
              {/* Step 1 — pick episodes */}
              <section className="space-y-2.5">
                <StepHeader
                  n={1}
                  label="Select episodes"
                  hint={`${selectedIds.size}/${episodes.length}`}
                />
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Tap episodes to select'}
                  </span>
                  <Button variant="ghost" size="sm" onClick={selectAll} className="text-primary hover:text-primary/80 text-xs h-7 px-2">
                    {selectedIds.size === episodes.length ? 'Deselect all' : 'Select all'}
                  </Button>
                </div>

                <ScrollArea className="h-[220px] sm:h-[300px] rounded-xl border border-white/10 bg-white/[0.03]">
                  <div className="grid grid-cols-1 gap-1.5 p-1.5">
                    {episodes.map((ep) => {
                      const state = downloadStates[ep.episodeId];
                      const isSelected = selectedIds.has(ep.episodeId);
                      return (
                        <div
                          key={ep.episodeId}
                          onClick={() => state?.status !== 'downloading' && toggleEpisode(ep.episodeId)}
                          className={`flex items-center justify-between p-2 sm:p-2.5 rounded-lg border transition-all cursor-pointer ${
                            isSelected ? 'bg-primary/10 border-primary/30' : 'bg-white/[0.02] border-transparent hover:border-white/10'
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
              </section>

              {/* Step 2 — language (hard filter) + server (soft preference) */}
              {showSourcePicker && (
                <section className="space-y-2.5">
                  <StepHeader
                    n={2}
                    label="Language & server"
                    hint={probing ? 'Detecting…' : (languageOptions.length ? `${languageOptions.length} language${languageOptions.length > 1 ? 's' : ''}` : undefined)}
                  />

                  {probing ? (
                    <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/10 p-4 text-xs text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" /> Detecting available sources…
                    </div>
                  ) : languageOptions.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-xl bg-white/[0.03] border border-white/10 p-5 text-center">
                      <AlertCircle className="w-6 h-6 text-amber-500" />
                      <div>
                        <p className="text-sm font-medium">No sources detected</p>
                        <p className="text-xs text-muted-foreground mt-0.5">We'll still try every server when you start. Or probe again.</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setProbeNonce(n => n + 1)} className="h-8 gap-1.5 text-xs">
                        <RefreshCw className="w-3.5 h-3.5" /> Retry detection
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-xl bg-white/[0.03] border border-white/10 p-3">
                      <div>
                        <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
                          <Languages className="w-3.5 h-3.5" /> Language <span className="text-[10px] opacity-70">(applies to all episodes)</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {languageOptions.map(l => (
                            <button
                              key={l.code}
                              onClick={() => setSelectedLangCode(l.code)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                selectedLangCode === l.code
                                  ? 'bg-primary text-white border-primary'
                                  : 'bg-white/5 border-white/10 hover:border-white/20'
                              }`}
                            >
                              {l.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {serverOptions.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
                            <Server className="w-3.5 h-3.5" /> Server <span className="text-[10px] opacity-70">(preferred — falls back automatically)</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => setSelectedServerKey('auto')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                selectedServerKey === 'auto'
                                  ? 'bg-primary text-white border-primary'
                                  : 'bg-white/5 border-white/10 hover:border-white/20'
                              }`}
                            >
                              Auto
                            </button>
                            {serverOptions.map(s => (
                              <button
                                key={s.key}
                                onClick={() => setSelectedServerKey(s.key)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                  selectedServerKey === s.key
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-white/5 border-white/10 hover:border-white/20'
                                }`}
                              >
                                {s.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              <div className="flex items-center text-[10px] sm:text-xs text-muted-foreground px-1">
                <FolderOpen className="w-3 h-3 flex-shrink-0 mr-1" />
                <span className="truncate">{downloadPath || 'App Storage'}</span>
              </div>

              <Button
                onClick={handleDownload}
                disabled={selectedIds.size === 0 || isStarting}
                className="w-full h-14 sm:h-16 rounded-xl sm:rounded-2xl font-bold glow-primary flex-col gap-0.5"
              >
                {isStarting ? (
                  <span className="flex items-center text-base sm:text-lg"><Loader2 className="w-5 h-5 mr-2 animate-spin" />Starting downloads…</span>
                ) : (
                  <>
                    <span className="flex items-center text-base sm:text-lg">
                      <Play className="w-4 h-4 mr-2 fill-current" />
                      {selectedIds.size > 0 ? `Download ${selectedIds.size} episode${selectedIds.size > 1 ? 's' : ''}` : 'Select episodes'}
                    </span>
                    {selectedIds.size > 0 && startSummary && (
                      <span className="text-[11px] font-normal opacity-80">{startSummary}</span>
                    )}
                  </>
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
