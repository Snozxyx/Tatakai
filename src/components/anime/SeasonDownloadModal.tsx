import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Download, X, CheckCircle2, Circle, FolderOpen, AlertCircle,
  Bot, Loader2, RefreshCw, Play, Languages, Server, ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDownload } from '@/hooks/media/useDownload';
import { useIsNativeApp, useIsDesktopApp, useIsMobileApp } from '@/hooks/ui/useIsNativeApp';
import { normalizeLanguage, getLanguageLabel } from '@/core/download/language-resolver';
import { getSimpleServerDisplayName } from '@/lib/serverNames';
import { fetchEpisodeServers } from '@/lib/api';
import type { EpisodeServer } from '@/types/anime';
import {
  resolveExtensionApiBase,
  streamExtensionSources,
} from '@/hooks/media/useExtensionSourceStream';
import { hasTorrentService, isCapacitor } from '@/lib/platform/platform';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';

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
  originalUrl?: string;
  headers?: unknown;
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
  headers?: Record<string, string>;
  originalUrl?: string;
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
    out.push({
      url,
      lang: langCode,
      label: String(t?.label || rawLang),
      originalUrl: t?.originalUrl ? String(t.originalUrl) : undefined,
      headers: t?.headers,
    });
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
  return !/\.(?:m3u8|mp4|m4v|webm|mkv)(?:$|[?#/])/i.test(String(src.url || ''));
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
function normalizeDlSources(resolved: any, fallbackCategory = 'sub', allowTorrent = true): DlSource[] {
  const raw: any[] = Array.isArray(resolved?.sources) ? resolved.sources : [];
  const out: DlSource[] = [];
  raw.forEach((src) => {
    const url = String(src?.url || '').trim();
    if (!url) return;
    const torrent = isTorrentSrc(src);
    if (torrent && !allowTorrent) return;
    if (isEmbedSrc(src) && !torrent) return; // embeds aren't downloadable
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
      isTorrent: torrent,
      quality: src.quality ? String(src.quality) : undefined,
      providerPriority: Number.isFinite(src?.providerPriority)
        ? Number(src.providerPriority)
        : Number.MAX_SAFE_INTEGER,
      subtitles: extractSubtitles(src),
      headers: src.headers && typeof src.headers === 'object' ? src.headers : undefined,
      originalUrl: src.originalUrl ? String(src.originalUrl) : undefined,
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
  const allowTorrent = hasTorrentService();

  // Register cached mobile extensions before probing. The app startup already
  // does this, but awaiting the deduped initializer here also covers deep links
  // that open the dialog during the first native frame.
  if (isCapacitor()) {
    try {
      const { initMobileExtensions } = await import('@/core/extensions/mobile/mobileExtensionInstaller');
      await initMobileExtensions();
    } catch {
      /* the runtime fallback below may still resolve a source */
    }
  }

  // 1. Reliable path: fan out through every mounted stream-capable extension.
  try {
    const base = await resolveExtensionApiBase(isCapacitor());
    const namespaces = (base.namespaces || [])
      .filter((ns) => {
        const routes = ns.routes || [];
        return routes.includes('sources') || routes.includes('stream');
      })
      .map((ns) => ns.namespace);
    if (!namespaces.length) namespaces.push('toko');
    const params = {
      anilistId: anilistId ?? undefined,
      titles: animeName ? [animeName] : undefined,
      episode: episodeNumber,
      resolution: '1080p',
      preferredLanguage: category,
      route: 'sources' as const,
    };
    const settled = await Promise.allSettled(
      [...new Set(namespaces)].map((namespace) => streamExtensionSources(namespace, params)),
    );
    const streamed = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    const dl = normalizeDlSources({ sources: streamed }, category, allowTorrent);
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
    return { sources: normalizeDlSources(resolved, category, allowTorrent), headers: (resolved as any)?.headers };
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
      <div className={`rounded-2xl p-5 border transition-colors ${isSubscribed
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
  const [step, setStep] = useState<'series' | 'episodes' | 'server'>('series');
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
  // WatchPage-method server list: per-episode dispatch servers (same call the
  // watch page renders), unioned across the sampled episodes.
  const [dispatchServers, setDispatchServers] = useState<EpisodeServer[]>([]);
  const [selectedLangCode, setSelectedLangCode] = useState<string>('');
  const [selectedServerKey, setSelectedServerKey] = useState<string>('auto');

  /**
   * A dispatch server matches a probed/downloadable source when any of the
   * server's identities equals the source's server key (same comparison the
   * watch page uses to pair servers with sources).
   */
  const serverMatchesSource = (server: EpisodeServer, serverKey: string): boolean => {
    const key = String(serverKey || '').trim().toLowerCase();
    if (!key) return false;
    const ids = [server.serverName, server.providerKey, server.providerName]
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean);
    if (ids.includes(key)) return true;
    const base = (s: string) => s.split('-')[0];
    return ids.some((id) => base(id) === base(key));
  };

  const languageOptions = useMemo(() => {
    const m = new Map<string, string>();
    probeSources.forEach(s => { if (!m.has(s.langCode)) m.set(s.langCode, s.langLabel); });
    return Array.from(m, ([code, label]) => ({ code, label }));
  }, [probeSources]);

  const serverOptions = useMemo(() => {
    // WatchPage method: dedupe by serverName, rank by the extension's
    // providerPriority (stable), display via the same label helper.
    const seen = new Map<string, EpisodeServer>();
    for (const server of dispatchServers) {
      const norm = String(server?.serverName || '').trim().toLowerCase();
      if (!norm || seen.has(norm)) continue;
      seen.set(norm, server);
    }
    let ranked = [...seen.values()]
      .map((server, idx) => ({ server, idx }))
      .sort((a, b) => {
        const pa = Number.isFinite((a.server as any)?.providerPriority)
          ? Number((a.server as any).providerPriority)
          : Number.MAX_SAFE_INTEGER;
        const pb = Number.isFinite((b.server as any)?.providerPriority)
          ? Number((b.server as any).providerPriority)
          : Number.MAX_SAFE_INTEGER;
        return pa === pb ? a.idx - b.idx : pa - pb;
      })
      .map(({ server }) => server);
    // Same noise filter as the watch page: hide the plain TatakaiAPI row when
    // provider servers exist.
    if (ranked.length > 1) {
      const filtered = ranked.filter((s) => {
        const label = getSimpleServerDisplayName(s.serverName, s.displayName || s.providerName || s.serverName);
        return s.isProviderServer || label !== 'TatakaiAPI';
      });
      if (filtered.length > 0) ranked = filtered;
    }
    const fromDispatch = ranked.map((server) => {
      const name = getSimpleServerDisplayName(server.serverName, server.displayName || server.providerName || server.serverName);
      let hasHls = false;
      let hasTorrent = false;
      for (const s of probeSources) {
        if (!serverMatchesSource(server, s.serverKey)) continue;
        if (s.isTorrent) hasTorrent = true; else hasHls = true;
      }
      return { key: server.serverName, name, hasHls, hasTorrent };
    });
    if (fromDispatch.length > 0) return fromDispatch;
    // Dispatch unreachable (offline/backend down): fall back to the probed
    // source enumeration so the picker still offers something.
    const m = new Map<string, { name: string; hasHls: boolean; hasTorrent: boolean }>();
    probeSources
      .filter(s => !selectedLangCode || s.langCode === selectedLangCode)
      .forEach(s => {
        const entry = m.get(s.serverKey) || { name: s.serverName, hasHls: false, hasTorrent: false };
        if (s.isTorrent) entry.hasTorrent = true; else entry.hasHls = true;
        m.set(s.serverKey, entry);
      });
    return Array.from(m, ([key, v]) => ({ key, name: getSimpleServerDisplayName(key, v.name), hasHls: v.hasHls, hasTorrent: v.hasTorrent }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchServers, probeSources, selectedLangCode]);

  // Sample episodes (first / middle / last) for server discovery: different
  // episodes are often served by different hosts, so probing only episodes[0]
  // hid servers that only carry later episodes — especially on mobile where
  // the picker must show ALL HLS servers up front.
  const sampleEpisodes = useMemo(() => {
    if (episodes.length === 0) return [];
    const picks = [episodes[0], episodes[Math.floor(episodes.length / 2)], episodes[episodes.length - 1]];
    const seen = new Set<string>();
    return picks.filter((ep) => {
      if (seen.has(ep.episodeId)) return false;
      seen.add(ep.episodeId);
      return true;
    });
  }, [episodes]);
  const representativeId = sampleEpisodes.map((e) => e.episodeId).join('|');

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
    if (isOpen) {
      // Always start the wizard on the series step when (re)opened.
      setStep('series');
    }
  }, [isOpen, isDesktop, isMobile]);

  // Probe the sampled episodes to discover available languages & servers.
  // Two enumerations run together, exactly like the watch page:
  //  1. dispatch servers (`fetchEpisodeServers`, the watch page's own call)
  //     → the server picker list, unioned across sampled episodes;
  //  2. downloadable sources (extension fan-out) → language options,
  //     HLS/Torrent badges, and the actual download URLs.
  // Sequential source probing on every platform: overlapping provider batches
  // starve the WebView on mobile and hammer hosts on desktop. Dispatch calls
  // are cheap metadata POSTs and run in parallel.
  useEffect(() => {
    if (!isOpen || !isNative || sampleEpisodes.length === 0) return;
    let cancelled = false;
    setProbing(true);
    // Local timeout so a hanging backend/SSE stream can never leave the
    // picker on "Detecting…" forever — every path below settles.
    const withProbeTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      });
      return Promise.race([promise, timeout]).finally(() => {
        if (timer) clearTimeout(timer);
      }) as Promise<T>;
    };
    // 1. WatchPage-method server list (per-episode dispatch, sub+dub).
    void Promise.allSettled(
      sampleEpisodes.map((ep) =>
        withProbeTimeout(fetchEpisodeServers(ep.episodeId), 12000, 'Server list').catch(() => ({ sub: [], dub: [] })),
      ),
    ).then((settled) => {
      if (cancelled) return;
      const union: EpisodeServer[] = [];
      const seen = new Set<string>();
      for (const r of settled) {
        if (r.status !== 'fulfilled') continue;
        for (const s of [...(r.value?.sub || []), ...(r.value?.dub || [])]) {
          const norm = String(s?.serverName || '').trim().toLowerCase();
          if (!norm || seen.has(norm)) continue;
          seen.add(norm);
          union.push(s);
        }
      }
      setDispatchServers(union);
      // Seed the preferred server from the global default when a detected
      // server shares its base provider key (watch page seeds the same way).
      const savedServerBase = (localStorage.getItem('tatakai_default_server') || '').split('-')[0];
      if (savedServerBase) {
        const match = union.find((s) =>
          [s.serverName, s.providerKey].some((v) => String(v || '').split('-')[0] === savedServerBase),
        );
        if (match) setSelectedServerKey((prev) => (prev === 'auto' ? match.serverName : prev));
      }
    }).catch(() => {
      /* dispatch down — probe-source fallback still lists servers */
    });
    (async () => {
      try {
        const merged: DlSource[] = [];
        const seenUrls = new Set<string>();
        for (const rep of sampleEpisodes) {
          if (cancelled) break;
          try {
            const { sources } = await withProbeTimeout(resolveEpisodeCached(rep), 25000, 'Source probe');
            for (const s of sources) {
              if (!seenUrls.has(s.url)) {
                seenUrls.add(s.url);
                merged.push(s);
              }
            }
          } catch {
            /* one dead sample must not kill discovery */
          }
        }
        if (cancelled) return;
        setProbeSources(merged);
      // Honor the user's global preferred language (Auto-Download settings)
      // when it's among the detected languages; otherwise keep the current
      // pick if still valid, else fall back to the first available.
      const savedLang = normalizeLanguage(localStorage.getItem('tatakai_default_language') || '');
      const firstLang = merged[0]?.langCode || '';
      setSelectedLangCode(prev => {
        if (savedLang && merged.some(s => s.langCode === savedLang)) return savedLang;
        if (prev && merged.some(s => s.langCode === prev)) return prev;
        return firstLang;
      });
      if (!cancelled) { setProbing(false); setProbed(true); }
      } catch {
        // Unexpected failure above must still settle the picker (the chained
        // .catch below is the final backstop).
        if (!cancelled) { setProbing(false); setProbed(true); }
        throw new Error('probe failed');
      }
    })().catch(() => {
      // Never leave the picker stuck on "Detecting…" — show whatever (if
      // anything) resolved, or the empty state with a retry button.
      if (!cancelled) { setProbing(false); setProbed(true); }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isNative, representativeId, resolveEpisodeCached, probeNonce]);

  // Warm up resolution for selected episodes in the background so Start is
  // instant. Capped count + low concurrency so we don't hammer the host.
  useEffect(() => {
    // Desktop resolution lives in a separate process and can safely pre-warm.
    // On mobile it runs inside this WebView; pre-warming 24 episodes launches
    // overlapping provider batches and starves both the visible probe and the
    // video player. Resolve the representative episode only, then resolve each
    // selected episode on demand when Start is pressed.
    if (!isOpen || !isNative || isMobile) return;
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
  }, [isOpen, isNative, isMobile, selectedIds, resolveEpisodeCached]);

  // Keep the chosen server valid as the language (and thus server list) changes.
  useEffect(() => {
    if (selectedServerKey !== 'auto' && !serverOptions.some(s => s.key === selectedServerKey)) {
      setSelectedServerKey('auto');
    }
  }, [serverOptions, selectedServerKey]);

  const toggleEpisode = (id: string) => {
    void triggerHaptic('select');
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    void triggerHaptic('select');
    if (selectedIds.size === episodes.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(episodes.map(e => e.episodeId)));
  };

  const handleDownload = async () => {
    void triggerHaptic('medium');
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
    let startedCount = 0;

    for (const ep of episodesToDownload) {
      const { sources, headers } = await resolveEpisodeCached(ep);

      // Restrict to the chosen language (strict — never silently cross languages).
      let candidates = langCode ? sources.filter(s => s.langCode === langCode) : sources;
      if (langCode && candidates.length === 0) { noSourceInLang.push(ep); continue; }

      // Chosen server first, then cascade through the rest by priority.
      // The choice is a watch-page dispatch server; probed sources are paired
      // to it the same way the player pairs servers with sources.
      if (selectedServerKey && selectedServerKey !== 'auto') {
        const sel = selectedServerKey.toLowerCase();
        const chosen = dispatchServers.find(
          (s) => String(s.serverName || '').trim().toLowerCase() === sel,
        );
        const matches = (s: DlSource) => chosen
          ? serverMatchesSource(chosen, s.serverKey)
          : String(s.serverKey || '').trim().toLowerCase() === sel;
        candidates = [
          ...candidates.filter(matches),
          ...candidates.filter((s) => !matches(s)),
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
            posterUrl,
            url: src.url,
            originalUrl: src.originalUrl,
            headers: src.headers || headers,
            downloadPath: basePath || undefined,
            subtitles: src.subtitles?.length ? src.subtitles : undefined,
            resolvedLanguage: src.langCode || langCode || undefined,
          });
          if (res.ok) { started = true; break; }
        }
        if (!started) allServersFailed.push(ep);
      }
      if (started) startedCount++;
    }
    if (startedCount > 0) void triggerHaptic('success');
    else if (episodesToDownload.length > 0) void triggerHaptic('error');
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

  // Portal to <body>: page trees contain transformed ancestors (animations,
  // parallax) that turn `position: fixed` into page-relative positioning —
  // the sheet would land mid-page instead of on the visible screen.
  const sheet = (
    <div className={`fixed z-[100] flex justify-center bg-black/80 backdrop-blur-sm animate-in fade-in ${isDesktop ? 'items-center inset-x-0 top-[32px] bottom-0 p-2 sm:p-4' : 'items-end sm:items-center inset-0 p-0 sm:p-4'}`}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Download ${animeName}`}
        className="w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[90vh] overflow-hidden flex flex-col"
      >
        <GlassPanel className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-2xl rounded-b-none sm:rounded-b-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Download className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              Download
            </h2>
            <button
              type="button"
              aria-label="Close download dialog"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Wizard steps: 1 series → 2 episodes → 3 server */}
          <div className="flex items-center gap-2 px-0.5" aria-label="Download steps">
            {(['series', 'episodes', 'server'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className="h-px w-6 bg-white/15" />}
                <button
                  type="button"
                  disabled={s !== 'series' && !(s === 'episodes' && step === 'server')}
                  onClick={() => {
                    if (s === 'series') setStep('series');
                    else if (s === 'episodes' && step === 'server') setStep('episodes');
                  }}
                  className={`flex items-center gap-1.5 text-[11px] font-semibold ${step === s ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step === s ? 'bg-primary text-white' : 'bg-white/10'}`}>
                    {i + 1}
                  </span>
                  {s === 'series' ? 'Series' : s === 'episodes' ? 'Episodes' : 'Server'}
                </button>
              </div>
            ))}
          </div>

          {step === 'series' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                {posterUrl ? (
                  <img src={posterUrl} alt={`${animeName} poster`} className="h-24 w-16 shrink-0 rounded-xl object-cover shadow-md" loading="lazy" />
                ) : (
                  <span className="flex h-24 w-16 shrink-0 items-center justify-center rounded-xl bg-primary/15"><Play className="h-7 w-7 text-primary" /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold">{animeName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {episodes.length} episode{episodes.length === 1 ? '' : 's'} available
                    {isMobile ? ' · downloads as MP4' : ''}
                  </p>
                  <div className="mt-1.5 flex items-center text-[11px] text-muted-foreground">
                    <FolderOpen className="mr-1 h-3 w-3 shrink-0" />
                    <span className="truncate">{downloadPath || 'App Storage'}</span>
                  </div>
                </div>
              </div>
              <p className="px-1 text-xs text-muted-foreground">
                Next: pick episodes, then the language and server to download from.
              </p>
              <Button
                onClick={() => { void triggerHaptic('tap'); setStep('episodes'); }}
                disabled={episodes.length === 0 || !isNative}
                className="w-full h-12 rounded-xl font-bold"
              >
                <span className="flex items-center">Choose episodes <Play className="ml-2 h-4 w-4 fill-current" /></span>
              </Button>
            </div>
          ) : null}
          {step === 'episodes' && (
          <>
          <div className="flex items-center px-0.5 -mb-2">
            <Button variant="ghost" size="sm" onClick={() => { void triggerHaptic('tap'); setStep('series'); }} className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-3.5 w-3.5" /> Series
            </Button>
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
              {/* Step 2 — pick episodes */}
              <section className="space-y-2.5">
                <StepHeader
                  n={2}
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

                <ScrollArea className="h-[32dvh] sm:h-[300px] min-h-[180px] rounded-xl border border-white/10 bg-white/[0.03]">
                  <div className="grid grid-cols-1 gap-1.5 p-1.5">
                    {episodes.map((ep) => {
                      const state = downloadStates[ep.episodeId];
                      const isSelected = selectedIds.has(ep.episodeId);
                      return (
                        <div
                          key={ep.episodeId}
                          onClick={() => state?.status !== 'downloading' && toggleEpisode(ep.episodeId)}
                          className={`flex items-center justify-between p-2 sm:p-2.5 rounded-lg border transition-colors cursor-pointer ${
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
                                    <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${state.progress}%` }} />
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

              <Button
                onClick={() => { void triggerHaptic('tap'); setStep('server'); }}
                disabled={selectedIds.size === 0}
                className="sticky bottom-[max(0px,env(safe-area-inset-bottom))] z-20 w-full h-14 sm:h-16 rounded-xl sm:rounded-2xl font-bold glow-primary flex-col gap-0.5 shadow-[0_-18px_36px_hsl(var(--background))]"
              >
                <span className="flex items-center text-base sm:text-lg">
                  {selectedIds.size > 0 ? `Continue with ${selectedIds.size} episode${selectedIds.size > 1 ? 's' : ''}` : 'Select episodes'}
                  <ChevronLeft className="ml-2 h-5 w-5 rotate-180" />
                </span>
              </Button>
            </TabsContent>


            {/* Auto-download tab */}
            <TabsContent value="auto" className="mt-4">
              <AutoDownloadTab animeId={animeId} animeName={animeName} episodes={episodes} />
            </TabsContent>
          </Tabs>
          </>
          )}
          {step === 'server' && (
          <>
          <div className="flex items-center px-0.5">
            <Button variant="ghost" size="sm" onClick={() => { void triggerHaptic('tap'); setStep('episodes'); }} className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-3.5 w-3.5" /> Episodes
            </Button>
          </div>

              {/* Step 3 — language (hard filter) + server (soft preference) */}
              {showSourcePicker && (
                <section className="space-y-2.5">
                  <StepHeader
                    n={3}
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
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
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
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
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
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                  selectedServerKey === s.key
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-white/5 border-white/10 hover:border-white/20'
                                }`}
                              >
                                {s.name}
                                {s.hasHls && !s.hasTorrent && (
                                  <span className={`rounded px-1 text-[9px] font-bold ${selectedServerKey === s.key ? 'bg-white/20' : 'bg-emerald-500/15 text-emerald-300'}`}>HLS</span>
                                )}
                                {s.hasTorrent && !s.hasHls && (
                                  <span className={`rounded px-1 text-[9px] font-bold ${selectedServerKey === s.key ? 'bg-white/20' : 'bg-amber-500/15 text-amber-300'}`}>TORRENT</span>
                                )}
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
                className="sticky bottom-[max(0px,env(safe-area-inset-bottom))] z-20 w-full h-14 sm:h-16 rounded-xl sm:rounded-2xl font-bold glow-primary flex-col gap-0.5 shadow-[0_-18px_36px_hsl(var(--background))]"
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
          </>
          )}
        </GlassPanel>
      </div>
    </div>
  );
  if (typeof document === 'undefined') return sheet;
  return createPortal(sheet, document.body);
};
