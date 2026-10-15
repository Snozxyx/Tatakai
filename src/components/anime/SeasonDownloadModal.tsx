import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { autoDownloadApi } from '@/core/download/automation-engine';
import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { availableDownloadEpisodes } from '@/lib/episodeAvailability';
import { createSourceRequestCache } from '@/lib/cache/sourceRequestCache';
import { queryClient } from '@/lib/queryClient';

interface Episode {
  episodeId: string;
  number: number;
  title?: string;
  hasAired?: boolean;
  airDateUtc?: string;
  airDate?: string;
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

type ResolvedDownloadSources = { sources: DlSource[]; headers?: Record<string, string> };
const downloadSourceCache = createSourceRequestCache<ResolvedDownloadSources>();
const downloadServerCache = createSourceRequestCache<{ sub: EpisodeServer[]; dub: EpisodeServer[] }>();

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
    if (code === 'ja') return uiI18n.t('app.japanese_9239c22d');
    if (code === 'en') return uiI18n.t('app.english_649df08a');
    return DUB_LABELS[code] || code.toUpperCase();
  }
  return fallbackCategory || uiI18n.t('app.japanese_9239c22d');
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
async function resolveEpisode(episodeId: string, animeName: string, episodeNumber: number, anilistId?: number | null, malId?: number | null, category = 'sub', onSources?: (value: ResolvedDownloadSources) => void): Promise<ResolvedDownloadSources> {
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
    // 25s matches the probe's per-sample budget below, so slow providers
    // survive the mobile batch cap instead of being truncated.
    const progressive = new Map<string, any[]>();
    const settled = await Promise.allSettled(
      [...new Set(namespaces)].map((namespace) => streamExtensionSources(namespace, params, 15000, sources => {
        progressive.set(namespace, sources);
        onSources?.({ sources: normalizeDlSources({ sources: [...progressive.values()].flat() }, category, allowTorrent) });
      })),
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


/**
 * Outer timeout so one wedged resolution can never pin the Start button on
 * "Starting downloads…" forever — expiry is treated like an empty result,
 * which flows into the existing per-episode error toasts below.
 */
function withStartTimeout<T>(promise: Promise<T>, ms = 45000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(uiI18n.t('app.source_resolution_timed_out_2f092bb9'))), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/** Numbered step header used to walk the user through the download flow. */
function StepHeader({ n, label, hint }: { n: number; label: string; hint?: string }) {
  useUiTranslation();
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
  anilistId,
  episodes: allEpisodes,
}: {
  animeId?: string;
  animeName: string;
  anilistId?: number | null;
  episodes: Episode[];
}) {
  useUiTranslation();
  const episodes = useMemo(() => availableDownloadEpisodes(allEpisodes), [allEpisodes]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const electron = { autoDownload: autoDownloadApi };

  useEffect(() => {
    if (!animeId || !electron?.autoDownload?.list) { setLoading(false); return; }
    electron.autoDownload.list().then((list: any[]) => {
      const found = Array.isArray(list) && list.some((item: any) => item.animeId === animeId || item.id === animeId);
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
        toast.success(uiI18n.t('app.auto_download_disabled_for_i18n_value_0_5091e1f7', { value0: animeName }));
      } else {
        // Subscribe with next episode = last episode + 1, or ep 1 if none
        const lastEp = episodes.length > 0
          ? Math.max(...episodes.map(e => e.number))
          : 0;
        const nextEp = lastEp + 1;
        await electron.autoDownload.subscribe(animeId, animeName, nextEp, anilistId);
        setIsSubscribed(true);
        toast.success(uiI18n.t('app.auto_download_enabled_for_i18n_value_0_from_epis_39b53d22', { value0: animeName, value1: nextEp }));
      }
    } catch (err: any) {
      toast.error(err?.message || uiI18n.t('app.failed_to_update_auto_download_855d3a93'));
    } finally {
      setToggling(false);
    }
  };

  if (!electron?.autoDownload) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
        <Bot className="w-10 h-10 text-muted-foreground opacity-30" />
        <p className="text-muted-foreground text-sm">{uiI18n.t('app.auto_download_requires_the_tatakai_desktop_app_d9c3f5ce')}</p>
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
                {isSubscribed ? uiI18n.t('app.auto_download_active_84250a51') : uiI18n.t('app.auto_download_inactive_5268f051')}
              </p>
              <p className="text-xs text-muted-foreground">
                {isSubscribed
                  ? uiI18n.t('app.will_auto_download_new_episodes_from_ep_i18n_val_3a38ce6b', { value0: nextEp })
                  : uiI18n.t('app.new_episodes_will_not_be_downloaded_automaticall_10960666')}
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
            {toggling ? 'Updating...' : isSubscribed ? uiI18n.t('app.disable_9a7d4e06') : uiI18n.t('app.enable_20063ad9')}
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="space-y-3 text-sm text-muted-foreground">
        <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
          <Play className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-foreground">{uiI18n.t('app.how_it_works_1dd6a17c')}</p>
            <p className="text-xs mt-1 leading-relaxed">
              {uiI18n.t('app.when_enabled_the_app_automatically_downloads_new_2d053fd3')}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
          <Download className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-foreground">{uiI18n.t('app.current_series_status_1d03e3b9')}</p>
            <p className="text-xs mt-1">
              {episodes.length} {uiI18n.t('app.episode_39ae6b3c')}{episodes.length !== 1 ? 's' : ''} {uiI18n.t('app.available_7b231a50')}
              {lastEp > 0 && uiI18n.t('app.latest_is_episode_i18n_value_0_a41027c1', { value0: lastEp })}
              {isSubscribed && uiI18n.t('app.auto_download_will_start_from_episode_i18n_value_ea326f70', { value0: nextEp })}
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
  episodes: allEpisodes,
  animeName,
  posterUrl,
  animeId,
  anilistId,
  malId,
}: SeasonDownloadModalProps) => {
  useUiTranslation();
  const episodes = useMemo(() => availableDownloadEpisodes(allEpisodes), [allEpisodes]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const available = new Set(episodes.map(episode => episode.episodeId));
    setSelectedIds(previous => new Set([...previous].filter(id => available.has(id))));
  }, [episodes]);
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
  const sourceCacheKey = useCallback((ep: Episode, category = 'sub') => JSON.stringify([animeId, anilistId, malId, animeName, ep.episodeId, ep.number, category, hasTorrentService()]), [animeId, anilistId, malId, animeName]);
  const resolveEpisodeCached = useCallback(
    (ep: Episode, category = 'sub', onSources?: (value: ResolvedDownloadSources) => void, language?: string) => {
      const key = sourceCacheKey(ep, category);
      const known = downloadSourceCache.peek(key);
      // Starting a download can use the first usable arrival while discovery
      // continues filling the picker with slower providers.
      if (!onSources && known?.sources.some(source => !language || source.langCode === language)) return Promise.resolve(known);
      return downloadSourceCache.get(key, publish => withStartTimeout(resolveEpisode(ep.episodeId, animeName, ep.number, anilistId, malId, category, publish), 20000), value => value.sources.length > 0, onSources);
    },
    [animeName, anilistId, malId, sourceCacheKey],
  );

  useEffect(() => { setProbed(false); setProbeSources([]); setDispatchServers([]); }, [representativeId, sourceCacheKey]);


  useEffect(() => {
    if (isOpen && !isNative) {
      toast.error(uiI18n.t('app.downloads_are_only_available_in_the_native_mobil_bcdbbbef'));
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
        timer = setTimeout(() => reject(new Error(uiI18n.t('app.i18n_value_0_timed_out_38d278ca', { value0: label }))), ms);
      });
      return Promise.race([promise, timeout]).finally(() => {
        if (timer) clearTimeout(timer);
      }) as Promise<T>;
    };
    // 1. WatchPage-method server list (per-episode dispatch, sub+dub).
    void Promise.allSettled(
      sampleEpisodes.map((ep) =>
        downloadServerCache.get(ep.episodeId, () => withProbeTimeout(queryClient.fetchQuery({
          queryKey: ['servers', ep.episodeId], queryFn: () => fetchEpisodeServers(ep.episodeId), staleTime: 5 * 60_000,
        }), 12000, 'Server list'), value => value.sub.length + value.dub.length > 0).catch(() => ({ sub: [], dub: [] })),
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
        const publishSources = ({ sources }: ResolvedDownloadSources) => {
          if (cancelled) return;
          for (const source of sources) {
            if (!seenUrls.has(source.url)) { seenUrls.add(source.url); merged.push(source); }
          }
          if (merged.length === 0) return;
          setProbeSources([...merged]);
          const savedLang = normalizeLanguage(localStorage.getItem('tatakai_default_language') || '');
          setSelectedLangCode(prev => savedLang && merged.some(s => s.langCode === savedLang) ? savedLang
            : prev && merged.some(s => s.langCode === prev) ? prev : merged[0].langCode);
        };
        for (const rep of sampleEpisodes) {
          if (cancelled) break;
          try {
            publishSources(await withProbeTimeout(resolveEpisodeCached(rep, 'sub', publishSources), 18000, 'Source probe'));
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
        throw new Error(uiI18n.t('app.probe_failed_e9e43068'));
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
    if (!isOpen || !isNative || isMobile || probing || step !== 'server') return;
    let cancelled = false;
    const pending = episodes
      .filter(e => selectedIds.has(e.episodeId) && !downloadSourceCache.has(sourceCacheKey(e)))
      .slice(0, 2);
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
  }, [isOpen, isNative, isMobile, selectedIds, resolveEpisodeCached, probing, step, sourceCacheKey]);

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
      toast.error(uiI18n.t('app.pick_a_download_folder_5bd13774'), {
        get description() { return uiI18n.t('app.complete_setup_or_choose_a_folder_in_desktop_set_42fd1b42'); },
      });
      setIsStarting(false);
      return;
    }

    const langCode = selectedLangCode;
    const noSourceInLang: Episode[] = []; // chosen language had no downloadable source
    const allServersFailed: Episode[] = []; // sources existed but every server failed
    let startedCount = 0;

    for (const ep of episodesToDownload) {
      let sources: DlSource[] = [];
      let headers: Record<string, string> | undefined;
      try {
        ({ sources, headers } = await withStartTimeout(resolveEpisodeCached(ep, 'sub', undefined, langCode)));
      } catch {
        toast.error(uiI18n.t('app.episode_i18n_value_0_source_lookup_timed_out_40f13639', { value0: ep.number }), {
          get description() { return uiI18n.t('app.the_providers_are_slow_right_now_retry_in_a_mome_e907d481'); },
        });
        continue;
      }

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
          toast.error(uiI18n.t('app.episode_i18n_value_0_no_stream_url_a13a4306', { value0: ep.number }), {
            get description() { return uiI18n.t('app.open_the_episode_once_in_the_player_then_retry_b3ce5ff6'); },
          });
        } else if (!res.ok) {
          toast.error(uiI18n.t('app.episode_i18n_value_0_download_failed_e4d280ec', { value0: ep.number }));
        }
      } else {
        for (const src of candidates) {
          const res = await startDownload({
            episodeId: ep.episodeId, animeName, episodeNumber: ep.number,
            posterUrl,
            anilistId,
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
        uiI18n.t('app.i18n_value_0_episodei18n_value_1_failed_on_every_b468740f', { value0: allServersFailed.length, value1: allServersFailed.length > 1 ? 's' : '' }),
        { description: langCode ? `Tried all ${getLanguageLabel(langCode)} servers.` : undefined },
      );
    }

    // Every server for the chosen language came up empty → offer another language.
    if (noSourceInLang.length > 0 && langCode) {
      const alt = languageOptions.find(l => l.code !== langCode);
      const count = noSourceInLang.length;
      toast.error(
        uiI18n.t('app.no_i18n_value_0_source_for_i18n_value_1_episodei_ded5ca5e', { value0: getLanguageLabel(langCode), value1: count, value2: count > 1 ? 's' : '' }),
        alt ? {
          get description() { return uiI18n.t('app.switch_to_i18n_value_0_and_try_again_6a99cf22', { value0: alt.label }); },
          action: { get label() { return uiI18n.t('app.use_i18n_value_0_920bdc2e', { value0: alt.label }); }, onClick: () => setSelectedLangCode(alt.code) },
        } : undefined,
      );
    }

    setIsStarting(false);
  };

  if (!isOpen) return null;

  // Selection summary shown on the Start button.
  const selLangLabel = languageOptions.find(l => l.code === selectedLangCode)?.label;
  const selServerLabel = selectedServerKey === 'auto'
    ? uiI18n.t('app.auto_server_06a41b20')
    : (serverOptions.find(s => s.key === selectedServerKey)?.name || uiI18n.t('app.auto_server_06a41b20'));
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
        aria-label={uiI18n.t('app.download_i18n_value_0_741a37b3', { value0: animeName })}
        className="w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[90vh] overflow-hidden flex flex-col"
      >
        <GlassPanel className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-2xl rounded-b-none sm:rounded-b-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Download className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              {uiI18n.t('app.download_a479c9c3')}
            </h2>
            <button
              type="button"
              aria-label={uiI18n.t('app.close_download_dialog_ecb600ec')}
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Wizard steps: 1 series → 2 episodes → 3 server */}
          <div className="flex items-center gap-2 px-0.5" aria-label={uiI18n.t('app.download_steps_5d85107f')}>
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
                  {s === 'series' ? uiI18n.t('app.series_40c20d94') : s === 'episodes' ? uiI18n.t('app.episodes_49d641ba') : uiI18n.t('app.server_cb0cb170')}
                </button>
              </div>
            ))}
          </div>

          {step === 'series' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                {posterUrl ? (
                  <img src={posterUrl} alt={uiI18n.t('app.i18n_value_0_poster_9f90b803', { value0: animeName })} className="h-24 w-16 shrink-0 rounded-xl object-cover shadow-md" loading="lazy" />
                ) : (
                  <span className="flex h-24 w-16 shrink-0 items-center justify-center rounded-xl bg-primary/15"><Play className="h-7 w-7 text-primary" /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold">{animeName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {episodes.length} {uiI18n.t('app.episode_39ae6b3c')}{episodes.length === 1 ? '' : 's'} {uiI18n.t('app.available_7b231a50')}
                    {isMobile ? uiI18n.t('app.downloads_as_mp4_0e0a2117') : ''}
                  </p>
                  <div className="mt-1.5 flex items-center text-[11px] text-muted-foreground">
                    <FolderOpen className="mr-1 h-3 w-3 shrink-0" />
                    <span className="truncate">{downloadPath || uiI18n.t('app.app_storage_c4e44a5b')}</span>
                  </div>
                </div>
              </div>
              <p className="px-1 text-xs text-muted-foreground">
                {uiI18n.t('app.next_pick_episodes_then_the_language_and_server__730f4aaa')}
              </p>
              <Button
                onClick={() => { void triggerHaptic('tap'); setStep('episodes'); }}
                disabled={episodes.length === 0 || !isNative}
                className="w-full h-12 rounded-xl font-bold"
              >
                <span className="flex items-center">{uiI18n.t('app.choose_episodes_2f78d3f2')} <Play className="ml-2 h-4 w-4 fill-current" /></span>
              </Button>
            </div>
          ) : null}
          {step === 'episodes' && (
          <>
          <div className="flex items-center px-0.5 -mb-2">
            <Button variant="ghost" size="sm" onClick={() => { void triggerHaptic('tap'); setStep('series'); }} className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-3.5 w-3.5" /> {uiI18n.t('app.series_40c20d94')}
            </Button>
          </div>
          {/* Tabs */}
          <Tabs defaultValue="episodes">
            <TabsList className="bg-white/5 border border-white/10 rounded-xl p-1 w-full">
              <TabsTrigger value="episodes" className="flex-1 gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">
                <Download className="w-4 h-4" /> {uiI18n.t('app.episodes_49d641ba')}
              </TabsTrigger>
              <TabsTrigger value="auto" className="flex-1 gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">
                <Bot className="w-4 h-4" /> {uiI18n.t('app.auto_download_45e299dd')}
              </TabsTrigger>
            </TabsList>

            {/* Episodes tab */}
            <TabsContent value="episodes" className="mt-4 space-y-5">
              {/* Step 2 — pick episodes */}
              <section className="space-y-2.5">
                <StepHeader
                  n={2}
                  label={uiI18n.t('app.select_episodes_66a7f2f3')}
                  hint={`${selectedIds.size}/${episodes.length}`}
                />
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.size > 0 ? uiI18n.t('app.i18n_value_0_selected_6e754838', { value0: selectedIds.size }) : uiI18n.t('app.tap_episodes_to_select_b72f49cc')}
                  </span>
                  <Button variant="ghost" size="sm" onClick={selectAll} className="text-primary hover:text-primary/80 text-xs h-7 px-2">
                    {selectedIds.size === episodes.length ? uiI18n.t('app.deselect_all_85cce1e1') : uiI18n.t('app.select_all_913afff1')}
                  </Button>
                </div>

                <ScrollArea className="h-[32dvh] sm:h-[300px] min-h-[180px] rounded-xl border border-white/10 bg-white/[0.03]">
                  <div className="grid grid-cols-1 gap-1.5 p-1.5">
                    {episodes.length === 0 && (
                      <p className="py-12 px-4 text-center text-sm text-muted-foreground">{uiI18n.t('app.no_released_episodes_are_available_yet_4375a425')}</p>
                    )}
                    {episodes.map((ep) => {
                      const state = downloadStates[ep.episodeId];
                      const isSelected = selectedIds.has(ep.episodeId);
                      return (
                        <div
                          key={ep.episodeId}
                          onClick={() => state?.status !== 'downloading' && toggleEpisode(ep.episodeId)}
                          className={`flex items-center justify-between p-2 sm:p-2.5 rounded-lg border transition-colors cursor-pointer ${isSelected ? 'bg-primary/10 border-primary/30' : 'bg-white/[0.02] border-transparent hover:border-white/10'}`}
                        >
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                            {isSelected
                              ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                              : <Circle className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0" />}
                            <div className="min-w-0">
                              <span className="font-bold text-sm sm:text-base">{uiI18n.t('app.ep_91954275')} {ep.number}</span>
                              {ep.title && <span className="text-xs text-muted-foreground block truncate max-w-[150px] sm:max-w-[300px]">{ep.title}</span>}
                            </div>
                          </div>
                          {state && (
                            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                              {state.status === 'downloading' && (
                                <div className="text-right">
                                  <span className="text-[10px] sm:text-xs font-mono text-primary">{state.progress > 0 ? uiI18n.t('app.i18n_value_0_cac4fa79', { value0: (state.progress).toFixed(0) }) : '...'}</span>
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
                  {selectedIds.size > 0 ? uiI18n.t('app.continue_with_i18n_value_0_episodei18n_value_1_307eecf7', { value0: selectedIds.size, value1: selectedIds.size > 1 ? 's' : '' }) : uiI18n.t('app.select_episodes_66a7f2f3')}
                  <ChevronLeft className="ml-2 h-5 w-5 rotate-180" />
                </span>
              </Button>
            </TabsContent>


            {/* Auto-download tab */}
            <TabsContent value="auto" className="mt-4">
              <AutoDownloadTab animeId={animeId} animeName={animeName} anilistId={anilistId} episodes={episodes} />
            </TabsContent>
          </Tabs>
          </>
          )}
          {step === 'server' && (
          <>
          <div className="flex items-center px-0.5">
            <Button variant="ghost" size="sm" onClick={() => { void triggerHaptic('tap'); setStep('episodes'); }} className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-3.5 w-3.5" /> {uiI18n.t('app.episodes_49d641ba')}
            </Button>
          </div>

              {/* Step 3 — language (hard filter) + server (soft preference) */}
              {showSourcePicker && (
                <section className="space-y-2.5">
                  <StepHeader
                    n={3}
                    label={uiI18n.t('app.language_server_4cb8a05a')}
                    hint={languageOptions.length ? `${languageOptions.length} language${languageOptions.length > 1 ? 's' : ''}` : probing ? 'Detecting…' : undefined}
                  />

                  {probing && languageOptions.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/10 p-4 text-xs text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" /> {uiI18n.t('app.detecting_available_sources_9828ceeb')}
                    </div>
                  ) : languageOptions.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-xl bg-white/[0.03] border border-white/10 p-5 text-center">
                      <AlertCircle className="w-6 h-6 text-amber-500" />
                      <div>
                        <p className="text-sm font-medium">{uiI18n.t('app.no_sources_detected_b2a844d5')}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{uiI18n.t('app.we_ll_still_try_every_server_when_you_start_or_p_13aacbe5')}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => {
                        downloadSourceCache.clear(); downloadServerCache.clear();
                        for (const ep of sampleEpisodes) void queryClient.invalidateQueries({ queryKey: ['servers', ep.episodeId] });
                        setProbeNonce(n => n + 1);
                      }} className="h-8 gap-1.5 text-xs">
                        <RefreshCw className="w-3.5 h-3.5" /> {uiI18n.t('app.retry_detection_bae53148')}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-xl bg-white/[0.03] border border-white/10 p-3">
                      <div>
                        <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
                          <Languages className="w-3.5 h-3.5" /> {uiI18n.t('app.language_89b86ab0')} <span className="text-[10px] opacity-70">{uiI18n.t('app.applies_to_all_episodes_667d6e37')}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {languageOptions.map(l => (
                            <button
                              key={l.code}
                              onClick={() => setSelectedLangCode(l.code)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${selectedLangCode === l.code
                                  ? 'bg-primary text-white border-primary'
                                  : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                            >
                              {l.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {serverOptions.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
                            <Server className="w-3.5 h-3.5" /> {uiI18n.t('app.server_cb0cb170')} <span className="text-[10px] opacity-70">{uiI18n.t('app.preferred_falls_back_automatically_0a204892')}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => setSelectedServerKey('auto')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${selectedServerKey === 'auto'
                                  ? 'bg-primary text-white border-primary'
                                  : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                            >
                              {uiI18n.t('app.auto_c614ba7c')}
                            </button>
                            {serverOptions.map(s => (
                              <button
                                key={s.key}
                                onClick={() => setSelectedServerKey(s.key)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${selectedServerKey === s.key
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                              >
                                {s.name}
                                {s.hasHls && !s.hasTorrent && (
                                  <span className={`rounded px-1 text-[9px] font-bold ${selectedServerKey === s.key ? 'bg-white/20' : 'bg-emerald-500/15 text-emerald-300'}`}>{uiI18n.t('app.hls_63d70cec')}</span>
                                )}
                                {s.hasTorrent && !s.hasHls && (
                                  <span className={`rounded px-1 text-[9px] font-bold ${selectedServerKey === s.key ? 'bg-white/20' : 'bg-amber-500/15 text-amber-300'}`}>{uiI18n.t('app.torrent_23264a42')}</span>
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
                <span className="truncate">{downloadPath || uiI18n.t('app.app_storage_c4e44a5b')}</span>
              </div>

              <Button
                onClick={handleDownload}
                disabled={selectedIds.size === 0 || isStarting}
                className="sticky bottom-[max(0px,env(safe-area-inset-bottom))] z-20 w-full h-14 sm:h-16 rounded-xl sm:rounded-2xl font-bold glow-primary flex-col gap-0.5 shadow-[0_-18px_36px_hsl(var(--background))]"
              >
                {isStarting ? (
                  <span className="flex items-center text-base sm:text-lg"><Loader2 className="w-5 h-5 mr-2 animate-spin" />{uiI18n.t('app.starting_downloads_a6c7a4bd')}</span>
                ) : (
                  <>
                    <span className="flex items-center text-base sm:text-lg">
                      <Play className="w-4 h-4 mr-2 fill-current" />
                      {selectedIds.size > 0 ? uiI18n.t('app.download_i18n_value_0_episodei18n_value_1_7ac61015', { value0: selectedIds.size, value1: selectedIds.size > 1 ? 's' : '' }) : uiI18n.t('app.select_episodes_66a7f2f3')}
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
