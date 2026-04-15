import { useState, useRef, useEffect, useCallback, useMemo } from "react";

import {

  Play,

  Pause,

  Volume2,

  VolumeX,

  Maximize,

  Minimize,

  SkipBack,

  SkipForward,
  Settings,
  Subtitles,
  Loader2,
  AlertCircle,
  RefreshCw,
  Upload, // New icon for upload
  SlidersHorizontal,
  FastForward,
  Eye,
  List,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Download,
  DownloadCloud,
  PictureInPicture2,
  Camera,
} from "lucide-react";

import Hls from "hls.js";

import { toast } from "sonner";

import { useVideoSettings } from "@/hooks/useVideoSettings";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { useDownload } from "@/hooks/useDownload";

import { VideoSettingsPanel } from "./VideoSettingsPanel";

import { useAniskip } from "@/hooks/useAniskip";

import { getProxiedImageUrl, getProxiedVideoUrl, getProxiedSubtitleUrl, trackEvent } from "@/lib/api";

// Helper function to convert local file paths to file:// URLs
function convertFileSrc(filePath: string): string {
  if (!filePath) return filePath;
  // Already a proper URL
  if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('file://')) {
    return filePath;
  }
  // Convert Windows path to file:// URL
  const normalized = filePath.replace(/\\/g, '/');
  return `file:///${normalized}`;
}

function looksLikeHlsManifest(payload: string): boolean {
  const text = String(payload || '').trim();
  if (!text.startsWith('#EXTM3U')) return false;
  return (
    text.includes('#EXT-X-STREAM-INF') ||
    text.includes('#EXT-X-TARGETDURATION') ||
    text.includes('#EXTINF')
  );
}

function readProxyQuerySnapshot(candidateUrl: string): { streamUrl?: string; referer?: string; userAgent?: string; password?: string } {
  try {
    const resolved = new URL(candidateUrl, window.location.origin);
    const streamUrl = resolved.searchParams.get('url') || undefined;
    const referer = resolved.searchParams.get('referer') || undefined;
    const userAgent = resolved.searchParams.get('userAgent') || undefined;
    const password = resolved.searchParams.get('password') || undefined;
    return { streamUrl, referer, userAgent, password };
  } catch {
    return {};
  }
}

const REMOTE_NODE_STREAM_PROXY = 'https://hoko.tatakai.me/api/v1/streamingProxy';
const REMOTE_CF_STREAM_PROXY = 'https://moko.tatakai.me/api/v1/streamingProxy';
const DEFAULT_STREAM_PROXY_PATH = '/api/v1/streamingProxy';
const LEGACY_STREAM_PROXY_PATHS = [
  '/api/v2/hianime/proxy/m3u8-streaming-proxy',
  '/api/proxy/m3u8-streaming-proxy',
];
const STREAM_PROXY_PASSWORD = String(
  import.meta.env.VITE_STREAM_PROXY_PASSWORD || import.meta.env.VITE_PROXY_PASSWORD || ''
).trim();

function isLoopbackProxyUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function resolveSingleStreamProxyBase(): string {
  const explicitProxyBase = String(
    import.meta.env.VITE_SINGLE_STREAM_PROXY_URL ||
      import.meta.env.VITE_STREAM_PROXY_URL ||
      import.meta.env.VITE_PROXY_DEV_URL ||
      ''
  ).trim();

  if (explicitProxyBase && !isLoopbackProxyUrl(explicitProxyBase)) {
    return explicitProxyBase.replace(/\/$/, '');
  }

  return REMOTE_NODE_STREAM_PROXY;
}

function buildProxyBaseCandidates(): string[] {
  const candidates: string[] = [];
  const add = (value?: string) => {
    const normalized = String(value || '').trim().replace(/\/$/, '');
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  add(resolveSingleStreamProxyBase());
  add(REMOTE_CF_STREAM_PROXY);

  if (typeof window !== 'undefined') {
    add(`${window.location.origin}${DEFAULT_STREAM_PROXY_PATH}`);
    LEGACY_STREAM_PROXY_PATHS.forEach((legacyPath) => {
      add(`${window.location.origin}${legacyPath}`);
    });
  }

  return candidates;
}

function buildRefererCandidatesForStream(streamUrl: string, primaryReferer?: string): string[] {
  const candidates: string[] = [];
  const add = (value?: string) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    try {
      const normalized = new URL(raw).href;
      if (!candidates.includes(normalized)) candidates.push(normalized);
    } catch {
      // Ignore invalid referer values.
    }
  };

  add(primaryReferer);

  try {
    const host = String(new URL(streamUrl).hostname || '').toLowerCase();
    if (host.includes('watching.onl')) {
      add('https://rabbitstream.net/');
      add('https://dokicloud.one/');
      add('https://hianime.to/');
      add('https://aniwatchtv.to/');
      add('https://megacloud.blog/');
      add('https://megacloud.club/');
      add('https://megacloud.tv/');
    }

    if (host.includes('owocdn') || host.includes('kwik') || host.includes('kwics')) {
      add('https://kwik.cx/');
      add('https://kwik.si/');
    }
  } catch {
    // Ignore malformed stream URL.
  }

  return candidates.slice(0, 8);
}

