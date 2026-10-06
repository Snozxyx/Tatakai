import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Settings,
  Subtitles,
  Loader2,
  AlertCircle,
  RefreshCw,
  Maximize,
  Minimize,
  Lock,
  Unlock,
  Volume2,
  VolumeX,
  ChevronLeft,
  Rewind,
  FastForward,
  Camera,
} from "lucide-react";
import Hls from "hls.js";
import { toast } from "sonner";
import { useVideoSettings } from "@/hooks/media/useVideoSettings";
import { useAniskip } from "@/hooks/media/useAniskip";
import { getProxiedImageUrl, getProxiedVideoUrl, getProxiedSubtitleUrl, trackEvent } from "@/lib/api";
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { cn } from "@/lib/utils";
import { formatTime } from "@/core/player/time-utils";
import { buildSubtitleFetchCandidates, getSubtitleSelectionKey, isBrowserReadyVttUrl, normalizeSubtitleToVtt } from "@/core/player/subtitle-utils";
import { buildMobilePlaybackCandidates, firstFulfilled, markProxyWorking, probePlaybackCandidate } from "@/core/player/stream-resolver";
import { getProfileKnobs } from "@/lib/memoryProfile";
import { capQualityForDataSaver, getEffectiveMemoryProfile, shouldAutoplayVideo } from "@/lib/mobile/dataSaver";
import { UpNextOverlay } from "./overlays/UpNextOverlay";
import { VideoSettingsPanel } from "./VideoSettingsPanel";
import { buildSubtitleCueStyle } from "@/lib/video/subtitleStyle";
import { ensureCustomSubtitleFontLoaded } from "@/lib/video/customSubtitleFont";
import { triggerHaptic } from "@/lib/haptics";
import { useActiveCues } from "./hooks/useActiveCues";
import {
  isAnyProxyUrl,
  isMobileProxyUrl,
  getNativeProxyBaseUrl,
  registerMobileSource,
  reregisterMobileSource,
  resolveMobileProxy,
  unwrapMobileProxyUrl,
} from "@/core/extensions/mobile/mobileProxy";
import { createNativeHlsLoader } from "@/core/extensions/mobile/nativeHlsLoader";
import { DownloadButton } from "./controls/DownloadButton";

interface MobileVideoPlayerProps {
  sources: Array<{ url: string; isM3U8: boolean; quality?: string }>;
  subtitles?: Array<{ lang: string; url: string; label?: string }>;
  headers?: { Referer?: string; Origin?: string; "User-Agent"?: string };
  poster?: string;
  onError?: (context?: { statusCode?: number; reason?: string }) => void;
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
  hideTimelineUi?: boolean;
  onProgressUpdate?: (progressSeconds: number, durationSeconds?: number, completed?: boolean, flush?: boolean) => void;
  animeId?: string;
  animeName?: string;
  animePoster?: string;
  episodeId?: string;
  onBack?: () => void;
  episodeTitle?: string;
  isOffline?: boolean;
  /** Playing source type (hls/torrent/…) — gates torrent download URL like desktop. */
  sourceType?: string;
  /** Torrent magnet/bridge URL — only used when the playing source is a torrent. */
  torrentUrl?: string;
}

// formatTime + subtitle helper functions moved to @/core/player/*

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

function normalizeSubtitleLanguage(value?: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'en' || normalized.startsWith('eng') || normalized.includes('english')) return 'en';
  if (normalized === 'es' || normalized.startsWith('spa') || normalized.includes('spanish') || normalized.includes('espanol')) return 'es';
  if (normalized === 'fr' || normalized.startsWith('fra') || normalized.startsWith('fre') || normalized.includes('french')) return 'fr';
  if (normalized === 'de' || normalized.startsWith('deu') || normalized.startsWith('ger') || normalized.includes('german')) return 'de';
  if (normalized === 'ja' || normalized.startsWith('jpn') || normalized.includes('japanese')) return 'ja';
  if (normalized === 'pt' || normalized.startsWith('por') || normalized.includes('portuguese')) return 'pt';
  if (normalized === 'ar' || normalized.startsWith('ara') || normalized.includes('arabic')) return 'ar';
  if (normalized === 'hi' || normalized.startsWith('hin') || normalized.includes('hindi')) return 'hi';
  if (normalized.length >= 2) return normalized.slice(0, 2);
  return normalized;
}

function subtitleMatchesPreference(subtitle: { lang?: string; label?: string }, preference: string): boolean {
  const normalizedPreference = String(preference || '').trim().toLowerCase();
  const language = normalizeSubtitleLanguage(subtitle.lang);
  const label = String(subtitle.label || '').toLowerCase();
  const combined = `${String(subtitle.lang || '').toLowerCase()} ${label}`;

  if (normalizedPreference === 'english') return language === 'en' || combined.includes('english') || combined.includes('eng');
  if (normalizedPreference === 'spanish') return language === 'es' || combined.includes('spanish') || combined.includes('espanol');
  if (normalizedPreference === 'french') return language === 'fr' || combined.includes('french');
  if (normalizedPreference === 'german') return language === 'de' || combined.includes('german');
  if (normalizedPreference === 'japanese') return language === 'ja' || combined.includes('japanese');
  if (normalizedPreference === 'portuguese') return language === 'pt' || combined.includes('portuguese');
  if (normalizedPreference === 'arabic') return language === 'ar' || combined.includes('arabic');
  if (normalizedPreference === 'hindi') return language === 'hi' || combined.includes('hindi');
  if (normalizedPreference.length === 2) return language === normalizedPreference;

  return combined.includes(normalizedPreference);
}

type SkipSegment = {
  startTime: number;
  endTime: number;
  type: 'op' | 'ed' | 'mixed-op' | 'mixed-ed' | 'recap';
};

// Recovery budgets. Bounds come from desktop's HlsAdapter, which the mobile
// player did not have until now.
const MAX_SAME_URL_RETRIES = 1;
const MAX_MEDIA_RECOVERIES = 2;
const PROBE_CANDIDATES = 3;
// How long a `waiting` state may persist before we treat the stream as dead
// and run the recovery ladder. 6s (was 12s): long enough to ride out a slow
// first segment on LTE, short enough that a frozen episode recovers instead
// of spinning.
const STALL_TIMEOUT_MS = 6_000;

// Body/html class + window event the mobile player toggles while its
// CSS-fallback fullscreen is active. App chrome (MobileNav/Sidebar) hides on
// both so a trapped stacking context on some devices can't leave the nav
// painted above the video.
export const MOBILE_PLAYER_FULLSCREEN_CLASS = 'mobile-player-fullscreen';
export const MOBILE_PLAYER_FULLSCREEN_EVENT = 'tatakai-mobile-player-fullscreen';