function buildProxyCandidateUrls(
  streamUrl: string,
  referer?: string,
  userAgent?: string,
  preferredUrl?: string,
  proxyPassword?: string,
): string[] {
  if (!/^https?:/i.test(streamUrl)) {
    return preferredUrl ? [preferredUrl] : [streamUrl];
  }

  const candidates: string[] = [];
  const addCandidate = (value?: string) => {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  addCandidate(preferredUrl);

  const proxyBases = buildProxyBaseCandidates();
  const refererCandidates = buildRefererCandidatesForStream(streamUrl, referer);
  const preservedPassword = preferredUrl ? readProxyQuerySnapshot(preferredUrl).password : '';
  const resolvedProxyPassword = String(proxyPassword || STREAM_PROXY_PASSWORD || preservedPassword || '').trim();

  for (const proxyBase of proxyBases) {
    if (refererCandidates.length === 0) {
      const params = new URLSearchParams({ url: streamUrl, type: 'video' });
      if (userAgent) params.set('userAgent', userAgent);
      if (resolvedProxyPassword) params.set('password', resolvedProxyPassword);
      addCandidate(`${proxyBase}${proxyBase.includes('?') ? '&' : '?'}${params.toString()}`);
      continue;
    }

    for (const refererCandidate of refererCandidates) {
      const params = new URLSearchParams({ url: streamUrl, type: 'video', referer: refererCandidate });
      if (userAgent) params.set('userAgent', userAgent);
      if (resolvedProxyPassword) params.set('password', resolvedProxyPassword);
      addCandidate(`${proxyBase}${proxyBase.includes('?') ? '&' : '?'}${params.toString()}`);
    }

    const noRefererParams = new URLSearchParams({ url: streamUrl, type: 'video' });
    if (userAgent) noRefererParams.set('userAgent', userAgent);
    if (resolvedProxyPassword) noRefererParams.set('password', resolvedProxyPassword);
    addCandidate(`${proxyBase}${proxyBase.includes('?') ? '&' : '?'}${noRefererParams.toString()}`);
  }

  return candidates.slice(0, 16);
}

function getSubtitleSelectionKey(subtitle: { lang: string; url: string; label?: string }, index: number): string {
  const baseKey = subtitle.url || subtitle.label || subtitle.lang || `subtitle-${index}`;
  return `${subtitle.lang === 'custom' ? 'custom' : 'sub'}:${baseKey}`;
}

function toTrackLanguageCode(lang?: string): string {
  const value = String(lang || '').trim().toLowerCase();
  if (!value) return 'en';
  if (value === 'en' || value.includes('eng') || value.includes('english')) return 'en';
  if (value === 'ja' || value.includes('jap') || value.includes('japanese')) return 'ja';
  if (value === 'hi' || value.includes('hin') || value.includes('hindi')) return 'hi';
  if (value === 'ta' || value.includes('tam') || value.includes('tamil')) return 'ta';
  if (value === 'te' || value.includes('tel') || value.includes('telugu')) return 'te';
  if (value === 'ml' || value.includes('mal') || value.includes('malayalam')) return 'ml';
  if (value.length >= 2) return value.slice(0, 2);
  return 'en';
}

function parseQualityScore(quality?: string): number | null {
  const normalized = String(quality || '').toLowerCase();
  const match = normalized.match(/(\d{3,4})\s*p?/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function selectPreferredSource(
  sources: Array<{ url: string; isM3U8: boolean; quality?: string }>,
  preferredQuality: 'auto' | '1080p' | '720p' | '480p' | '360p',
) {
  if (!sources.length) return undefined;
  if (preferredQuality === 'auto') return sources[0];

  const preferredScore = parseQualityScore(preferredQuality);
  if (!preferredScore) {
    return sources.find((source) => String(source.quality || '').toLowerCase() === preferredQuality) || sources[0];
  }

  const candidates = sources
    .map((source) => ({ source, score: parseQualityScore(source.quality) }))
    .filter((entry): entry is { source: { url: string; isM3U8: boolean; quality?: string }; score: number } => entry.score != null)
    .sort((left, right) => {
      const distanceDiff = Math.abs(left.score - preferredScore) - Math.abs(right.score - preferredScore);
      if (distanceDiff !== 0) return distanceDiff;
      return right.score - left.score;
    });

  if (candidates.length > 0) return candidates[0].source;

  return sources.find((source) => String(source.quality || '').toLowerCase() === preferredQuality) || sources[0];
}



interface VideoPlayerProps {

  sources: Array<{ url: string; isM3U8: boolean; quality?: string }>;

  subtitles?: Array<{ lang: string; url: string; label?: string }>;

  headers?: { Referer?: string; "User-Agent"?: string };

  poster?: string;

  onError?: () => void;

  onServerSwitch?: () => void;

  onRetryCurrentServer?: () => void;

  isLoading?: boolean;

  serverName?: string;

  onEpisodeEnd?: () => void;

  malId?: number | null;

  episodeNumber?: number;

  introWindow?: { start: number; end: number } | null;

  outroWindow?: { start: number; end: number } | null;

  initialSeekSeconds?: number;

  viewCount?: number;

  isLive?: boolean;

}



// Replaced by centralized functions in api.ts



function formatTime(seconds: number): string {

  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";

  const mins = Math.floor(seconds / 60);

  const secs = Math.floor(seconds % 60);

  return `${mins}:${secs.toString().padStart(2, "0")}`;

}



export function VideoPlayer({

  sources,

  subtitles = [],

  headers,

  poster,

  onError,

  onServerSwitch,

  onRetryCurrentServer,

  isLoading = false,

  serverName,

  onEpisodeEnd,

  malId,

  episodeNumber,

  introWindow,

  outroWindow,

  viewCount,

  // optional progress callback provided by parent (watch page)

  onProgressUpdate,

  animeId,

  animeName,

  animePoster,

  episodeId,

  initialSeekSeconds,

  externalRef,

  onPlay,

  onPause,

  isLive,

  episodeTitle,

  isOffline

}: VideoPlayerProps & {

  onProgressUpdate?: (progressSeconds: number, durationSeconds?: number, completed?: boolean) => void;

  animeId?: string;

  animeName?: string;

  animePoster?: string;

  episodeId?: string;

  initialSeekSeconds?: number;

  externalRef?: React.MutableRefObject<HTMLVideoElement | null>;

  onPlay?: () => void;

  onPause?: () => void;

  isLive?: boolean;

  episodeTitle?: string;

  isOffline?: boolean;

}) {

  const videoRef = useRef<HTMLVideoElement>(null);



  // Sync external ref

  useEffect(() => {

    if (externalRef) {

      externalRef.current = videoRef.current;

    }

  }, [externalRef]);



  const containerRef = useRef<HTMLDivElement>(null);

  const hlsRef = useRef<Hls | null>(null);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  const { settings } = useVideoSettings();

  const { skipTimes, fetchSkipTimes, getSkipLabel } = useAniskip();

  const tatakaiSkipTimes = useMemo(() => {
    const windows: Array<{ interval: { startTime: number; endTime: number }; skipType: 'op' | 'ed' | 'mixed-op' | 'mixed-ed' | 'recap'; skipId: string; episodeLength: number }> = [];

    if (introWindow && Number.isFinite(introWindow.start) && Number.isFinite(introWindow.end) && introWindow.end > introWindow.start) {
      windows.push({
        interval: { startTime: introWindow.start, endTime: introWindow.end },
        skipType: 'op',
        skipId: `tatakai-op-${episodeId || episodeNumber || 'current'}`,
        episodeLength: 0,
      });
    }

    if (outroWindow && Number.isFinite(outroWindow.start) && Number.isFinite(outroWindow.end) && outroWindow.end > outroWindow.start) {
      windows.push({
        interval: { startTime: outroWindow.start, endTime: outroWindow.end },
        skipType: 'ed',
        skipId: `tatakai-ed-${episodeId || episodeNumber || 'current'}`,
        episodeLength: 0,
      });
    }

    return windows;
  }, [introWindow?.start, introWindow?.end, outroWindow?.start, outroWindow?.end, episodeId, episodeNumber]);

  const hasTatakaiSkipWindows = tatakaiSkipTimes.length > 0;
  const effectiveSkipTimes = hasTatakaiSkipWindows ? tatakaiSkipTimes : skipTimes;
  const hasTatakaiSkipWindowsRef = useRef(hasTatakaiSkipWindows);

  useEffect(() => {
    hasTatakaiSkipWindowsRef.current = hasTatakaiSkipWindows;
  }, [hasTatakaiSkipWindows]);



  const resolvedPoster = poster ? getProxiedImageUrl(poster) : undefined;



  const [isPlaying, setIsPlaying] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);

  const [duration, setDuration] = useState(0);

  const [lastSavedProgress, setLastSavedProgress] = useState(0);

  const lastSavedProgressRef = useRef<number>(0);

  const progressIntervalRef = useRef<number | null>(null);

  const PROGRESS_SAVE_INTERVAL = 15; // seconds

  const [volume, setVolume] = useState(settings.volume);

  const [isMuted, setIsMuted] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);

  const [showControls, setShowControls] = useState(true);

  const [buffered, setBuffered] = useState(0);

  const [videoError, setVideoError] = useState<string | null>(null);

  const [isBuffering, setIsBuffering] = useState(false);

  const [retryCount, setRetryCount] = useState(0);
  const retryCountRef = useRef(0);

  const [showSettings, setShowSettings] = useState(false);

  const [playbackRate, setPlaybackRate] = useState(settings.playbackSpeed);

  const [isMobile, setIsMobile] = useState(false);

  const [currentSubtitle, setCurrentSubtitle] = useState<string>(settings.subtitleLanguage);

  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [customSubtitles, setCustomSubtitles] = useState<Array<{ lang: string; url: string; label: string }>>([]);
  const [subtitleBlobs, setSubtitleBlobs] = useState<Record<string, string>>({});
  const [activeSkip, setActiveSkip] = useState<any>(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [downloads, setDownloads] = useState<Record<string, any>>({});
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [hoverTime, setHoverTime] = useState<number>(0);
  const [showHoverTime, setShowHoverTime] = useState(false);
  const [hoverPercent, setHoverPercent] = useState(0);
  const isNative = useIsNativeApp();
  const { startDownload, downloadStates } = useDownload();

  const handleCustomSubtitleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const newSub = {
      lang: 'custom',
      url: url,
      label: file.name
    };

    setCustomSubtitles(prev => [...prev, newSub]);
    setCurrentSubtitle(getSubtitleSelectionKey(newSub, customSubtitles.length));

    // Also add to blobs map immediately so it renders
    setSubtitleBlobs(prev => ({ ...prev, [url]: url }));

    toast.success(`Loaded subtitle: ${file.name}`);
  };



  // Keep a stable ref to the latest progress callback to avoid effect churn

  const progressCallbackRef = useRef<typeof onProgressUpdate | null>(onProgressUpdate);



  const currentSource = useMemo(
    () => selectPreferredSource(sources, settings.defaultQuality),
    [sources, settings.defaultQuality],
  );



  const initialSeekDoneRef = useRef(false);

  const manifestFallbackRef = useRef(false);
  const manifestRetryRef = useRef(0);
  const bufferingTimeoutRef = useRef<number | null>(null);
  const lastProgressAtRef = useRef<number>(Date.now());
  const lastObservedTimeRef = useRef<number>(0);
  const manualRetryLockUntilRef = useRef(0);
  const subtitleApplyStateRef = useRef<{ lang: string; selectedIndex: number; trackCount: number } | null>(null);
  const subtitleTrackSignatureRef = useRef<string>('');

  const initialSeekRef = useRef(initialSeekSeconds);



  // Keep initialSeekRef fresh so manifest handlers see the latest value without triggering reload

  useEffect(() => {

    if (initialSeekSeconds !== undefined && !initialSeekDoneRef.current) {

      initialSeekRef.current = initialSeekSeconds;

    }

  }, [initialSeekSeconds]);






  // Apply video settings in real-time when they change

  useEffect(() => {

    if (videoRef.current) {

      videoRef.current.playbackRate = settings.playbackSpeed;

      setPlaybackRate(settings.playbackSpeed);

    }

  }, [settings.playbackSpeed]);



  useEffect(() => {
    if (videoRef.current && !isMuted) {
      videoRef.current.volume = settings.volume;
      setVolume(settings.volume);
    }
  }, [settings.volume]);

  // Sync with Discord RPC
  const lastRpcUpdateRef = useRef(0);
  useEffect(() => {
    if (isNative && (window as any).electron && animeName) {
      const now = Date.now();
      if (now - lastRpcUpdateRef.current < 5000) return; // Throttle 5s
      lastRpcUpdateRef.current = now;

      const extra: any = {
        startTime: isPlaying ? new Date(Date.now() - currentTime * 1000) : undefined,
        endTime: isPlaying && duration > 0 ? new Date(Date.now() + (duration - currentTime) * 1000) : undefined,
        smallImageKey: isPlaying ? 'play_icon' : 'pause_icon',
        smallImageText: isPlaying ? 'Playing' : 'Paused'
      };

      (window as any).electron.updateRPC({
        details: `Watching ${animeName}`,
        state: `Episode ${episodeNumber || '...'}`,
        extra
      });
    }
  }, [isNative, isPlaying, animeName, episodeNumber, currentTime, duration]);



  const handleSubtitleChange = useCallback((lang: string) => {

    const video = videoRef.current;

    if (!video) return;



    const tracks = video.textTracks;

    const orderedSubtitles = [...subtitles, ...customSubtitles];
    const selectedKey = lang.trim();
    const selectedKeyLower = selectedKey.toLowerCase();

    const englishIndex = (() => {
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const trackLang = String(track.language || '').toLowerCase();
        const trackLabel = String(track.label || '').toLowerCase();
        if (trackLang === 'en' || trackLang.includes('eng') || trackLabel.includes('english')) return i;
      }
      return -1;
    })();

    let selectedIndex = -1;

    if (lang === 'auto') {
      selectedIndex = englishIndex >= 0 ? englishIndex : (tracks.length > 0 ? 0 : -1);
    } else if (lang !== 'off') {
      for (let i = 0; i < tracks.length; i++) {
        const mappedSubtitle = orderedSubtitles[i];
        const mappedKey = mappedSubtitle ? getSubtitleSelectionKey(mappedSubtitle, i).toLowerCase() : '';
        if (mappedKey === selectedKeyLower) {
          selectedIndex = i;
          break;
        }
      }

      if (selectedIndex < 0) {
        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i];
          const trackLang = String(track.language || '').toLowerCase();
          const trackLabel = String(track.label || '').toLowerCase();
          if (trackLang === selectedKeyLower || trackLabel === selectedKeyLower) {
            selectedIndex = i;
            break;
          }
        }
      }
    }

    let currentShowingIndex = -1;
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].mode === 'showing') {
        currentShowingIndex = i;
        break;
      }
    }

    const previousApply = subtitleApplyStateRef.current;
    const alreadyApplied =
      !!previousApply &&
      previousApply.lang === lang &&
      previousApply.selectedIndex === selectedIndex &&
      previousApply.trackCount === tracks.length &&
      currentShowingIndex === selectedIndex;

    if (alreadyApplied) {
      setCurrentSubtitle((prev) => (prev === lang ? prev : lang));
      return;
    }



    for (let i = 0; i < tracks.length; i++) {

      const track = tracks[i];

      track.mode = i === selectedIndex ? 'showing' : 'disabled';

    }

    subtitleApplyStateRef.current = {
      lang,
      selectedIndex,
      trackCount: tracks.length,
    };

    setCurrentSubtitle((prev) => (prev === lang ? prev : lang));

  }, [subtitles, customSubtitles]);



  useEffect(() => {

    handleSubtitleChange(settings.subtitleLanguage);

  }, [settings.subtitleLanguage, handleSubtitleChange]);



  // Create a key from subtitle URLs to detect changes

  const subtitleKey = subtitles?.map(s => s.url).join('|') ?? '';
  const subtitleReferer = headers?.Referer || '';
  const subtitleUserAgent = headers?.["User-Agent"] || '';
  const playbackReferer = headers?.Referer || '';
  const playbackUserAgent = headers?.["User-Agent"] || '';



  // Prefetch subtitles to ensure CORS and headers are applied correctly

  // Also clear old blobs when subtitles change (e.g., switching between sub/dub)

  useEffect(() => {

    if (!subtitles || subtitles.length === 0) {

      // Clear blobs if no subtitles

      setSubtitleBlobs({});

      return;

    }



    let mounted = true;



    // Clear existing blobs and refetch when subtitle sources change

    setSubtitleBlobs({});



    (async () => {

      const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const newBlobs: Record<string, string> = {};



      for (const sub of subtitles) {

        if (!mounted) break;

        try {
          // Check if local asset
          const isLocalSub = sub.url.startsWith('asset://') || sub.url.includes('asset.localhost');

          if (isLocalSub) {
            if (mounted) setSubtitleBlobs(prev => ({ ...prev, [sub.url]: sub.url }));
            continue;
          }

          const proxiedSubtitleUrl = !isOffline
            ? getProxiedSubtitleUrl(sub.url, headers?.Referer)
            : sub.url;

          let res = await fetch(proxiedSubtitleUrl, {

            headers: {

              Accept: 'text/vtt, text/plain, */*',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://megacloud.blog/',
              'Origin': 'https://megacloud.blog'

            }

          });

          if (!res.ok && proxiedSubtitleUrl !== sub.url) {
            res = await fetch(sub.url, {
              headers: {
                Accept: 'text/vtt, text/plain, */*'
              }
            });
          }

          if (res.ok) {

            let text = await res.text();



            // Basic SRT to VTT conversion

            if (!text.trim().startsWith('WEBVTT')) {

              console.log('[VideoPlayer] Normalizing subtitle format for:', sub.lang);

              // If it has SRT timestamps (00:00:00,000)

              if (text.includes('-->')) {

                // Convert commas to dots for timestamps

                text = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

                // Ensure WEBVTT header

                if (!text.includes('WEBVTT')) {

                  text = 'WEBVTT\n\n' + text;

                }

              } else {

                // Try to wrap raw text as a single cue if it's completely broken but has content

                text = 'WEBVTT\n\n00:00:00.000 --> 99:59:59.000\n' + text;

              }

            }



            const blob = new Blob([text], { type: 'text/vtt' });

            const blobUrl = URL.createObjectURL(blob);

            if (mounted) setSubtitleBlobs(prev => ({ ...prev, [sub.url]: blobUrl }));

          } else {

            console.warn('Failed to fetch subtitle via proxy:', sub.lang, res.status);

          }

        } catch (e) {

          console.warn('Error prefetching subtitle', sub.lang, e);

        }

      }

    })();



    return () => {

      mounted = false;

    };

  }, [subtitleKey, subtitleReferer, subtitleUserAgent]);



  // Apply subtitle setting when subtitle blobs are loaded

  useEffect(() => {

    const blobsLoaded = Object.keys(subtitleBlobs).length;

    if (blobsLoaded === 0) return;



    // Re-apply current subtitle setting after a short delay for tracks to register

    const timeout = setTimeout(() => {

      const video = videoRef.current;
      if (!video) return;
      const tracks = video.textTracks;
      const signature = Array.from({ length: tracks.length }, (_, index) => {
        const track = tracks[index];
        return `${track.language}|${track.label}|${track.kind}`;
      }).join('||');

      if (!signature || signature === subtitleTrackSignatureRef.current) return;
      subtitleTrackSignatureRef.current = signature;
      handleSubtitleChange(currentSubtitle);

    }, 500);



    return () => clearTimeout(timeout);

  }, [subtitleBlobs, customSubtitles, currentSubtitle, subtitles]);



  // Fetch skip times after manifest parsed when duration is known

  useEffect(() => {

    if (hasTatakaiSkipWindows) return;

    if (!malId || !episodeNumber) return;



    const onManifestParsed = () => {

      const length = videoRef.current?.duration;

      fetchSkipTimes(malId, episodeNumber, isFinite(length) && length > 0 ? Math.floor(length) : undefined);

    };



    // If duration already available, call immediately

    if (videoRef.current?.duration && isFinite(videoRef.current.duration) && videoRef.current.duration > 0) {

      onManifestParsed();

    }



    // Also call when manifest parsed via HLS

    const handler = () => onManifestParsed();

    const hls = hlsRef.current;

    if (hls) hls.on(Hls.Events.MANIFEST_PARSED, handler);



    return () => {

      if (hls) hls.off(Hls.Events.MANIFEST_PARSED, handler);

    };

  }, [malId, episodeNumber, fetchSkipTimes, hasTatakaiSkipWindows]);



  // Ensure subtitles are applied when tracks become available

  useEffect(() => {

    const video = videoRef.current;

    if (!video) return;



    const applyOnceTracksAvailable = () => {

      const tracks = video.textTracks;

      if (tracks && tracks.length > 0) {

        const signature = Array.from({ length: tracks.length }, (_, index) => {
          const track = tracks[index];
          return `${track.language}|${track.label}|${track.kind}`;
        }).join('||');

        if (!signature || signature === subtitleTrackSignatureRef.current) return;

        subtitleTrackSignatureRef.current = signature;
        handleSubtitleChange(currentSubtitle);

      }

    };



    // Try immediately

    applyOnceTracksAvailable();



    // Poll briefly until tracks are available

    let attempts = 0;

    const interval = setInterval(() => {

      attempts += 1;

      applyOnceTracksAvailable();

      if (attempts > 6) clearInterval(interval);

    }, 300);



    return () => clearInterval(interval);

  }, [currentSubtitle, subtitles, customSubtitles]);



  // Check for active skip time

  useEffect(() => {

    const skip = effectiveSkipTimes.find((candidate) => (
      currentTime >= candidate.interval.startTime && currentTime < candidate.interval.endTime
    )) || null;

    setActiveSkip(skip);

  }, [currentTime, effectiveSkipTimes]);



  const handleSkip = useCallback(() => {

    if (activeSkip && videoRef.current) {

      videoRef.current.currentTime = activeSkip.interval.endTime;

      setActiveSkip(null);

    }

  }, [activeSkip]);



  // Detect mobile

  useEffect(() => {

    const checkMobile = () => setIsMobile(window.innerWidth < 768);

    checkMobile();

    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);

  }, []);



  const sourceKey = currentSource?.url || '';
  const autoSkippedWindowRef = useRef<string | null>(null);

  useEffect(() => {
    autoSkippedWindowRef.current = null;
  }, [sourceKey]);

  useEffect(() => {
    if (!settings.autoSkipIntro || !activeSkip || !videoRef.current) return;
    if (activeSkip.skipType !== 'op' && activeSkip.skipType !== 'mixed-op' && activeSkip.skipType !== 'recap') {
      return;
    }

    const windowKey = `${activeSkip.skipType}:${activeSkip.interval.startTime}:${activeSkip.interval.endTime}`;
    if (autoSkippedWindowRef.current === windowKey) return;

    videoRef.current.currentTime = activeSkip.interval.endTime;
    autoSkippedWindowRef.current = windowKey;
    setActiveSkip(null);
  }, [activeSkip, settings.autoSkipIntro]);



  const loadVideo = useCallback(

    () => {

      if (!currentSource?.url || !videoRef.current) return;



      setVideoError(null);

      setIsBuffering(true);
      manifestFallbackRef.current = false;
      manifestRetryRef.current = 0;
      lastProgressAtRef.current = Date.now();
      lastObservedTimeRef.current = 0;



      // Clear any existing progress saver when loading a new source

      if (progressIntervalRef.current !== null) {

        clearInterval(progressIntervalRef.current as number);

        progressIntervalRef.current = null;

      }



      // Check if we have a local download for this episode
      const downloadId = `${animeId}-${episodeNumber}`;
      const download = downloads[downloadId];

      let videoUrl = currentSource.url;

      // Only check download status if NOT in offline mode
      // If isOffline is true, we trust the source passed to us (which is the local file)
      if (!isOffline && download?.status === 'completed' && download.localUri) {
        videoUrl = convertFileSrc(download.localUri);
      } else if (currentSource.url.startsWith('file:') || currentSource.url.match(/^[a-zA-Z]:\\/)) {
        // Verify if it's already a raw path passed from elsewhere
        videoUrl = convertFileSrc(currentSource.url);
      }

      const isM3U8 = !isOffline && (currentSource.isM3U8 || videoUrl.includes(".m3u8") || videoUrl.includes("playlist.m3u8")) && !videoUrl.endsWith('.mp4');
      const referer = playbackReferer || undefined;
      // Fallback to browser UA if not provided by source (crucial for Cloudflare bypass)
      const userAgent = playbackUserAgent || navigator.userAgent;

      // Use our backend proxy if not local and not already proxied
      // CRITICAL FIX: Do not proxy local assets (asset:// or asset.localhost)
      const isLocal = videoUrl.startsWith('asset://') || videoUrl.includes('asset.localhost') || videoUrl.startsWith('http://asset.localhost');

      // If offline/local, strictly use the provided URL without proxy
      // Also ensure we handle encoded spaces correctly for local files
      const proxiedUrl = (isLocal || isOffline)
        ? videoUrl
        : (videoUrl.startsWith('http') ? getProxiedVideoUrl(videoUrl, referer, userAgent) : videoUrl);

      const proxySnapshot = readProxyQuerySnapshot(proxiedUrl);
      const sourceSnapshot = readProxyQuerySnapshot(videoUrl);
      const originalStreamUrl = proxySnapshot.streamUrl || sourceSnapshot.streamUrl || videoUrl;
      const effectiveReferer = proxySnapshot.referer || sourceSnapshot.referer || referer;
      const effectiveUserAgent = proxySnapshot.userAgent || sourceSnapshot.userAgent || userAgent;
      const effectiveProxyPassword = proxySnapshot.password || sourceSnapshot.password || STREAM_PROXY_PASSWORD;
      const proxyCandidates = isM3U8
        ? buildProxyCandidateUrls(
            originalStreamUrl,
            effectiveReferer,
            effectiveUserAgent,
            proxiedUrl,
            effectiveProxyPassword,
          )
        : [proxiedUrl];
      let activeProxyIndex = Math.max(0, proxyCandidates.findIndex((candidate) => candidate === proxiedUrl));
      let activePlaybackUrl = proxyCandidates[activeProxyIndex] || proxiedUrl;
      const attemptedProxyIndexes = new Set<number>([activeProxyIndex]);
      let proxySwitchInProgress = false;
      let proxySwitchCount = 0;

      console.log('Loading video:', { original: videoUrl, final: activePlaybackUrl, isLocal, isOffline, proxyCandidates: proxyCandidates.length });

      trackEvent('video_initialize', { animeName, episodeNumber, sourceType: isM3U8 ? 'hls' : 'file' });

      if (isM3U8 && Hls.isSupported()) {
        const hls = new Hls({
          xhrSetup: (xhr, url) => {
            // If it's a local asset, no headers needed, or specific handling
            if (url.startsWith('asset://') || url.startsWith('http://asset.localhost')) {
              return;
            }
            xhr.timeout = 30000;
          },
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,

          // FastStream-inspired optimization for aggressive buffering:
          maxBufferLength: 300,             // pre-buffer up to 5 minutes
          maxMaxBufferLength: 1200,         // absolute max 20 mins buffer
          maxBufferSize: 500 * 1000 * 1000, // 500 MB max size
          maxBufferHole: 0.5,
          highBufferWatchdogPeriod: 2,
          nudgeOffset: 0.1,
          nudgeMaxRetry: 5,
          maxFragLookUpTolerance: 0.25,
          appendErrorMaxRetry: 4,
          fragLoadingMaxRetry: 1,
          manifestLoadingMaxRetry: 0,
          levelLoadingMaxRetry: 1,
          startFragPrefetch: true,          // parallelize fragment loading
        });

        const trySwitchProxyCandidate = async (context?: { statusCode?: number }) => {
          if (proxyCandidates.length <= 1) return false;

          if (proxySwitchInProgress) return false;

          const statusCode = Number(context?.statusCode || 0);
          const maxSwitches = statusCode === 403 ? 1 : 3;
          if (proxySwitchCount >= maxSwitches) return false;

          proxySwitchInProgress = true;

          try {
            for (let candidateIndex = activeProxyIndex + 1; candidateIndex < proxyCandidates.length; candidateIndex += 1) {
              if (attemptedProxyIndexes.has(candidateIndex)) continue;

              const candidateUrl = proxyCandidates[candidateIndex];
              attemptedProxyIndexes.add(candidateIndex);
              proxySwitchCount += 1;

              activeProxyIndex = candidateIndex;
              activePlaybackUrl = candidateUrl;
              manifestFallbackRef.current = false;
              manifestRetryRef.current = 0;

              setVideoError(null);
              setIsBuffering(true);

              try {
                hls.stopLoad();
              } catch {
                // noop
              }

              hls.loadSource(candidateUrl);
              hls.startLoad();
              toast.success(`Switched proxy route (${candidateIndex + 1}/${proxyCandidates.length})`, { id: 'proxy-failover' });
              return true;
            }

            return false;
          } finally {
            proxySwitchInProgress = false;
          }
        };



        // Start periodic progress saver when HLS is attached

        if (progressIntervalRef.current === null) {

          progressIntervalRef.current = window.setInterval(() => {

            const time = Math.floor(videoRef.current?.currentTime || 0);

            const dur = Math.floor(videoRef.current?.duration || 0) || undefined;

            if (onProgressUpdate && time !== lastSavedProgressRef.current && Math.abs(time - lastSavedProgressRef.current) >= PROGRESS_SAVE_INTERVAL) {

              onProgressUpdate(time, dur, false);

              setLastSavedProgress(time);

              lastSavedProgressRef.current = time;

            }

          }, PROGRESS_SAVE_INTERVAL * 1000);

        }





        hls.loadSource(activePlaybackUrl);

        hls.attachMedia(videoRef.current);



        hls.on(Hls.Events.MANIFEST_PARSED, () => {

          console.log('HLS manifest parsed successfully');
          manifestRetryRef.current = 0;
          manifestFallbackRef.current = false;

          setIsBuffering(false);

          if (settings.autoplay) {
            videoRef.current?.play().catch(() => { });
          }



          // Once manifest parsed, fetch skip times using known duration

          const length = videoRef.current?.duration;

          if (!hasTatakaiSkipWindowsRef.current && malId && episodeNumber) {

            fetchSkipTimes(malId, episodeNumber, isFinite(length) && length > 0 ? Math.floor(length) : undefined);

          }



          // Ensure subtitle selection is applied after tracks are available

          if (currentSubtitle && currentSubtitle !== 'off') {

            handleSubtitleChange(currentSubtitle);

          }

          // Rewrite relative URLs to proxied upstream URLs to preserve CORS

          // Apply initial seek for native HLS / loadedmetadata

          if (initialSeekRef.current !== undefined && !initialSeekDoneRef.current) {

            try {

              const seekTo = Math.max(0, Math.min(initialSeekRef.current, Math.floor(videoRef.current?.duration || initialSeekRef.current)));

              if (videoRef.current) videoRef.current.currentTime = seekTo;

              initialSeekDoneRef.current = true;

            } catch (e) {

              console.warn('Failed initial seek:', e);

            }

          }

        });



        hls.on(Hls.Events.ERROR, async (_, data) => {

          console.error('HLS error:', data.type, data.details);
          const responseCode = Number((data as any)?.response?.code || (data as any)?.response?.status || 0);

          if (data.response?.code === 0 || data.details === 'manifestLoadError') {
            toast.error("Playback blocked? Try disabling 'Tracking Prevention' or switching servers.", { duration: 5000, id: 'tracking-prevention' });
          }



          // Try client-side manifest fetch fallback for manifestLoadError

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.details && String(data.details).toLowerCase().includes('manifest') && !manifestFallbackRef.current) {

            if ([403, 502, 503, 504].includes(responseCode)) {
              const switchedProxy = await trySwitchProxyCandidate({ statusCode: responseCode });
              if (switchedProxy) {
                return;
              }

              if (responseCode === 403) {
                setVideoError('Stream forbidden (403). Auto-switching server in 3 seconds...');
              } else {
                setVideoError('Manifest blocked or invalid. Auto-switching server in 3 seconds...');
              }
              if (onError) onError();
              hls.stopLoad();
              return;
            }

            manifestFallbackRef.current = true;

            try {

              console.log('Attempting client-side manifest fetch fallback for', activePlaybackUrl);

              const res = await fetch(activePlaybackUrl, { redirect: 'follow', cache: 'no-store' });

              const text = await res.text().catch(() => '');

              if (res.status === 403) {
                setVideoError('Stream forbidden (403). Auto-switching server in 3 seconds...');
                if (onError) onError();
                hls.stopLoad();
                return;
              }



              // Check if we got a valid manifest

              if (!res.ok || !looksLikeHlsManifest(text)) {

                console.warn('Manifest fallback returned invalid content');

                const switchedProxy = await trySwitchProxyCandidate({ statusCode: res.status });
                if (switchedProxy) {
                  return;
                }

                setVideoError('Manifest blocked or invalid. Auto-switching server in 3 seconds...');
                if (onError) onError();
                hls.stopLoad();
                return;

              }

            } catch (e) {

              console.warn('Client-side manifest fetch fallback failed:', e);

              const switchedProxy = await trySwitchProxyCandidate();
              if (switchedProxy) {
                return;
              }

              setVideoError('Manifest fetch failed. Auto-switching server in 3 seconds...');
              if (onError) onError();
              hls.stopLoad();
              return;

            }

          }



          if (data.fatal) {
            const isForbiddenResponse = responseCode === 403;

            if (isForbiddenResponse) {
              const switchedProxy = await trySwitchProxyCandidate({ statusCode: responseCode });
              if (switchedProxy) {
                retryCountRef.current = 0;
                setRetryCount(0);
                return;
              }

              setVideoError('Stream forbidden (403). Auto-switching server in 3 seconds...');
              if (onError) onError();
              hls.stopLoad();
              return;
            }

            // Surface manifest parsing problems explicitly so we can switch servers

            if (data.details && String(data.details).toLowerCase().includes('manifest')) {

              const switchedProxy = await trySwitchProxyCandidate({ statusCode: responseCode });
              if (switchedProxy) {
                return;
              }

              setVideoError('Manifest blocked or invalid. Auto-switching server in 3 seconds...');
              if (onError) onError();
              hls.stopLoad();
              return;

            }



            switch (data.type) {

              case Hls.ErrorTypes.NETWORK_ERROR:

                console.error('Network error - attempting recovery');

                if (retryCountRef.current < 2) {

                  setRetryCount(prev => {
                    const next = prev + 1;
                    retryCountRef.current = next;
                    return next;
                  });

                  hls.startLoad();

                } else {

                  const switchedProxy = await trySwitchProxyCandidate({ statusCode: responseCode });
                  if (switchedProxy) {
                    retryCountRef.current = 0;
                    setRetryCount(0);
                    return;
                  }

                  setVideoError("Network error. Auto-switching server in 3 seconds...");

                  if (onError) onError();

                }

                break;

              case Hls.ErrorTypes.MEDIA_ERROR:

                console.error('Media error - attempting recovery');

                hls.recoverMediaError();

                break;

              default:

                setVideoError("Failed to load video");

                if (onError) onError();

                break;

            }

          }

        });



        hlsRef.current = hls;

      } else if (

        videoRef.current.canPlayType("application/vnd.apple.mpegurl")

      ) {

        // Safari native HLS support

        videoRef.current.src = proxiedUrl;

        videoRef.current.addEventListener("loadedmetadata", () => {

          setIsBuffering(false);

          // Fetch skip times now that duration is available

          const length = videoRef.current?.duration;

          if (!hasTatakaiSkipWindowsRef.current && malId && episodeNumber) {

            fetchSkipTimes(malId, episodeNumber, isFinite(length) && length > 0 ? Math.floor(length) : undefined);

          }

          // Ensure subtitle selection is applied

          if (currentSubtitle && currentSubtitle !== 'off') {

            handleSubtitleChange(currentSubtitle);

          }



          // Apply initial seek for native HLS / loadedmetadata

          if (initialSeekRef.current !== undefined && !initialSeekDoneRef.current) {

            try {

              const seekTo = Math.max(0, Math.min(initialSeekRef.current, Math.floor(videoRef.current?.duration || initialSeekRef.current)));

              if (videoRef.current) videoRef.current.currentTime = seekTo;

              initialSeekDoneRef.current = true;

            } catch (e) {

              console.warn('Failed initial seek:', e);

            }

          }



          if (settings.autoplay) {
            videoRef.current?.play().catch(() => { });
          }

        });



        // Ensure periodic saver for native HLS/native playback

        if (progressIntervalRef.current === null) {

          progressIntervalRef.current = window.setInterval(() => {

            const time = Math.floor(videoRef.current?.currentTime || 0);

            const dur = Math.floor(videoRef.current?.duration || 0) || undefined;

            if (onProgressUpdate && time !== lastSavedProgressRef.current && Math.abs(time - lastSavedProgressRef.current) >= PROGRESS_SAVE_INTERVAL) {

              onProgressUpdate(time, dur, false);

              setLastSavedProgress(time);

              lastSavedProgressRef.current = time;

            }

          }, PROGRESS_SAVE_INTERVAL * 1000);

        }

      } else {

        // Direct playback for non-HLS

        videoRef.current.src = proxiedUrl;

        setIsBuffering(false);



        // Apply initial seek for direct playback if needed

        if (initialSeekRef.current !== undefined && !initialSeekDoneRef.current) {

          try {

            const seekTo = Math.max(0, Math.min(initialSeekRef.current, Math.floor(videoRef.current?.duration || initialSeekRef.current)));

            if (videoRef.current && videoRef.current.readyState >= 1) {

              videoRef.current.currentTime = seekTo;

              initialSeekDoneRef.current = true;

            } else {

              // Wait for loadedmetadata to set the time

              const once = () => {

                try {

                  videoRef.current!.currentTime = seekTo;

                } catch (e) {

                  console.warn('Failed initial seek on metadata:', e);

                }

                initialSeekDoneRef.current = true;

                videoRef.current?.removeEventListener('loadedmetadata', once);

              };

              videoRef.current.addEventListener('loadedmetadata', once);

            }

          } catch (e) {

            console.warn('Failed initial seek:', e);

          }

        }

        if (settings.autoplay) {
          const playDirectSource = () => {
            videoRef.current?.play().catch(() => { });
            videoRef.current?.removeEventListener('loadedmetadata', playDirectSource);
          };

          if (videoRef.current.readyState >= 1) {
            videoRef.current.play().catch(() => { });
          } else {
            videoRef.current.addEventListener('loadedmetadata', playDirectSource);
          }
        }



        // Also start periodic saver

        if (progressIntervalRef.current === null) {

          progressIntervalRef.current = window.setInterval(() => {

            const time = Math.floor(videoRef.current?.currentTime || 0);

            const dur = Math.floor(videoRef.current?.duration || 0) || undefined;

            if (onProgressUpdate && time !== lastSavedProgressRef.current && Math.abs(time - lastSavedProgressRef.current) >= PROGRESS_SAVE_INTERVAL) {

              onProgressUpdate(time, dur, false);

              setLastSavedProgress(time);

              lastSavedProgressRef.current = time;

            }

          }, PROGRESS_SAVE_INTERVAL * 1000);

        }

      }

    },

    [sourceKey, isOffline, playbackReferer, playbackUserAgent, settings.autoplay]

  );



  useEffect(() => {

    loadVideo();



    return () => {

      if (hlsRef.current) {

        hlsRef.current.destroy();

        hlsRef.current = null;

      }

    };

  }, [loadVideo]);



  // Video event handlers

  useEffect(() => {

    const video = videoRef.current;

    if (!video) return;



    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.currentTime > lastObservedTimeRef.current + 0.05) {
        lastObservedTimeRef.current = video.currentTime;
        lastProgressAtRef.current = Date.now();
      }
    };

    const handleDurationChange = () => setDuration(video.duration);

    const handlePlay = () => { setIsPlaying(true); onPlay?.(); };

    const handlePause = () => { setIsPlaying(false); onPause?.(); };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handlePlaying = () => {
      setIsBuffering(false);
      lastProgressAtRef.current = Date.now();
    };

    const handleProgress = () => {

      if (video.buffered.length > 0) {

        setBuffered(video.buffered.end(video.buffered.length - 1));

      }

    };

    const handleEnded = () => {
      // Final save marking completed
      const dur = Math.floor(videoRef.current?.duration || 0) || undefined;
      const finalPos = Math.floor(videoRef.current?.currentTime || 0);
      if (onProgressUpdate) {
        onProgressUpdate(dur ?? finalPos, dur, true);
      }

      if (settings.autoNextEpisode && onEpisodeEnd) {
        onEpisodeEnd();
      }
    };

    const handleError = (e: any) => {
      console.error('Video Error:', e);
      const err = videoRef.current?.error;
      if (err) {
        console.error('Video Error Code:', err.code, err.message);
        setVideoError(`Playback Error (${err.code}): ${err.message || 'Unknown error'}`);
      } else {
        setVideoError('Playback failed');
      }
      if (onError) onError();
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("progress", handleProgress);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("error", handleError);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("progress", handleProgress);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("error", handleError);
    };

  }, [settings.autoNextEpisode, onEpisodeEnd]);

  useEffect(() => {
    if (bufferingTimeoutRef.current !== null) {
      clearTimeout(bufferingTimeoutRef.current);
      bufferingTimeoutRef.current = null;
    }

    if (!isBuffering || !currentSource?.url) return;

    bufferingTimeoutRef.current = window.setTimeout(() => {
      const stalledMs = Date.now() - lastProgressAtRef.current;
      if (stalledMs >= 15000) {
        setVideoError("Server timed out. Auto-switching server in 3 seconds...");
        if (onError) onError();
      }
    }, 16000);

    return () => {
      if (bufferingTimeoutRef.current !== null) {
        clearTimeout(bufferingTimeoutRef.current);
        bufferingTimeoutRef.current = null;
      }
    };
  }, [isBuffering, currentSource?.url, onError]);



  // Keep latest progress callback without re-subscribing effects

  useEffect(() => {

    progressCallbackRef.current = onProgressUpdate ?? null;

  }, [onProgressUpdate]);



  // Persist final progress on unload or when component unmounts

  useEffect(() => {

    const handleBeforeUnload = () => {

      const time = Math.floor(videoRef.current?.currentTime || 0);

      const dur = Math.floor(videoRef.current?.duration || 0) || undefined;

      if (progressCallbackRef.current) progressCallbackRef.current(time, dur, false);

    };



    window.addEventListener('beforeunload', handleBeforeUnload);



    return () => {

      window.removeEventListener('beforeunload', handleBeforeUnload);

      if (progressIntervalRef.current !== null) {

        clearInterval(progressIntervalRef.current as number);

        progressIntervalRef.current = null;

      }

      // Save one last time on unmount using the latest callback

      const time = Math.floor(videoRef.current?.currentTime || 0);

      const dur = Math.floor(videoRef.current?.duration || 0) || undefined;

      if (progressCallbackRef.current) progressCallbackRef.current(time, dur, false);

    };

  }, []);



  // Keyboard shortcuts (desktop only)

  useEffect(() => {

    if (isMobile) return;



    const handleKeyDown = (e: KeyboardEvent) => {

      if (

        document.activeElement?.tagName === "INPUT" ||

        document.activeElement?.tagName === "TEXTAREA"

      )

        return;



      switch (e.key.toLowerCase()) {

        case " ":

        case "k":

          e.preventDefault();

          togglePlay();

          break;

        case "f":

          e.preventDefault();

          toggleFullscreen();

          break;

        case "m":

          e.preventDefault();

          toggleMute();

          break;

        case "arrowleft":

          e.preventDefault();

          skip(-10);

          break;

        case "arrowright":

          e.preventDefault();

          skip(10);

          break;

        case "arrowup":

          e.preventDefault();

          changeVolume(0.1);

          break;

        case "arrowdown":

          e.preventDefault();

          changeVolume(-0.1);

          break;

      }

    };



    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);

  }, [isMobile]);



  // Controls visibility

  const showControlsTemporarily = useCallback(() => {

    setShowControls(true);

    if (controlsTimeoutRef.current) {

      clearTimeout(controlsTimeoutRef.current);

    }

    controlsTimeoutRef.current = setTimeout(() => {

      if (isPlaying) setShowControls(false);

    }, 3000);

  }, [isPlaying]);



  const togglePlay = () => {

    if (videoRef.current) {

      if (isPlaying) {

        videoRef.current.pause();

      } else {

        videoRef.current.play().catch(() => { });

      }

    }

  };



  const toggleMute = () => {

    if (videoRef.current) {

      videoRef.current.muted = !isMuted;

      setIsMuted(!isMuted);

    }

  };



  const changeVolume = (delta: number) => {

    if (videoRef.current) {

      const newVolume = Math.max(0, Math.min(1, volume + delta));

      videoRef.current.volume = newVolume;

      setVolume(newVolume);

      if (newVolume > 0) setIsMuted(false);

    }

  };



  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {

    const newVolume = parseFloat(e.target.value);

    if (videoRef.current) {

      videoRef.current.volume = newVolume;

      setVolume(newVolume);

      setIsMuted(newVolume === 0);

    }

  };



  const skip = (seconds: number) => {

    if (videoRef.current) {

      videoRef.current.currentTime = Math.max(

        0,

        Math.min(duration, currentTime + seconds)

      );

    }

  };



  const handleProgressBarHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isLive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX;
    const percent = (clientX - rect.left) / rect.width;
    const clampedPercent = Math.max(0, Math.min(1, percent));
    const time = clampedPercent * duration;
    setHoverPercent(clampedPercent * 100);
    setHoverTime(time);
    setShowHoverTime(true);
  };

  const handleProgressBarLeave = () => {
    setShowHoverTime(false);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {

    const rect = e.currentTarget.getBoundingClientRect();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;

    const percent = (clientX - rect.left) / rect.width;

    const newTime = Math.max(0, Math.min(duration, percent * duration));

    if (videoRef.current) {

      videoRef.current.currentTime = newTime;

      // Update UI immediately for responsive feedback

      setCurrentTime(newTime);

    }

  };



  const handleScreenshot = () => {
    if (!videoRef.current) return;

    try {
      // Create a canvas with the current video frame
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw the video frame to canvas
      ctx.drawImage(videoRef.current, 0, 0);

      // Convert canvas to blob and create download link
      canvas.toBlob((blob) => {
        if (!blob) return;

        // Create filename with timestamp and episode info
        const timestamp = new Date().toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }).replace(/[/,: ]/g, '-');
        const filename = `screenshot-${animeName || 'anime'}-ep${episodeNumber || '?'}-${timestamp}.png`;

        // Create download link
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success(`Screenshot saved: ${filename}`);
      }, 'image/png');
    } catch (err) {
      console.error('Screenshot failed:', err);
      toast.error('Failed to create screenshot');
    }
  };

  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if ((document as any).pictureInPictureEnabled !== false) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('PiP not supported', e);
    }
  };

  const lockLandscapeOnMobile = useCallback(async () => {
    if (!isMobile) return;
    try {
      const orientationApi = screen.orientation as any;
      if (orientationApi?.lock) {
        await orientationApi.lock('landscape');
      }
    } catch {
      // Some mobile browsers block orientation lock; ignore silently.
    }
  }, [isMobile]);

  const unlockOrientationOnMobile = useCallback(() => {
    if (!isMobile) return;
    try {
      if (screen.orientation?.unlock) {
        screen.orientation.unlock();
      }
    } catch {
      // Ignore unlock failures.
    }
  }, [isMobile]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnter = () => setIsPiP(true);
    const onLeave = () => setIsPiP(false);
    video.addEventListener('enterpictureinpicture', onEnter);
    video.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnter);
      video.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, []);

  const toggleFullscreen = async () => {

    if (!containerRef.current) return;



    if (!isFullscreen) {

      try {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if ((containerRef.current as any).webkitRequestFullscreen) {
          await Promise.resolve((containerRef.current as any).webkitRequestFullscreen());
        }
      } catch {
        // Ignore fullscreen API errors.
      }

      await lockLandscapeOnMobile();

    } else {

      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await Promise.resolve((document as any).webkitExitFullscreen());
        }
      } catch {
        // Ignore fullscreen API errors.
      }

      unlockOrientationOnMobile();

    }

  };



  useEffect(() => {

    const handleFullscreenChange = () => {

      const activeFullscreen = !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
      setIsFullscreen(activeFullscreen);
      if (!activeFullscreen) {
        unlockOrientationOnMobile();
      }

    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    return () => {

      document.removeEventListener("fullscreenchange", handleFullscreenChange);

      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);

    };

  }, [unlockOrientationOnMobile]);



  const handlePlaybackRateChange = (rate: number) => {

    if (videoRef.current) {

      videoRef.current.playbackRate = rate;

      setPlaybackRate(rate);

    }

    setShowSettings(false);

  };





  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;



  return (

    <div

      ref={containerRef}

      className="relative aspect-video bg-black rounded-xl md:rounded-2xl overflow-hidden group touch-manipulation video-player-container video-player-modern"

      onMouseMove={!isMobile ? showControlsTemporarily : undefined}

      onMouseLeave={() => !isMobile && isPlaying && setShowControls(false)}

      onTouchStart={showControlsTemporarily}

    >

      {/* Video Element with enhanced subtitle styling */}

      <video
        ref={videoRef}
        className={`w-full h-full object-contain video-with-subtitles subtitle-${settings.subtitleSize} subtitle-font-${settings.subtitleFont} subtitle-bg-${settings.subtitleBackground}`}
        poster={resolvedPoster}
        playsInline
        // REMOVED crossOrigin entirely for offline to avoid local asset blocks
        {...(!isOffline ? { crossOrigin: "anonymous" } : {})}
        onClick={togglePlay}
      >

        {[...subtitles, ...customSubtitles].map((sub, idx) => {
          const subtitleKey = getSubtitleSelectionKey(sub, idx);
          const blobUrl = subtitleBlobs[sub.url];
          // For custom subs, the URL is already local/user-selected.
          // For provider subs, prefer prefetched blob, then proxy URL, then original URL.
          const proxiedUrl = !isOffline ? getProxiedSubtitleUrl(sub.url, headers?.Referer) : sub.url;
          const src = sub.lang === 'custom' ? sub.url : (blobUrl || proxiedUrl || sub.url);

          return (
            <track
              key={subtitleKey}
              kind="subtitles"
              src={src}
              srcLang={toTrackLanguageCode(sub.lang)}
              label={sub.label || sub.lang}
              default={currentSubtitle !== 'off' && currentSubtitle === subtitleKey}
            />
          );
        })}

      </video>



      {/* View Counter Overlay - shows in top right */}

      {viewCount !== undefined && viewCount > 0 && showControls && (

        <div className="absolute top-3 right-3 md:top-4 md:right-4 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/70 backdrop-blur-md text-white/90 text-xs md:text-sm font-medium z-10 transition-all duration-300 border border-white/10">

          <Eye className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary" />

          <span className="font-semibold">{viewCount >= 1000 ? `${(viewCount / 1000).toFixed(1)}K` : viewCount}</span>

          <span className="text-white/50 hidden sm:inline">views</span>

        </div>

      )}



      {/* Loading State */}

      {(isLoading || isBuffering) && !videoError && (

        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">

          <div className="flex flex-col items-center gap-4">

            <div className="relative">

              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />

              <div className="absolute inset-0 flex items-center justify-center">

                <Play className="w-6 h-6 md:w-8 md:h-8 text-primary/70" />

              </div>

            </div>

            <span className="text-sm md:text-base text-white/80 font-medium">

              {serverName ? `Loading ${serverName}...` : "Loading..."}

            </span>

          </div>

        </div>

      )}



      {/* Error State with detailed info */}
      {videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm z-50">
          <div className="flex flex-col items-center gap-4 text-center p-6 md:p-10 max-w-md">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-destructive/20 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 md:w-10 md:h-10 text-destructive" />
            </div>
            <p className="text-base md:text-lg text-white font-semibold">{videoError}</p>
            {isOffline && (
              <div className="text-xs text-white/50 bg-black/50 p-2 rounded mt-2 font-mono break-all max-w-[300px]">
                Debug: {videoRef.current?.currentSrc || 'No Source'} <br />
                Error: {videoRef.current?.error?.message || videoRef.current?.error?.code || 'Unknown'}
              </div>
            )}

            <p className="text-sm text-white/60">
              {(videoError.toLowerCase().includes('auto-switching') || videoError.toLowerCase().includes('switching server'))
                ? 'Auto-switching to the next server in 3 seconds...'
                : videoError.toLowerCase().includes('retrying')
                  ? 'Retrying automatically...'
                  : 'Automatic server failover is enabled.'}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mt-2">

              <button

                onClick={() => {

                  const now = Date.now();
                  if (now < manualRetryLockUntilRef.current) return;
                  manualRetryLockUntilRef.current = now + 2500;

                  // Manual retry should cancel pending auto-failover and retry current server first.
                  if (onRetryCurrentServer) onRetryCurrentServer();

                  retryCountRef.current = 0;
                  setRetryCount(0);

                  loadVideo();

                }}

                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm flex items-center justify-center gap-2 transition-all font-medium video-controls-btn"
                disabled={isBuffering}

              >

                <RefreshCw className="w-4 h-4" />

                Retry Current Server

              </button>

              {onServerSwitch && (

                <button

                  onClick={onServerSwitch}

                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/80 text-primary-foreground flex items-center justify-center gap-2 transition-all font-medium shadow-lg shadow-primary/30"

                >

                  Switch Server

                </button>

              )}

            </div>

          </div>

        </div>

      )}



      {/* Center Play Button */}

      {!isPlaying && !isLoading && !isBuffering && !videoError && !isLive && (

        <button

          onClick={togglePlay}

          className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/50 via-transparent to-black/20"

        >

          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-primary/90 flex items-center justify-center hover:scale-110 transition-all duration-300 shadow-2xl shadow-primary/40 backdrop-blur-sm border border-white/20">

            <Play className="w-8 h-8 md:w-10 md:h-10 text-white fill-current ml-1" />

          </div>

        </button>

      )}



      {/* Aniskip Skip Button */}

      {activeSkip && !videoError && (

        <button

          onClick={handleSkip}

          className="absolute bottom-24 md:bottom-28 right-4 md:right-6 px-5 py-3 md:px-6 md:py-3.5 rounded-xl bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white font-bold flex items-center gap-2.5 shadow-2xl transition-all hover:scale-105 animate-in slide-in-from-right-5 z-20 skip-button-glow border border-white/20"

        >

          <FastForward className="w-5 h-5 md:w-6 md:h-6" />

          <span className="text-sm md:text-base uppercase tracking-wide">{getSkipLabel(activeSkip.skipType)}</span>

        </button>

      )}



      {/* Controls Overlay */}

      <div

        className={`absolute inset-x-0 bottom-0 video-controls-gradient p-4 md:p-5 transition-all duration-300 ${showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"

          }`}

      >

        {/* Progress Bar */}

        <div

          className={`relative h-1 md:h-1.5 bg-white/20 rounded-full group/progress mb-4 md:mb-5 video-progress-track ${isLive ? 'cursor-default pointer-events-none' : 'cursor-pointer'}`}

          onClick={!isLive ? handleSeek : undefined}

          onTouchMove={!isLive ? handleSeek : undefined}

          onMouseMove={!isLive ? handleProgressBarHover : undefined}

          onMouseLeave={!isLive ? handleProgressBarLeave : undefined}

        >

          {/* Hover Time Tooltip */}

          {showHoverTime && !isLive && (

            <div

              className="absolute bottom-full mb-2 bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none z-50 font-medium"

              style={{ left: `calc(${hoverPercent}% - 24px)` }}

            >

              {formatTime(hoverTime)}

            </div>

          )}

          {/* Skip Time Markers (yellow) */}

          {effectiveSkipTimes.map((skip) => {

            const startPercent = duration > 0 ? (skip.interval.startTime / duration) * 100 : 0;

            const widthPercent = duration > 0 ? ((skip.interval.endTime - skip.interval.startTime) / duration) * 100 : 0;

            return (

              <div

                key={skip.skipId}

                className="absolute h-full bg-yellow-400 rounded-full z-10"

                style={{

                  left: `${startPercent}%`,

                  width: `${widthPercent}%`

                }}

                title={getSkipLabel(skip.skipType)}

              />

            );

          })}

          {/* Buffered */}

          <div

            className="absolute h-full bg-white/30 rounded-full"

            style={{ width: `${bufferedPercent}%` }}

          />

          {/* Progress */}

          <div

            className="absolute h-full bg-gradient-to-r from-primary via-primary to-secondary rounded-full z-20 transition-all"

            style={{ width: `${progress}%` }}

          />

          {/* Thumb */}

          {!isLive && (

            <div

              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-all z-30 ring-2 ring-primary/50"

              style={{ left: `calc(${progress}% - 8px)` }}

            />

          )}

        </div>



        {/* Controls Row */}

        <div className="flex items-center justify-between gap-3 md:gap-4">

          {/* Left Controls */}

          <div className="flex items-center gap-1.5 md:gap-2">

            <button

              onClick={togglePlay}

              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all video-controls-btn"

            >

              {isPlaying ? (

                <Pause className="w-5 h-5 md:w-6 md:h-6" />

              ) : (

                <Play className="w-5 h-5 md:w-6 md:h-6 fill-current" />

              )}

            </button>



            {!isLive && (

              <>

                <button

                  onClick={() => skip(-10)}

                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all hidden sm:flex video-controls-btn"

                >

                  <SkipBack className="w-4 h-4 md:w-5 md:h-5" />

                </button>



                <button

                  onClick={() => skip(10)}

                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all hidden sm:flex video-controls-btn"

                >

                  <SkipForward className="w-4 h-4 md:w-5 md:h-5" />

                </button>

              </>

            )}



            {/* Volume - hide on mobile */}

            <div className="hidden md:flex items-center gap-2 group/volume ml-1">

              <button

                onClick={toggleMute}

                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all video-controls-btn"

              >

                {isMuted || volume === 0 ? (

                  <VolumeX className="w-5 h-5" />

                ) : (

                  <Volume2 className="w-5 h-5" />

                )}

              </button>

              <div className="w-0 group-hover/volume:w-24 overflow-hidden transition-all duration-300">

                <input

                  type="range"

                  min="0"

                  max="1"

                  step="0.05"

                  value={isMuted ? 0 : volume}

                  onChange={handleVolumeChange}

                  className="w-24 h-1.5 accent-primary cursor-pointer bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"

                />

              </div>

            </div>



            {/* Time */}

            <div className="flex items-center gap-1.5 ml-2 px-2.5 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm">

              <span className="text-xs md:text-sm font-medium text-white/90">{formatTime(currentTime)}</span>

              <span className="text-white/40">/</span>

              <span className="text-xs md:text-sm text-white/60">{formatTime(duration)}</span>

            </div>

          </div>



          {/* Right Controls */}

          <div className="flex items-center gap-1 md:gap-2">

            {/* Subtitle Selector */}

            {subtitles.length > 0 && (

              <div className="relative">

                <button

                  onClick={() => {

                    setShowSubtitleMenu(!showSubtitleMenu);

                    setShowSettings(false);

                  }}

                  className={`p-2 rounded-lg hover:bg-white/10 transition-colors pointer-events-auto ${currentSubtitle !== 'off' ? 'text-primary' : ''

                    }`}

                >

                  <Subtitles className="w-4 h-4 md:w-5 md:h-5" />

                </button>



                {showSubtitleMenu && (

                  <div className="absolute bottom-full right-0 mb-2 bg-background/95 backdrop-blur-sm border border-border rounded-xl p-2 min-w-[120px] md:min-w-[150px] max-h-[400px] overflow-y-auto pointer-events-auto">

                    <div className="text-xs text-muted-foreground px-2 py-1 mb-1">

                      Subtitles

                    </div>

                    <button

                      onClick={() => {

                        handleSubtitleChange('off');

                        setShowSubtitleMenu(false);

                      }}

                      className={`w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors ${currentSubtitle === 'off'

                        ? "text-primary font-medium"

                        : "text-foreground"

                        }`}

                    >

                      Off

                    </button>

                    {/* Native Subtitles */}
                    {[...subtitles, ...customSubtitles].map((sub, idx) => (
                      (() => {
                        const subtitleSelectionKey = getSubtitleSelectionKey(sub, idx);
                        return (
                      <button
                        key={idx}
                        onClick={() => {
                          handleSubtitleChange(subtitleSelectionKey);
                          setShowSubtitleMenu(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors ${currentSubtitle === subtitleSelectionKey
                          ? "text-primary font-medium"
                          : "text-foreground"
                          }`}
                      >
                        <span className="truncate block max-w-[120px]">{sub.label || sub.lang}</span>
                      </button>
                        );
                      })()
                    ))}

                    <div className="h-px bg-border my-1" />

                    <label className="w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors text-foreground flex items-center gap-2 cursor-pointer">
                      <Upload className="w-3 h-3" />
                      <span>Add Custom</span>
                      <input
                        type="file"
                        accept=".vtt,.srt"
                        className="hidden"
                        onChange={handleCustomSubtitleUpload}
                      />
                    </label>

                  </div>

                )}

              </div>

            )}



            {/* Speed Settings */}

            <div className="relative">

              <button

                onClick={() => {

                  setShowSettings(!showSettings);

                  setShowSubtitleMenu(false);

                }}

                className="p-2 rounded-lg hover:bg-white/10 transition-colors"

              >

                <Settings className="w-4 h-4 md:w-5 md:h-5" />

              </button>



              {showSettings && (

                <div className="absolute bottom-full right-0 mb-2 bg-background/95 backdrop-blur-sm border border-border rounded-xl p-2 min-w-[100px] md:min-w-[120px]">

                  <div className="text-xs text-muted-foreground px-2 py-1 mb-1">

                    Speed

                  </div>

                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (

                    <button

                      key={rate}

                      onClick={() => handlePlaybackRateChange(rate)}

                      className={`w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors ${playbackRate === rate

                        ? "text-primary font-medium"

                        : "text-foreground"

                        }`}

                    >

                      {rate}x

                    </button>

                  ))}

                </div>

              )}

            </div>



            {/* Player Preferences */}

            <button

              onClick={() => setShowSettingsPanel(true)}

              className="p-2 rounded-lg hover:bg-white/10 transition-colors"

              title="Player Preferences"

            >

              <SlidersHorizontal className="w-4 h-4 md:w-5 md:h-5" />

            </button>



            {/* Download Button (Native only, not in offline mode) */}
            {isNative && !isOffline && serverName?.includes('Luffy') && episodeId && (
              <div className="relative group/download">
                <button
                  onClick={async () => {
                    await startDownload({
                      episodeId: episodeId,
                      animeName: animeName || '',
                      episodeNumber: episodeNumber || 1,
                      posterUrl: animePoster || poster || '',
                    });
                  }}
                  disabled={downloadStates[episodeId]?.status === 'downloading'}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors relative"
                  title="Download Episode"
                >
                  {downloadStates[episodeId]?.status === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-green-500" />
                  ) : downloadStates[episodeId]?.status === 'downloading' ? (
                    <div className="relative flex items-center justify-center">
                      <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin text-primary" />
                      <span className="absolute text-[6px] font-bold">
                        {Math.round(downloadStates[episodeId]?.progress || 0)}
                      </span>
                    </div>
                  ) : (
                    <Download className="w-4 h-4 md:w-5 md:h-5" />
                  )}
                </button>
              </div>
            )}



            {/* Screenshot Button */}
            {!isLive && (
              <button
                onClick={handleScreenshot}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                title="Take Screenshot"
              >
                <Camera className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            )}

            {/* Picture in Picture */}
            {!isMobile && typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && (document as any).pictureInPictureEnabled && (
              <button
                onClick={togglePiP}
                className={`p-2 rounded-lg hover:bg-white/10 transition-colors ${isPiP ? 'text-primary' : ''}`}
                title="Picture in Picture (I)"
              >
                <PictureInPicture2 className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            )}

            {/* Fullscreen */}

            <button

              onClick={toggleFullscreen}

              className="p-2 rounded-lg hover:bg-white/10 transition-colors"

            >

              {isFullscreen ? (

                <Minimize className="w-4 h-4 md:w-5 md:h-5" />

              ) : (

                <Maximize className="w-4 h-4 md:w-5 md:h-5" />

              )}

            </button>

          </div>

        </div>

      </div>



      {/* Settings Panel */}

      <VideoSettingsPanel

        isOpen={showSettingsPanel}

        onClose={() => setShowSettingsPanel(false)}

        availableSubtitles={[...subtitles, ...customSubtitles].map((s, idx) => ({
          lang: s.lang,
          label: s.label || s.lang,
          value: getSubtitleSelectionKey(s, idx),
        }))}

      />

    </div >

  );

}