export function MobileVideoPlayer({
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
  initialSeekSeconds,
  hideTimelineUi: _hideTimelineUi,
  onProgressUpdate,
  animeId,
  animeName,
  animePoster,
  episodeId,
  onBack,
  episodeTitle,
  isOffline,
  sourceType,
  torrentUrl,
}: MobileVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const { settings } = useVideoSettings();
  const { skipTimes, fetchSkipTimes } = useAniskip();

  const tatakaiSkipSegments = useMemo<SkipSegment[]>(() => {
    const segments: SkipSegment[] = [];

    if (introWindow && Number.isFinite(introWindow.start) && Number.isFinite(introWindow.end) && introWindow.end > introWindow.start) {
      segments.push({ startTime: introWindow.start, endTime: introWindow.end, type: 'op' });
    }

    if (outroWindow && Number.isFinite(outroWindow.start) && Number.isFinite(outroWindow.end) && outroWindow.end > outroWindow.start) {
      segments.push({ startTime: outroWindow.start, endTime: outroWindow.end, type: 'ed' });
    }

    return segments;
  }, [introWindow?.start, introWindow?.end, outroWindow?.start, outroWindow?.end]);

  const aniskipSegments = useMemo<SkipSegment[]>(() => {
    return (skipTimes || [])
      .filter((skip) => Number.isFinite(skip?.interval?.startTime) && Number.isFinite(skip?.interval?.endTime) && skip.interval.endTime > skip.interval.startTime)
      .map((skip) => ({
        startTime: skip.interval.startTime,
        endTime: skip.interval.endTime,
        type: skip.skipType,
      }));
  }, [skipTimes]);

  const hasTatakaiSkipSegments = tatakaiSkipSegments.length > 0;
  const effectiveSkipSegments = hasTatakaiSkipSegments ? tatakaiSkipSegments : aniskipSegments;

  const nativeMobile = Capacitor.isNativePlatform();
  const resolvedPoster = useMemo(() => {
    if (!poster) return undefined;
    if (nativeMobile && getNativeProxyBaseUrl() && /^https?:/i.test(poster)) {
      return registerMobileSource({ url: poster });
    }
    return nativeMobile ? poster : getProxiedImageUrl(poster);
  }, [poster, nativeMobile]);

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffered, setBuffered] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const retryCountRef = useRef(0);
  // Recovery bookkeeping. `retryCountRef` is same-URL retries; the rest drive
  // the candidate ladder and the media (buffer-append) recovery path.
  const candidateIndexRef = useRef(0);
  const mediaRetryRef = useRef(0);
  const recoveringRef = useRef(false);
  const recoverRef = useRef<(() => void) | null>(null);
  const metadataAutoplayCleanup = useRef<(() => void) | null>(null);
  const stallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentSubtitle, setCurrentSubtitle] = useState<string>(settings.subtitleLanguage);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showFullSettings, setShowFullSettings] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [activeSkip, setActiveSkip] = useState<SkipSegment | null>(null);
  const [, setPlaybackRate] = useState(settings.playbackSpeed);
  const [subtitleBlobs, setSubtitleBlobs] = useState<Record<string, string>>({});
  // Auto-next Up-Next countdown (null = hidden).
  const [upNextCountdown, setUpNextCountdown] = useState<number | null>(null);

  // HLS alternate audio (multi-audio streams): surfaced in the settings sheet
  // like desktop's Audio tab. Native torrent audio stays in the native UI.
  const [hlsAudioTracks, setHlsAudioTracks] = useState<Array<{ id: number; label: string; lang: string }>>([]);
  const [currentHlsAudioTrack, setCurrentHlsAudioTrack] = useState<number>(-1);

  // Full settings sheet options — same source as desktop (parity).
  const settingsSubtitleOptions = useMemo(
    () =>
      subtitles.map((sub, idx) => ({
        lang: sub.lang,
        label: sub.label || sub.lang,
        value: getSubtitleSelectionKey(sub, idx),
      })),
    [subtitles],
  );

  const visibleSubtitles = useMemo(
    () =>
      subtitles.filter((sub) => {
        const url = String(sub.url || '').trim();
        if (!url) return false;
        if (isBrowserReadyVttUrl(url)) return true;
        if (subtitleBlobs[url]) return true;
        return false;
      }),
    [subtitles, subtitleBlobs],
  );
  
  // Double-tap seek
  const [doubleTapSide, setDoubleTapSide] = useState<'left' | 'right' | null>(null);
  const [seekAmount, setSeekAmount] = useState(0);
  const [hoverTime, setHoverTime] = useState<number>(0);
  const [showHoverTime, setShowHoverTime] = useState(false);
  const [hoverPercent, setHoverPercent] = useState(0);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const doubleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekAccumulatorRef = useRef(0);

  // Progress tracking
  const lastSavedProgressRef = useRef<number>(0);
  const PROGRESS_SAVE_INTERVAL = 15;
  const currentSource = useMemo(
    () => selectPreferredSource(sources, capQualityForDataSaver(settings.defaultQuality)),
    [sources, settings.defaultQuality],
  );
  const sourceUrlKey = currentSource?.url || '';
  const sourceTypeKey = currentSource?.isM3U8 || (currentSource as any)?.sourceType === 'hls' || /\.m3u8(?:$|[?#/])/i.test(currentSource?.url || '') ? 'm3u8' : 'file';
  const sourceHeaders = (currentSource as any)?.headers as Record<string, string> | undefined;
  const playbackReferer = sourceHeaders?.Referer || sourceHeaders?.referer || headers?.Referer || '';
  const playbackUserAgent = sourceHeaders?.["User-Agent"] || sourceHeaders?.['user-agent'] || headers?.["User-Agent"] || '';
  const autoSkippedWindowRef = useRef<string | null>(null);

  // A source failure replaces the video element with the error surface. This
  // component is reused for server switches, so clear that source-local error
  // whenever a different URL is selected; otherwise the new source never gets
  // a video element or a chance to initialize.
  //
  // Resolved debrid stream URL for magnet: sources (async — the mount effect
  // below waits for it). Cleared here so a server switch re-resolves.
  const [debridResolvedUrl, setDebridResolvedUrl] = useState<string | null>(null);
  useEffect(() => {
    setVideoError(null);
    retryCountRef.current = 0;
    setRetryCount(0);
    setIsBuffering(false);
    setHlsAudioTracks([]);
    setCurrentHlsAudioTrack(-1);
    setDebridResolvedUrl(null);
  }, [sourceUrlKey]);

  // Fetch skip times for intro/outro
  useEffect(() => {
    if (hasTatakaiSkipSegments) return;
    if (malId && episodeNumber && duration > 0) {
      fetchSkipTimes(malId, episodeNumber, Math.floor(duration));
    }
  }, [malId, episodeNumber, duration, fetchSkipTimes, hasTatakaiSkipSegments]);

  // Check for active skip
  useEffect(() => {
    if (effectiveSkipSegments.length === 0) {
      setActiveSkip(null);
      return;
    }

    const skip = effectiveSkipSegments.find((candidate) => (
      currentTime >= candidate.startTime && currentTime < candidate.endTime
    )) || null;
    setActiveSkip(skip);
  }, [currentTime, effectiveSkipSegments]);

  useEffect(() => {
    autoSkippedWindowRef.current = null;
  }, [sourceUrlKey]);

  useEffect(() => {
    if (!settings.autoSkipIntro || !activeSkip || !videoRef.current) return;
    if (activeSkip.type !== 'op' && activeSkip.type !== 'mixed-op' && activeSkip.type !== 'recap') return;

    const key = `${activeSkip.type}:${activeSkip.startTime}:${activeSkip.endTime}`;
    if (autoSkippedWindowRef.current === key) return;

    videoRef.current.currentTime = activeSkip.endTime;
    autoSkippedWindowRef.current = key;
    setCurrentTime(activeSkip.endTime);
    setActiveSkip(null);
    // Mobile feedback for the auto-skip toggle (Settings → Video → Skip intro).
    void triggerHaptic('success');
    toast.success('Skipped intro', { id: 'mobile-autoskip', duration: 1800 });
  }, [activeSkip, settings.autoSkipIntro]);

  // Keep screen awake while playing
  useEffect(() => {
    if (isPlaying && Capacitor.isNativePlatform()) {
      KeepAwake.keepAwake();
    } else {
      KeepAwake.allowSleep();
    }
    return () => {
      KeepAwake.allowSleep();
    };
  }, [isPlaying]);

  // Hide controls after inactivity
  useEffect(() => {
    if (showControls && isPlaying && !isLocked) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 4000);
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls, isPlaying, isLocked]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = settings.playbackSpeed;
    }
    setPlaybackRate(settings.playbackSpeed);
  }, [settings.playbackSpeed]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = settings.volume;
    }
  }, [settings.volume]);

  useEffect(() => {
    setCurrentSubtitle(settings.subtitleLanguage);
  }, [settings.subtitleLanguage]);

  // Custom subtitle overlay (desktop parity): tracks run in "hidden" mode and
  // we paint active cues ourselves so size/font/color/BG/position/offset apply.
  const activeCueLines = useActiveCues(videoRef, `${sourceUrlKey}|${currentSubtitle}`, settings.subtitleOffset);
  const customCueStyle = useMemo(() => buildSubtitleCueStyle(settings), [settings]);
  useEffect(() => {
    void ensureCustomSubtitleFontLoaded();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const applySubtitleMode = () => {
      const tracks = video.textTracks;
      if (!tracks || tracks.length === 0) return;

      let selectedIndex = -1;

      if (currentSubtitle !== 'off') {
        if (currentSubtitle === 'auto') {
          const englishIndex = subtitles.findIndex((sub) => {
            return subtitleMatchesPreference(sub, 'english');
          });
          selectedIndex = englishIndex >= 0 ? englishIndex : 0;
        } else {
          selectedIndex = subtitles.findIndex((sub, idx) => getSubtitleSelectionKey(sub, idx) === currentSubtitle);

          if (selectedIndex < 0) {
            const key = currentSubtitle.toLowerCase();
            selectedIndex = subtitles.findIndex((sub) => {
              return subtitleMatchesPreference(sub, key);
            });
          }
        }
      }

      // "hidden" (not "showing") so the browser parses cues + fires cuechange
      // but doesn't paint them — the custom overlay paints styled cues above.
      for (let i = 0; i < tracks.length; i += 1) {
        tracks[i].mode = i === selectedIndex ? 'hidden' : 'disabled';
      }
    };

    applySubtitleMode();
    video.addEventListener('loadedmetadata', applySubtitleMode);

    return () => {
      video.removeEventListener('loadedmetadata', applySubtitleMode);
    };
  }, [currentSubtitle, subtitles, subtitleBlobs]);

  // Desktop-parity playback modes: loop / sleep timer / stable volume.
  useEffect(() => {
    if (videoRef.current) videoRef.current.loop = Boolean(settings.loopVideo);
  }, [settings.loopVideo, sourceUrlKey]);

  useEffect(() => {
    if (!settings.sleepTimer || settings.sleepTimer === 'off' || settings.sleepTimer === 'end-of-episode') return;
    const minutes = Number(settings.sleepTimer);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const id = window.setTimeout(() => {
      videoRef.current?.pause();
      toast.info('Sleep timer: playback paused.');
    }, minutes * 60 * 1000);
    return () => window.clearTimeout(id);
  }, [settings.sleepTimer, sourceUrlKey]);

  // Stable volume via WebAudio compressor (best-effort; skipped for offline /
  // native-loopback where the element is cross-origin tainted).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !settings.stableVolume || isOffline) return;
    let ctx: AudioContext | null = null;
    let src: MediaElementAudioSourceNode | null = null;
    let comp: DynamicsCompressorNode | null = null;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      src = ctx.createMediaElementSource(video);
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 20;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      src.connect(comp);
      comp.connect(ctx.destination);
      void ctx.resume().catch(() => {});
    } catch {
      try { src?.disconnect(); } catch { /* ignore */ }
      try { void ctx?.close(); } catch { /* ignore */ }
      return;
    }
    return () => {
      try { src?.disconnect(); } catch { /* ignore */ }
      try { comp?.disconnect(); } catch { /* ignore */ }
      try { void ctx?.close(); } catch { /* ignore */ }
    };
  }, [settings.stableVolume, isOffline, sourceUrlKey]);

  // Initialize HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentSource?.url) return;

    const source = currentSource;
    // Android receives desktop-shaped loopback URLs from the extension host.
    // Keep them intact: unwrapping here forced every manifest and segment back
    // through the hosted proxy, which was the mobile/desktop speed gap. A
    // cached token from an earlier app process/port is re-minted from the
    // source-carried upstream URL and headers before mounting.
    let activeSourceUrl = source.url;
    if (
      !isOffline &&
      isAnyProxyUrl(activeSourceUrl) &&
      !resolveMobileProxy(activeSourceUrl) &&
      (source as any)?.originalUrl
    ) {
      activeSourceUrl = reregisterMobileSource({
        url: activeSourceUrl,
        originalUrl: (source as any).originalUrl,
        headers: (source as any).headers,
      });
    }
    // Debrid resolution: magnet links must be resolved to a stream URL before
    // HLS/direct detection runs. WatchPage pre-resolves once and hands both
    // players an HTTP URL, so this path only fires for direct magnet mounts —
    // the in-memory resolve cache in the orchestrator dedupes any double-mount
    // into a single provider torrent.
    if (!isOffline && activeSourceUrl.startsWith('magnet:')) {
      if (!debridResolvedUrl) {
        setIsBuffering(true);
        const controller = new AbortController();
        let alive = true;
        void import('@/core/providers/debrid-orchestrator').then((m) =>
          m.debridOrchestrator.resolveMagnetToStream(activeSourceUrl, {
            episodeNumber: (source as any).episodeNumber ?? (source as any).episode,
            // WatchPage threads torrentTitle/title/name; standalone mounts may
            // only carry title — fall back through all of them so season packs
            // still pick the right episode file.
            filenameHint: (source as any).filenameHint
              ?? (source as any).torrentTitle
              ?? (source as any).title
              ?? (source as any).name,
            signal: controller.signal,
            onProgress: (state, progress) => {
              if (!alive) return;
              const pct = typeof progress === 'number' && Number.isFinite(progress)
                ? ` ${Math.round(progress)}%`
                : '';
              // Uncached torrents need minutes: show state instead of a dead spinner.
              setIsBuffering(true);
              if (/download|prepar|convert|processing/i.test(state)) {
                setVideoError(null);
              }
              void pct;
            },
          }),
        ).then(
          (resolvedUrl) => {
            if (alive) setDebridResolvedUrl(resolvedUrl);
          },
          (err: unknown) => {
            if (!alive) return;
            if ((err as Error)?.name === 'AbortError') return;
            setVideoError((err instanceof Error ? err.message : String(err)) || 'Debrid resolution failed');
            setIsBuffering(false);
          },
        );
        return () => {
          alive = false;
          controller.abort();
        };
      }
      activeSourceUrl = debridResolvedUrl;
    }
    // Opaque proxy tokens are supported by the custom HLS loader, but a direct
    // MP4/WebM cannot be mounted as a `mobile-proxy://` media src. An older
    // shell without the loopback plugin uses its upstream URL device-direct.
    const sourceLooksHls = source.isM3U8 ||
      (source as any).sourceType === 'hls' ||
      /\.m3u8(?:$|[?#/])/i.test(activeSourceUrl);
    const isDebridOrigin = (source as any)?.sourceType === 'debrid' || (source as any)?.mode === 'debrid';
    // Sources from custom/direct integrations may bypass the extension host.
    // Register them here as a final guard so native playback stays on the
    // device-local iOS/Android proxy and never uses Tatakai's hosted proxy.
    if (
      nativeMobile && !isOffline && !isDebridOrigin &&
      /^https?:/i.test(activeSourceUrl) && !isAnyProxyUrl(activeSourceUrl)
    ) {
      activeSourceUrl = registerMobileSource({
        url: activeSourceUrl,
        headers: {
          ...(((source as any)?.headers || {}) as Record<string, string>),
          ...(playbackReferer ? { Referer: playbackReferer } : {}),
          ...(playbackUserAgent ? { 'User-Agent': playbackUserAgent } : {}),
          ...(headers?.Origin ? { Origin: headers.Origin } : {}),
        },
      });
    }
    if (!sourceLooksHls && isMobileProxyUrl(activeSourceUrl)) {
      activeSourceUrl = unwrapMobileProxyUrl(activeSourceUrl, {
        originalUrl: (source as any)?.originalUrl,
      });
    }

    // Loopback sources are already proxied and must stay local. A non-native
    // web render retains its normal backend fallback.
    const upstreamUrl = activeSourceUrl;
    const isHls = sourceLooksHls;
    // Debrid CDN links are IP-pinned to the device: the hosted proxy's IP
    // would 403 them, so resolved debrid streams always play direct (same as
    // the desktop DebridAdapter). getProxiedVideoUrl also bypasses known
    // debrid hosts — this covers the source regardless of CDN host.
    const hostedUrl = !nativeMobile && !isOffline && !isDebridOrigin && /^https?:/i.test(upstreamUrl)
      ? getProxiedVideoUrl(upstreamUrl, playbackReferer || undefined, playbackUserAgent || undefined)
      : upstreamUrl;
    // Candidate ladder: native/mobile proxy tokens are single, authoritative
    // candidates. Only web renders race raw URLs against a backend candidate.
    const replayHeaders = (((source as any)?.headers || {}) as Record<string, string>);
    // Header-gated sources cannot be played direct because the CDN validates
    // headers the WebView cannot send; the loopback service owns those headers.
    const needsHeaderReplay = Boolean(playbackReferer || headers?.Origin) ||
      Object.keys(replayHeaders).some((name) =>
        ['referer', 'origin', 'cookie', 'authorization'].includes(String(name).toLowerCase()),
      );
    let candidates = isAnyProxyUrl(upstreamUrl)
      ? [upstreamUrl]
      : buildMobilePlaybackCandidates(
        /^https?:/i.test(upstreamUrl) ? upstreamUrl : activeSourceUrl,
        {
          proxiedUrl: hostedUrl,
          referer: playbackReferer || undefined,
          userAgent: playbackUserAgent || undefined,
          refererCandidates: (source as any)?.refererCandidates,
        },
      );
    if (!isAnyProxyUrl(upstreamUrl) && needsHeaderReplay) {
      candidates = candidates.filter((url) => /^https?:/i.test(url) && url !== upstreamUrl);
      if (!candidates.includes(hostedUrl)) candidates.unshift(hostedUrl);
    }
    if (!candidates.length) candidates = [hostedUrl];
    candidateIndexRef.current = 0;
    mediaRetryRef.current = 0;
    retryCountRef.current = 0;
    setRetryCount(0);
    recoverRef.current = null;

    function giveUp(statusCode?: number, reason?: string): void {
      setVideoError("Failed to load video. Please try another server.");
      onError?.({ statusCode, reason });
    }

    let mounted = false;
    let disposed = false;

    // Shared recovery ladder, reachable from both the hls.js error handler and
    // the media-element stall watchdog (the "server works but the video froze"
    // case never hit either until now).
    function recover(): void {
      if (disposed) return;
      if (recoveringRef.current) return;
      recoveringRef.current = true;
      try {
        if (mediaRetryRef.current < MAX_MEDIA_RECOVERIES && hlsRef.current) {
          mediaRetryRef.current += 1;
          if (mediaRetryRef.current > 1) {
            // hls.js's documented escalation for a buffer append that keeps
            // failing (same fix desktop's HlsAdapter applies).
            try { (hlsRef.current as any).swapAudioCodec?.(); } catch { /* not all builds */ }
          }
          try { hlsRef.current.recoverMediaError(); return; } catch { /* fall through */ }
        }
        if (retryCountRef.current < MAX_SAME_URL_RETRIES) {
          retryCountRef.current += 1;
          setRetryCount(retryCountRef.current);
          if (hlsRef.current) {
            try { hlsRef.current.startLoad(); return; } catch { /* fall through */ }
          }
          try { video.load(); return; } catch { /* fall through */ }
        }

        if (candidateIndexRef.current < candidates.length - 1) {
          candidateIndexRef.current += 1;
          retryCountRef.current = 0;
          setRetryCount(0);
          mediaRetryRef.current = 0;
          console.warn(`[MobileVideoPlayer] failing over to candidate ${candidateIndexRef.current + 1}/${candidates.length}`);
          mountAt(candidateIndexRef.current);
          return;
        }

        giveUp();
      } finally {
        recoveringRef.current = false;
      }
    }

    function mountAt(index: number): void {
      if (disposed) return;
      mounted = true;
      const finalUrlResolved = candidates[Math.min(Math.max(index, 0), candidates.length - 1)];

      // Cleanup previous HLS instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      // A leftover src from a failed attempt makes the next attachMedia look
      // like a no-op, so reset the element between attempts.
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        /* element may already be detached */
      }

      let metadataAutoplayHandler: (() => void) | null = null;
      metadataAutoplayCleanup.current = () => {
        if (metadataAutoplayHandler) {
          video.removeEventListener('loadedmetadata', metadataAutoplayHandler);
          metadataAutoplayHandler = null;
        }
      };

      if (isHls && Hls.isSupported()) {
        // Buffer sizes follow the effective profile (data-saver forces `low`).
        const { backBufferLength, maxBufferLength, maxMaxBufferLength } =
          getProfileKnobs(getEffectiveMemoryProfile()).hls;
        const hls = new Hls({
          enableWorker: true,
          // VOD fast-start: low-latency mode adds part-request overhead on
          // proxied segments. Off matches desktop HlsAdapter tuning.
          lowLatencyMode: false,
          autoStartLoad: true,
          startFragPrefetch: true,
          // Start with the smallest rendition for the first frame, then ramp up
          // aggressively once the first native fragment reports throughput. The
          // previous -1 auto start could choose a multi-megabyte 1080p fragment
          // before the bridge had any bandwidth sample.
          startLevel: 0,
          // Conservative initial estimate for LTE: the old 5 Mbps started with
          // a heavy 1080p fragment before the bridge had any bandwidth sample,
          // delaying first frame and causing early rebuffering.
          abrEwmaDefaultEstimate: 1_000_000,
          abrBandWidthFactor: 0.9,
          abrBandWidthUpFactor: 0.8,
          maxStarvationDelay: 2,
          maxLoadingDelay: 2,
          // Mobile-tuned: enough forward buffer to avoid immediate rebuffering,
          // without making startup wait on a large memory target.
          backBufferLength,
          maxBufferLength,
          maxMaxBufferLength,
          // capping to player size made fullscreen rotation re-evaluate levels
          // mid-episode and rebuffer; the ABR defaults handle mobile well enough.
          capLevelToPlayerSize: false,
          // 30 MB (was 60 MB): enough forward buffer to avoid immediate
          // rebuffering without GC/memory pressure stalling low-end phones.
          maxBufferSize: 30 * 1000 * 1000,
          // Fast failover: dead proxy candidate advances after ~1s, not ~5s.
          // Default XHR against loopback uses no per-segment JS bridge;
          // Referer/UA replay
          // happens inside the native service.
          manifestLoadingMaxRetry: 1,
          levelLoadingMaxRetry: 2,
          fragLoadingMaxRetry: 1,
          manifestLoadingRetryDelay: 400,
          levelLoadingRetryDelay: 400,
          fragLoadingRetryDelay: 400,
          // `mobile-proxy://` is the compatibility path for older cached
          // rows. Android/iOS loopback URLs use hls.js's native XHR
          // loader so fragments stream over localhost just like desktop.
          ...(isMobileProxyUrl(finalUrlResolved) ? {
            loader: createNativeHlsLoader({
              referer: playbackReferer || undefined,
              userAgent: playbackUserAgent || undefined,
              origin: headers?.Origin,
            }),
          } : {}),
        });

        hls.loadSource(finalUrlResolved);
        hls.attachMedia(video);
        hlsRef.current = hls;

        const syncAudioTracks = () => {
          try {
            const list = (hls.audioTracks || []).map((t: { id?: number; name?: string; lang?: string }, i: number) => ({
              id: typeof t.id === 'number' ? t.id : i,
              label: String(t.name || `Audio ${i + 1}`),
              lang: String(t.lang || 'und'),
            }));
            setHlsAudioTracks(list);
            setCurrentHlsAudioTrack(typeof hls.audioTrack === 'number' ? hls.audioTrack : -1);
          } catch {
            /* audio probe best-effort */
          }
        };
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          syncAudioTracks();
          if (initialSeekSeconds && initialSeekSeconds > 0) {
            video.currentTime = initialSeekSeconds;
          }
          if (shouldAutoplayVideo(settings.autoplay)) {
            video.play().catch(console.error);
          }
        });
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, syncAudioTracks);
        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_: unknown, data: { id?: number }) => {
          if (typeof data?.id === 'number') setCurrentHlsAudioTrack(data.id);
        });

        // A buffered fragment means this candidate genuinely works, so the
        // budget resets for whatever breaks later in the stream.
        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          mediaRetryRef.current = 0;
          retryCountRef.current = 0;
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data?.fatal) return;
          const status = Number((data as any)?.response?.code || (data as any)?.networkDetails?.status || 0);

          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            if (mediaRetryRef.current < MAX_MEDIA_RECOVERIES) {
              mediaRetryRef.current += 1;
              if (mediaRetryRef.current > 1) {
                try { (hls as any).swapAudioCodec?.(); } catch { /* not all builds */ }
              }
              try { hls.recoverMediaError(); return; } catch { /* fall through */ }
            }
          }

          if (retryCountRef.current < MAX_SAME_URL_RETRIES) {
            retryCountRef.current += 1;
            setRetryCount(retryCountRef.current);
            console.warn(`[MobileVideoPlayer] retry ${retryCountRef.current}/${MAX_SAME_URL_RETRIES} (${String(data.details || 'error')}${status ? ` status=${status}` : ''})`);
            try { hls.startLoad(); return; } catch { /* fall through */ }
          }

          if (candidateIndexRef.current < candidates.length - 1) {
            candidateIndexRef.current += 1;
            retryCountRef.current = 0;
            setRetryCount(0);
            mediaRetryRef.current = 0;
            console.warn(`[MobileVideoPlayer] failing over to candidate ${candidateIndexRef.current + 1}/${candidates.length}`);
            mountAt(candidateIndexRef.current);
            return;
          }

          giveUp(status || undefined, `hls-${String(data.type || 'error')}-${String(data.details || 'fatal')}`);
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS support (iOS has no hls.js MSE path — the native
        // element fetches segments itself, so it needs a network URL).
        video.src = finalUrlResolved;
        if (initialSeekSeconds && initialSeekSeconds > 0) {
          video.currentTime = initialSeekSeconds;
        }

        if (shouldAutoplayVideo(settings.autoplay)) {
          metadataAutoplayHandler = () => {
            video.play().catch(console.error);
            video.removeEventListener('loadedmetadata', metadataAutoplayHandler!);
          };

          if (video.readyState >= 1) {
            video.play().catch(console.error);
          } else {
            video.addEventListener('loadedmetadata', metadataAutoplayHandler);
          }
        }
      } else {
        // Direct file: the mounted candidate is already the right URL —
        // upstream direct for open CDNs (the media element needs no CORS for
        // playback), loopback for gated ones, and direct for the
        // torrent engine and offline files.
        setIsBuffering(false);
        video.src = finalUrlResolved;
        if (initialSeekSeconds && initialSeekSeconds > 0) {
          video.currentTime = initialSeekSeconds;
        }

        if (shouldAutoplayVideo(settings.autoplay)) {
          metadataAutoplayHandler = () => {
            video.play().catch(console.error);
            video.removeEventListener('loadedmetadata', metadataAutoplayHandler!);
          };

          if (video.readyState >= 1) {
            video.play().catch(console.error);
          } else {
            video.addEventListener('loadedmetadata', metadataAutoplayHandler);
          }
        }
      }

      recoverRef.current = recover;
    }

    // Probe before mounting: race the ladder in parallel and mount the first
    // candidate that answers (~1.5s budget). Sequential mounting cost ~30s on
    // a dead proxy base; this makes failover instant for both HLS (manifest
    // probe, no Range) and direct (byte-0 probe). Single-candidate (loopback)
    // ladders mount immediately — no probe delay on the fast path.
    void (async () => {
      if (!mounted && candidates.length > 1) {
        const budget = 1500;
        const slice = candidates.slice(0, PROBE_CANDIDATES);
        const probes = slice.map(async (url, i) => {
          const ok = await probePlaybackCandidate(url, {
            timeoutMs: budget,
            range: isHls ? false : true,
          });
          if (!ok) throw new Error(`dead:${i}`);
          return i;
        });
        try {
          const winner = await firstFulfilled(probes);
          candidateIndexRef.current = winner;
          // Persist the winner so the next episode skips dead bases entirely.
          try {
            const u = new URL(candidates[winner]);
            markProxyWorking(`${u.origin}${u.pathname}`.replace(/\/$/, ''), u.searchParams.get('referer') || undefined);
          } catch { /* health best-effort */ }
        } catch {
          // All probes failed — mount candidates[0], hls.js/media element is
          // the real probe for hostile CDNs.
        }
      }
      if (!disposed && !mounted) mountAt(candidateIndexRef.current);
    })();

    return () => {
      disposed = true;
      if (metadataAutoplayCleanup.current) {
        metadataAutoplayCleanup.current();
        metadataAutoplayCleanup.current = null;
      }

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentSource, sourceUrlKey, sourceTypeKey, initialSeekSeconds, isOffline, nativeMobile, playbackReferer, playbackUserAgent, headers?.Origin, settings.autoplay, onError, debridResolvedUrl]);

  // Load subtitles — parallel + incremental so the first (English) track mounts
  // in ~1s instead of after every track serially times out. Each resolved track
  // merges into state immediately, so `<track>` elements appear progressively
  // and the selected subtitle shows even while the rest still fetch.
  useEffect(() => {
    if (!subtitles.length) {
      setSubtitleBlobs({});
      return;
    }

    let mounted = true;
    const createdBlobUrls: string[] = [];

    const fetchOne = async (sub: (typeof subtitles)[number], i: number) => {
      const subtitleKey = getSubtitleSelectionKey(sub, i);
      const subtitleSourceUrl = String(sub.url || '').trim();
      if (!subtitleSourceUrl) return null;

      if (subtitleSourceUrl.startsWith('asset://') || subtitleSourceUrl.includes('asset.localhost')) {
        return { key: subtitleKey, url: subtitleSourceUrl, blob: subtitleSourceUrl, raw: subtitleSourceUrl };
      }

      try {
        const candidates = buildSubtitleFetchCandidates(
          subtitleSourceUrl,
          playbackReferer,
          Boolean(isOffline),
          (url, referer) => nativeMobile
            ? registerMobileSource({
                url,
                headers: {
                  ...(referer ? { Referer: referer } : {}),
                  ...(playbackUserAgent ? { 'User-Agent': playbackUserAgent } : {}),
                },
              })
            : getProxiedSubtitleUrl(url, referer)
        );

        let normalizedText = '';
        for (const candidateUrl of candidates) {
          try {
            // Candidates are [raw, backend subtitle proxy]: raw first for
            // open CDNs, then the backend fetch (server-side Referer replay
            // + CORS) for gated ones.
            const response = await fetch(candidateUrl, {
              headers: {
                Accept: 'text/vtt, text/plain, */*',
              },
              signal: AbortSignal.timeout(8000),
            });

            if (!response.ok) {
              continue;
            }

            normalizedText = normalizeSubtitleToVtt(await response.text());
            if (normalizedText) {
              break;
            }
          } catch {
            // Try next subtitle URL candidate.
          }
        }

        if (!normalizedText) {
          console.warn('Failed to load subtitle:', sub.lang, subtitleSourceUrl);
          return null;
        }

        const blob = new Blob([normalizedText], { type: 'text/vtt' });
        const blobUrl = URL.createObjectURL(blob);
        createdBlobUrls.push(blobUrl);
        return { key: subtitleKey, url: subtitleSourceUrl, blob: blobUrl, raw: subtitleSourceUrl };
      } catch (e) {
        console.warn('Failed to load subtitle:', sub.lang, e);
        return null;
      }
    };

    setSubtitleBlobs({});
    // English (or the user's preferred) first, rest in background — the
    // selected track is almost always English, so prioritize it.
    const ordered = subtitles
      .map((sub, i) => ({ sub, i }))
      .sort((a, b) => {
        const aEn = subtitleMatchesPreference(a.sub, 'english') ? 0 : 1;
        const bEn = subtitleMatchesPreference(b.sub, 'english') ? 0 : 1;
        return aEn - bEn || a.i - b.i;
      });
    let idx = 0;
    const CONCURRENCY = 4;
    const worker = async () => {
      while (mounted && idx < ordered.length) {
        const { sub, i } = ordered[idx++];
        const res = await fetchOne(sub, i);
        if (!mounted || !res) continue;
        // The selector addresses a track by its stable selection key while
        // the rendered `<track>` addresses it by raw URL — index both.
        setSubtitleBlobs((prev) => {
          if (prev[res.key] === res.blob) return prev;
          return { ...prev, [res.key]: res.blob, [res.raw]: res.blob };
        });
      }
    };
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, ordered.length) }, worker));

    return () => {
      mounted = false;
      createdBlobUrls.forEach((blobUrl) => {
        try {
          if (!blobUrl.startsWith('asset://')) URL.revokeObjectURL(blobUrl);
        } catch { /* ignore */ }
      });
    };
  }, [subtitles, playbackReferer, playbackUserAgent, isOffline, nativeMobile]);

  useEffect(() => {
    if (!subtitles.length || currentSubtitle === 'off') return;

    const keys = subtitles.map((sub, idx) => getSubtitleSelectionKey(sub, idx));
    if (keys.includes(currentSubtitle)) return;

    const englishIndex = subtitles.findIndex((sub) => {
      return subtitleMatchesPreference(sub, 'english');
    });
    const fallbackIndex = englishIndex >= 0 ? englishIndex : 0;
    setCurrentSubtitle(getSubtitleSelectionKey(subtitles[fallbackIndex], fallbackIndex));
  }, [subtitles, currentSubtitle]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      
      // Progress saving
      const diff = video.currentTime - lastSavedProgressRef.current;
      if (Math.abs(diff) >= PROGRESS_SAVE_INTERVAL) {
        lastSavedProgressRef.current = video.currentTime;
        onProgressUpdate?.(video.currentTime, video.duration, false);
      }
    };

    const handleDurationChange = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      // Save the exact position on stop so reopening resumes from here.
      const t = Math.floor(video.currentTime || 0);
      if (t > 0) onProgressUpdate?.(t, Math.floor(video.duration || 0) || 0, false, true);
    };
    const handleWaiting = () => {
      setIsBuffering(true);

      // Stall watchdog: without this, a stream that stops delivering keeps the
      // spinner forever — the exact "even if the server works the video
      // froze" symptom. If playback doesn't resume within STALL_TIMEOUT_MS we
      // run the same recovery ladder hls.js errors use.
      if (stallTimeoutRef.current) clearTimeout(stallTimeoutRef.current);
      stallTimeoutRef.current = setTimeout(() => {
        stallTimeoutRef.current = null;
        if (!videoRef.current || videoRef.current.ended) return;
        const stuck = !videoRef.current.seeking && !videoRef.current.paused;
        if (!stuck) return;
        console.warn('[MobileVideoPlayer] stall timeout — recovering');
        recoverRef.current?.();
      }, STALL_TIMEOUT_MS);
    };
    const handlePlaying = () => {
      setIsBuffering(false);
      if (stallTimeoutRef.current) {
        clearTimeout(stallTimeoutRef.current);
        stallTimeoutRef.current = null;
      }
    };
    const handleProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const handleEnded = () => {
      onProgressUpdate?.(video.duration, video.duration, true);
      if (settings.sleepTimer === "end-of-episode") return;
      if (settings.autoNextEpisode) {
        setUpNextCountdown(Math.max(1, Math.round(settings.autoNextCountdownSeconds || 10)));
      }
    };
    const handleError = () => {
      // The recovery ladder in the mount effect owns retries/failover; a bare
      // media-element error here means the current candidate is spent.
      setVideoError("Error loading video");
      void triggerHaptic('error');
      onError?.({
        reason: `media-element-${video.error?.code || 'unknown'}`,
      });
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
    };
  }, [onEpisodeEnd, onProgressUpdate, onError, settings.autoNextEpisode, settings.autoNextCountdownSeconds, settings.sleepTimer]);

  // Up-Next countdown driver.
  useEffect(() => {
    if (upNextCountdown === null) return;
    if (upNextCountdown <= 0) {
      setUpNextCountdown(null);
      onEpisodeEnd?.();
      return;
    }
    const id = window.setTimeout(() => {
      setUpNextCountdown((prev) => (prev === null ? null : prev - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [upNextCountdown, onEpisodeEnd]);

  // Persist exact position on tab-hide / app background / unmount so reopening resumes here.
  const progressCbRef = useRef<typeof onProgressUpdate>(onProgressUpdate);
  useEffect(() => {
    progressCbRef.current = onProgressUpdate;
  }, [onProgressUpdate]);
  useEffect(() => {
    const saveNow = () => {
      const video = videoRef.current;
      if (!video) return;
      const t = Math.floor(video.currentTime || 0);
      const dur = Math.floor(video.duration || 0) || undefined;
      if (t > 0) progressCbRef.current?.(t, dur, false, true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saveNow();
    };
    window.addEventListener("beforeunload", saveNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", saveNow);
      document.removeEventListener("visibilitychange", onVisibility);
      saveNow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Fullscreen toggle
  const lockLandscapeOrientation = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await ScreenOrientation.lock({ orientation: 'landscape' });
      } catch (e) {
        console.warn('Native orientation lock failed:', e);
      }
    }

    try {
      const orientationApi = screen.orientation as any;
      if (orientationApi?.lock) {
        await orientationApi.lock('landscape');
      }
    } catch {
      // Mobile browsers may block lock() unless fully user-gesture compatible.
    }
  }, []);

  const unlockOrientation = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await ScreenOrientation.unlock();
      } catch (e) {
        console.warn('Native orientation unlock failed:', e);
      }
    }

    try {
      if (screen.orientation?.unlock) {
        screen.orientation.unlock();
      }
    } catch {
      // Ignore browser unlock failures.
    }
  }, []);

  // Shared fullscreen signal: body/html carry the class so app chrome
  // (MobileNav, Sidebar) can hide even when an ancestor stacking context
  // traps the player's fixed positioning on some devices. A window event
  // with the same payload lets portaled chrome hide without polling.
  const originalBodyOverflowRef = useRef<string | null>(null);
  const isFullscreenRef = useRef(false);
  isFullscreenRef.current = isFullscreen;

  const setPlayerFullscreenSignal = useCallback((on: boolean) => {
    try {
      document.body.classList.toggle(MOBILE_PLAYER_FULLSCREEN_CLASS, on);
      document.documentElement.classList.toggle(MOBILE_PLAYER_FULLSCREEN_CLASS, on);
      window.dispatchEvent(
        new CustomEvent(MOBILE_PLAYER_FULLSCREEN_EVENT, { detail: { fullscreen: on } }),
      );
    } catch {
      /* non-DOM environment */
    }
  }, []);

  const applyFullscreenStyles = useCallback(() => {
    try {
      if (originalBodyOverflowRef.current === null) {
        originalBodyOverflowRef.current = document.body.style.overflow || '';
      }
      document.body.style.overflow = 'hidden';
    } catch {
      /* ignore */
    }
    const container = containerRef.current;
    if (container) {
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100vw';
      container.style.height = '100vh';
      container.style.zIndex = '99999';
      container.style.backgroundColor = 'black';
      container.classList.add('is-player-fullscreen');
    }
    setPlayerFullscreenSignal(true);
  }, [setPlayerFullscreenSignal]);

  const clearFullscreenStyles = useCallback(() => {
    // Never early-return: the page scroll lock must be released even when the
    // container already unmounted (previously left `body{overflow:hidden}`
    // behind, freezing scroll until the app restarted).
    try {
      document.body.style.overflow =
        originalBodyOverflowRef.current === null ? '' : originalBodyOverflowRef.current;
    } catch {
      /* ignore */
    }
    originalBodyOverflowRef.current = null;
    const container = containerRef.current;
    if (container) {
      container.style.position = '';
      container.style.top = '';
      container.style.left = '';
      container.style.width = '';
      container.style.height = '';
      container.style.zIndex = '';
      container.style.backgroundColor = '';
      container.classList.remove('is-player-fullscreen');
    }
    setPlayerFullscreenSignal(false);
  }, [setPlayerFullscreenSignal]);

  const toggleFullscreen = async () => {
    if (!containerRef.current && !isFullscreenRef.current) return;

    if (!isFullscreenRef.current) {
      if (Capacitor.isNativePlatform()) {
        try {
          await StatusBar.hide();
        } catch (e) {
          console.warn('Failed to hide status bar:', e);
        }
      }

      await lockLandscapeOrientation();
      applyFullscreenStyles();
      setIsFullscreen(true);
    } else {
      try {
        if (Capacitor.isNativePlatform()) {
          try {
            await StatusBar.show();
          } catch (e) {
            console.warn('Failed to show status bar:', e);
          }
        }

        await unlockOrientation();
      } finally {
        // Scroll lock + chrome signal must release even when the native
        // calls above throw — otherwise the page stays unscrollable.
        clearFullscreenStyles();
        setIsFullscreen(false);
      }
    }
  };

  // The player uses a CSS fallback (not the Fullscreen API), but the OS /
  // WebView can still tear down overlay state out from under us (back
  // gesture, activity pause). Releasing here guarantees the page never gets
  // stranded with `body{overflow:hidden}`.
  useEffect(() => {
    const handleNativeFullscreenChange = () => {
      const nativeActive =
        Boolean(document.fullscreenElement) ||
        Boolean((document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement);
      if (!nativeActive && isFullscreenRef.current) {
        clearFullscreenStyles();
        setIsFullscreen(false);
        if (Capacitor.isNativePlatform()) {
          StatusBar.show().catch(() => undefined);
        }
        unlockOrientation().catch(() => undefined);
      }
    };

    document.addEventListener('fullscreenchange', handleNativeFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleNativeFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleNativeFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleNativeFullscreenChange);
    };
  }, [clearFullscreenStyles, unlockOrientation]);

  useEffect(() => {
    return () => {
      clearFullscreenStyles();

      if (Capacitor.isNativePlatform()) {
        StatusBar.show().catch(() => undefined);
      }

      unlockOrientation().catch(() => undefined);
    };
  }, [clearFullscreenStyles, unlockOrientation]);

  // Playback controls
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    void triggerHaptic('toggle');
    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(console.error);
    }
  };

  const seek = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime = Math.max(0, Math.min(time, duration));
    video.currentTime = newTime;
    // Update UI immediately for responsive feedback
    setCurrentTime(newTime);
  };

  const skipIntro = () => {
    if (activeSkip) {
      seek(activeSkip.endTime);
    }
  };

  // Handle double-tap to seek
  const handleTap = (e: React.TouchEvent) => {
    if (isLocked) return;

    // Control taps bubble to the player container after the button's click.
    // Treating those as canvas taps schedules a second state change 300 ms
    // later, which used to hide the controls immediately after Play, Settings,
    // Fullscreen, etc.  Interactive non-button surfaces (the seek bar) opt in
    // with the same marker.
    const target = e.target;
    if (
      target instanceof Element &&
      target.closest('button, [role="button"], [data-player-interactive="true"]')
    ) {
      return;
    }
    
    const now = Date.now();
    const { clientX } = e.changedTouches[0];
    const containerRect = containerRef.current?.getBoundingClientRect();
    const containerMidpoint = containerRect
      ? containerRect.left + containerRect.width / 2
      : window.innerWidth / 2;
    const isLeftSide = clientX < containerMidpoint;
    
    const timeDiff = now - lastTapRef.current.time;
    const isDoubleTap = timeDiff < 300;
    
    if (isDoubleTap) {
      // Clear single tap timeout
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
      void triggerHaptic('select');

      const seekSeconds = 10;
      const direction = isLeftSide ? -1 : 1;
      seekAccumulatorRef.current += seekSeconds;
      
      seek(currentTime + (seekSeconds * direction));
      setDoubleTapSide(isLeftSide ? 'left' : 'right');
      setSeekAmount(seekAccumulatorRef.current);
      
      // Reset after animation
      setTimeout(() => {
        setDoubleTapSide(null);
        seekAccumulatorRef.current = 0;
      }, 800);
    } else {
      // Single tap - toggle controls
      doubleTapTimeoutRef.current = setTimeout(() => {
        setShowControls(prev => !prev);
      }, 300);
    }
    
    lastTapRef.current = { time: now, x: clientX };
  };

  // Handle progress bar seek
  const handleProgressSeek = (e: React.TouchEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.changedTouches[0].clientX - rect.left;
    const percent = x / rect.width;
    seek(percent * duration);
  };

  // Handle progress bar hover (for mouse/pointer events)
  const handleProgressBarHover = (e: React.MouseEvent<HTMLDivElement>) => {
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

  // Subtitle change
  const handleSubtitleChange = (lang: string) => {
    void triggerHaptic('select');
    setCurrentSubtitle(lang);
    setShowSubtitleMenu(false);
  };

  // HLS alternate-audio switch (desktop Audio-tab parity).
  const handleHlsAudioChange = (id: number) => {
    try {
      if (hlsRef.current) hlsRef.current.audioTrack = id;
      setCurrentHlsAudioTrack(id);
    } catch {
      /* best effort */
    }
  };

  // Handle screenshot
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

  // Retry on error
  const handleRetry = () => {
    if (onRetryCurrentServer) onRetryCurrentServer();
    setVideoError(null);
    retryCountRef.current = 0;
    setRetryCount(0);
  };

  if (videoError) {
    return (
      <div className="relative w-full aspect-video bg-black flex items-center justify-center">
        <div className="text-center p-6">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-white text-lg mb-4">{videoError}</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 px-6 py-3 bg-primary rounded-xl text-white text-lg"
            >
              <RefreshCw className="w-5 h-5" />
              Retry
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-6 py-3 bg-white/10 rounded-xl text-white text-lg"
            >
              <RefreshCw className="w-5 h-5" />
              Refresh
            </button>
            {onServerSwitch && (
              <button
                onClick={onServerSwitch}
                className="px-6 py-3 bg-white/10 rounded-xl text-white text-lg"
              >
                Switch Server
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'video-player-container relative w-full aspect-video bg-black select-none touch-none',
        isFullscreen && 'is-player-fullscreen',
      )}
      onTouchEnd={handleTap}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        poster={resolvedPoster}
        preload="auto"
        playsInline
        crossOrigin="anonymous"
      >
        {/* Subtitles */}
        {subtitles.map((sub, idx) => {
          const subtitleKey = getSubtitleSelectionKey(sub, idx);
          const subtitleSourceUrl = String(sub.url || '').trim();
          if (!subtitleSourceUrl) return null;
          const blobUrl = subtitleBlobs[subtitleSourceUrl] || subtitleBlobs[subtitleKey];
          const proxiedSubtitleUrl = !isOffline && !nativeMobile
            ? getProxiedSubtitleUrl(subtitleSourceUrl, playbackReferer)
            : subtitleSourceUrl;
          const src = blobUrl || (isBrowserReadyVttUrl(proxiedSubtitleUrl || '') ? proxiedSubtitleUrl : undefined);
          if (!src) return null;
          return (
          <track
            key={subtitleKey}
            kind="subtitles"
            label={sub.label || sub.lang}
            srcLang={sub.lang}
            src={src}
            default={subtitleKey === currentSubtitle}
          />
        )})}
      </video>

      {/* Custom styled subtitles — desktop parity (size/font/color/BG/position). */}
      {activeCueLines.length > 0 && currentSubtitle !== 'off' && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center gap-1 px-4 text-center"
          style={{ bottom: `${40 + settings.subtitlePosition * 6 + (showControls ? 64 : 0)}px` }}
          aria-live="polite"
        >
          {activeCueLines.map((line, idx) => (
            <span key={`${idx}-${line}`} style={customCueStyle}>
              {line}
            </span>
          ))}
        </div>
      )}

      {/* Loading Overlay */}
      {(isLoading || isBuffering) && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/30">
          <Loader2 className="w-16 h-16 text-primary animate-spin" />
        </div>
      )}

      {/* Auto-next Up-Next countdown */}
      {upNextCountdown !== null && (
        <UpNextOverlay
          secondsLeft={upNextCountdown}
          total={Math.max(1, Math.round(settings.autoNextCountdownSeconds || 10))}
          episodeNumber={typeof episodeNumber === "number" ? episodeNumber + 1 : undefined}
          onPlayNow={() => {
            setUpNextCountdown(null);
            onEpisodeEnd?.();
          }}
          onCancel={() => setUpNextCountdown(null)}
        />
      )}

      {/* Double-tap Seek Indicator */}
      {doubleTapSide && (
        <div 
          className={cn(
            "pointer-events-none absolute top-1/2 z-40 -translate-y-1/2 flex flex-col items-center gap-2",
            doubleTapSide === 'left' ? 'left-12' : 'right-12'
          )}
        >
          <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center animate-pulse">
            {doubleTapSide === 'left' ? (
              <Rewind className="w-10 h-10 text-white" />
            ) : (
              <FastForward className="w-10 h-10 text-white" />
            )}
          </div>
          <span className="text-white text-xl font-bold drop-shadow-lg">{seekAmount}s</span>
        </div>
      )}

      {/* Lock Screen Overlay */}
      {isLocked && showControls && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20">
          <button
            onClick={() => setIsLocked(false)}
            className="p-8 rounded-full bg-white/10 backdrop-blur-md border border-white/20"
          >
            <Unlock className="w-12 h-12 text-white drop-shadow-lg" />
          </button>
        </div>
      )}

      {/* Controls Overlay */}
      {showControls && !isLocked && (
        <div className="absolute inset-0 z-30 bg-gradient-to-b from-black/80 via-transparent to-black/90">
          {/* Top Bar */}
          <div className="absolute top-0 left-0 right-0 p-3 safe-area-top">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {onBack && (
                  <button
                    onClick={onBack}
                    className="p-2.5 rounded-full bg-white/10 backdrop-blur-md active:bg-white/20 border border-white/10"
                  >
                    <ChevronLeft className="w-6 h-6 text-white" />
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-white text-base font-bold truncate drop-shadow-lg">
                    {animeName}
                  </h3>
                  <p className="text-white/80 text-xs truncate">
                    Episode {episodeNumber} {episodeTitle ? `• ${episodeTitle}` : ''}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {/* Lock button */}
                <button
                  onClick={() => setIsLocked(true)}
                  className="p-2.5 rounded-full bg-white/10 backdrop-blur-md active:bg-white/20 border border-white/10"
                >
                  <Lock className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          </div>

          {/* Center Controls */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-8">
            {/* Skip Back */}
            <button
              onClick={() => seek(currentTime - 10)}
              className="p-3 rounded-full bg-white/10 backdrop-blur-md active:bg-white/20 border border-white/10"
            >
              <SkipBack className="w-7 h-7 text-white drop-shadow-lg" />
            </button>

            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="p-5 rounded-full bg-primary backdrop-blur-md active:scale-95 transition-transform shadow-2xl border-2 border-white/20"
            >
              {isPlaying ? (
                <Pause className="w-10 h-10 text-white" />
              ) : (
                <Play className="w-10 h-10 text-white ml-0.5" />
              )}
            </button>

            {/* Skip Forward */}
            <button
              onClick={() => seek(currentTime + 10)}
              className="p-3 rounded-full bg-white/10 backdrop-blur-md active:bg-white/20 border border-white/10"
            >
              <SkipForward className="w-7 h-7 text-white drop-shadow-lg" />
            </button>
          </div>

          {/* Skip Intro Button */}
          {activeSkip && (
            <button
              onClick={skipIntro}
              className="absolute right-4 bottom-32 px-8 py-4 bg-white/95 backdrop-blur-md rounded-2xl text-black font-bold text-base shadow-2xl border-2 border-white/20 active:scale-95 transition-transform"
            >
              Skip {activeSkip.type === 'op' || activeSkip.type === 'mixed-op' ? 'Intro' : activeSkip.type === 'recap' ? 'Recap' : 'Outro'}
            </button>
          )}

          {/* Bottom Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-3 pb-4 safe-area-bottom">
            {/* Progress Bar */}
            <div 
              className="relative h-1.5 bg-white/20 rounded-full mb-3 touch-none"
              data-player-interactive="true"
              onTouchStart={handleProgressSeek}
              onTouchMove={handleProgressSeek}
              onMouseMove={handleProgressBarHover}
              onMouseLeave={handleProgressBarLeave}
            >
              {/* Hover Time Tooltip */}
              {showHoverTime && (
                <div
                  className="absolute bottom-full mb-2 bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none z-50 font-medium"
                  style={{ left: `calc(${hoverPercent}% - 24px)` }}
                >
                  {formatTime(hoverTime)}
                </div>
              )}
              {/* Buffered */}
              <div 
                className="absolute h-full bg-white/30 rounded-full"
                style={{ width: `${(buffered / duration) * 100}%` }}
              />
              {/* Progress */}
              <div 
                className="absolute h-full bg-primary rounded-full shadow-lg"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
              {/* Thumb */}
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-xl border-2 border-primary"
                style={{ left: `calc(${(currentTime / duration) * 100}% - 8px)` }}
              />
            </div>

            {/* Time & Actions */}
            <div className="flex items-center justify-between">
              <span className="text-white text-sm font-semibold drop-shadow-lg">
                {formatTime(currentTime)} <span className="text-white/60">/</span> {formatTime(duration)}
              </span>

              <div className="flex items-center gap-2">
                {/* Subtitles — quick switch; full styling lives in the settings sheet */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowSubtitleMenu(!showSubtitleMenu);
                    }}
                    aria-label="Subtitles"
                    className={cn(
                      "p-2.5 rounded-full backdrop-blur-md active:scale-95 transition-transform border",
                      currentSubtitle !== 'off'
                        ? 'bg-primary border-white/20'
                        : 'bg-white/10 border-white/10'
                    )}
                  >
                    <Subtitles className="w-5 h-5 text-white" />
                  </button>

                  {showSubtitleMenu && (
                    <div className="absolute bottom-14 right-0 bg-black/95 backdrop-blur-xl rounded-2xl p-2 min-w-[180px] max-h-[250px] overflow-y-auto border border-white/10 shadow-2xl z-30">
                      <button
                        onClick={() => handleSubtitleChange('off')}
                        className={cn(
                          "w-full px-4 py-3 text-left text-sm rounded-xl transition-colors",
                          currentSubtitle === 'off' ? 'bg-primary text-white font-semibold' : 'text-white/80 hover:bg-white/5'
                        )}
                      >
                        Off
                      </button>
                      {visibleSubtitles.map((sub, idx) => {
                        const subtitleKey = getSubtitleSelectionKey(sub, idx);
                        return (
                        <button
                          key={subtitleKey}
                          onClick={() => handleSubtitleChange(subtitleKey)}
                          className={cn(
                            "w-full px-4 py-3 text-left text-sm rounded-xl transition-colors",
                            currentSubtitle === subtitleKey ? 'bg-primary text-white font-semibold' : 'text-white/80 hover:bg-white/5'
                          )}
                        >
                          {sub.label || sub.lang}
                        </button>
                      )})}
                    </div>
                  )}
                </div>

                {/* Settings — full desktop-parity sheet, bottom-sheet on mobile */}
                <button
                  onClick={() => {
                    setShowSubtitleMenu(false);
                    setShowFullSettings(true);
                  }}
                  aria-label="Player settings"
                  className="p-2.5 rounded-full bg-white/10 backdrop-blur-md active:scale-95 transition-transform border border-white/10"
                >
                  <Settings className="w-5 h-5 text-white" />
                </button>

                {/* Fullscreen */}
                <button
                  onClick={toggleFullscreen}
                  className="p-2.5 rounded-full bg-white/10 backdrop-blur-md active:scale-95 transition-transform border border-white/10"
                >
                  {isFullscreen ? (
                    <Minimize className="w-5 h-5 text-white" />
                  ) : (
                    <Maximize className="w-5 h-5 text-white" />
                  )}
                </button>

                {/* Screenshot */}
                <button
                  onClick={handleScreenshot}
                  className="p-2.5 rounded-full bg-white/10 backdrop-blur-md active:scale-95 transition-transform border border-white/10"
                  title="Take Screenshot"
                >
                  <Camera className="w-5 h-5 text-white" />
                </button>

                {/* Download — desktop parity (stream or torrent, gated like VideoPlayer).
                    Only when the episode is identified (WatchPage); custom/
                    standalone mounts without an episodeId hide it. */}
                {Boolean(episodeId) && (
                <div className="rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-white [&_button]:!bg-transparent [&_button]:!p-2.5 [&_button]:!rounded-full [&_svg]:!w-5 [&_svg]:!h-5 [&_svg]:text-white">
                  <DownloadButton
                    episodeId={episodeId}
                    animeName={animeName}
                    episodeNumber={episodeNumber}
                    posterUrl={animePoster ?? poster}
                    sourceUrl={currentSource?.url}
                    sourceType={(currentSource as any)?.sourceType ?? sourceType}
                    torrentUrl={
                      String((currentSource as any)?.sourceType ?? sourceType ?? '').toLowerCase() === 'torrent' ||
                      String((currentSource as any)?.sourceType ?? sourceType ?? '').toLowerCase() === 'debrid' ||
                      String(currentSource?.url || '').startsWith('magnet:')
                        ? torrentUrl
                        : undefined
                    }
                    headers={{
                      ...(playbackReferer ? { Referer: playbackReferer } : {}),
                      ...(playbackUserAgent ? { 'User-Agent': playbackUserAgent } : {}),
                      ...(headers?.Origin ? { Origin: headers.Origin } : {}),
                    }}
                    animeId={animeId ?? (typeof malId === 'number' ? malId : null)}
                    subtitles={subtitles}
                  />
                </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Server Info Badge */}
      {serverName && showControls && !isLocked && (
        <div className="pointer-events-none absolute top-20 right-3 z-40 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
          <span className="text-white/80 text-xs font-medium">{serverName}</span>
        </div>
      )}

      {/* Full settings — desktop parity (playback / video / subtitles / audio / keys) */}
      <VideoSettingsPanel
        isOpen={showFullSettings}
        onClose={() => setShowFullSettings(false)}
        availableSubtitles={settingsSubtitleOptions}
        audioTracks={hlsAudioTracks}
        currentAudioTrack={currentHlsAudioTrack}
        onAudioTrackChange={handleHlsAudioChange}
      />
    </div>
  );
}
