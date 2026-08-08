import { useState, useRef, useEffect, useCallback, useMemo } from "react";

import {

  Play,

  Pause,

  Volume2,

  VolumeX,


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
 Maximize,
  Sparkles,
  AlertTriangle,
  PictureInPicture2,
  Camera,
  Type,
  Mic,
  MonitorPlay,
  RotateCcw,
  Lock,
} from "lucide-react";

import Hls from "hls.js";

import { toast } from "sonner";

import { useVideoSettings } from "@/hooks/media/useVideoSettings";
import { useIsNativeApp } from "@/hooks/ui/useIsNativeApp";
import { updateDiscordRpc } from "@/lib/discordRpc";

import { VideoSettingsPanel } from "./VideoSettingsPanel";

import { useAniskip } from "@/hooks/media/useAniskip";
import { fetchViaChain } from "@/core/network/proxyChain";
import { 
  resolvePlayableStream, 
  buildProxyCandidateUrls,
  buildRefererCandidatesForStream,
  buildProxyBaseCandidates,
  resolveSingleStreamProxyBase,
  isMokoProxyUrl,
  isLoopbackProxyUrl
} from "@/core/player/stream-resolver";

import { getProxiedImageUrl, getProxiedVideoUrl, getProxiedSubtitleUrl, readProxyQuerySnapshot, trackEvent } from "@/lib/api";
import { formatTime } from "@/core/player/time-utils";
import {
  buildSubtitleFetchCandidates,
  getSubtitleSelectionKey,
  normalizeSubtitleToVtt,
  parseVttCues,
} from "@/core/player/subtitle-utils";
import { playbackEventBus, PlayerEvents } from "@/core/player/PlaybackEventBus";
import { sourceAdapterRegistry } from "@/core/player/SourceAdapterRegistry";
import { Seekbar } from "./controls/Seekbar";
import { SubtitleMemory } from "@/core/player/subtitle-memory";
import { DubTracker } from "@/core/content/dub-tracker";
import { TorrentStatusPanel } from "@/components/torrent/TorrentStatusPanel";

const SIZE_OPTIONS = [
  { value: 'small', label: 'S' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'L' },
  { value: 'xlarge', label: 'XL' },
] as const;

const FONT_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Mono' },
] as const;

const BG_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'semi', label: 'Semi' },
  { value: 'solid', label: 'Solid' },
] as const;

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

// Proxy logic moved to @/core/player/stream-resolver.ts
// Subtitle helpers moved to @/core/player/subtitle-utils.ts

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

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  en: 'English',
  ja: 'Japanese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  ar: 'Arabic',
  hi: 'Hindi',
  it: 'Italian',
  ru: 'Russian',
  ko: 'Korean',
  zh: 'Chinese',
  und: 'Unknown',
};

function normalizeTrackLanguage(lang?: string): string {
  const value = String(lang || '').trim().toLowerCase().replace('_', '-');
  if (!value) return 'und';
  if (value === 'en' || value.startsWith('eng') || value.includes('english')) return 'en';
  if (value === 'ja' || value.startsWith('jpn') || value.includes('japanese')) return 'ja';
  if (value === 'es' || value.startsWith('spa') || value.includes('spanish') || value.includes('espanol')) return 'es';
  if (value === 'fr' || value.startsWith('fra') || value.startsWith('fre') || value.includes('french')) return 'fr';
  if (value === 'de' || value.startsWith('deu') || value.startsWith('ger') || value.includes('german')) return 'de';
  if (value === 'pt' || value.startsWith('por') || value.includes('portuguese')) return 'pt';
  if (value === 'ar' || value.startsWith('ara') || value.includes('arabic')) return 'ar';
  if (value === 'hi' || value.startsWith('hin') || value.includes('hindi')) return 'hi';
  if (value === 'it' || value.startsWith('ita') || value.includes('italian')) return 'it';
  if (value === 'ru' || value.startsWith('rus') || value.includes('russian')) return 'ru';
  if (value === 'ko' || value.startsWith('kor') || value.includes('korean')) return 'ko';
  if (value === 'zh' || value.startsWith('zho') || value.startsWith('chi') || value.includes('chinese')) return 'zh';
  if (value.length >= 2) return value.slice(0, 2);
  return 'und';
}

function getLanguageDisplayName(lang?: string): string {
  const code = normalizeTrackLanguage(lang);
  return LANGUAGE_DISPLAY_NAMES[code] || code.toUpperCase();
}

function isGenericTrackTitle(title: string): boolean {
  const normalized = String(title || '').trim().toLowerCase();
  return (
    !normalized ||
    normalized === 'default' ||
    normalized === 'unknown' ||
    normalized === 'und' ||
    normalized === 'cr' ||
    /^((audio|subtitle|video)\s+track\s+\d+)$/i.test(normalized)
  );
}

function formatMediaTrackLabel(track: { language?: string; title?: string }): string {
  const langName = getLanguageDisplayName(track.language);
  const rawTitle = String(track.title || '').trim();
  const normalizedTitle = rawTitle.toLowerCase();
  const normalizedLang = String(track.language || '').trim().toLowerCase();

  if (
    isGenericTrackTitle(rawTitle) ||
    normalizedTitle === normalizedLang ||
    normalizedTitle === langName.toLowerCase()
  ) {
    return langName;
  }

  return `${langName} (${rawTitle})`;
}

function getSubtitleDisplayKey(track: { lang?: string; label?: string }): string {
  const langKey = normalizeTrackLanguage(track.lang || track.label || '');
  const label = String(track.label || getLanguageDisplayName(langKey)).trim().toLowerCase().replace(/\s+/g, ' ');
  return `${langKey}|${label}`;
}

function dedupeInternalSubtitleTracks(tracks: Array<{ id: number; label: string; lang: string; default?: boolean }>) {
  const seen = new Set<string>();
  const deduped: Array<{ id: number; label: string; lang: string; default?: boolean }> = [];

  for (const track of tracks) {
    const key = getSubtitleDisplayKey(track);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(track);
  }
  return deduped;
}

function doesSubtitleTrackMatchPreference(track: Pick<TextTrack, 'language' | 'label'>, preference: string): boolean {
  const normalizedPreference = String(preference || '').trim().toLowerCase();
  const language = normalizeTrackLanguage(track.language);
  const label = String(track.label || '').toLowerCase();

  if (normalizedPreference === 'english') return language === 'en' || label.includes('english') || label.includes('eng');
  if (normalizedPreference === 'spanish') return language === 'es' || label.includes('spanish') || label.includes('espanol');
  if (normalizedPreference === 'french') return language === 'fr' || label.includes('french');
  if (normalizedPreference === 'german') return language === 'de' || label.includes('german');
  if (normalizedPreference === 'japanese') return language === 'ja' || label.includes('japanese');
  if (normalizedPreference === 'portuguese') return language === 'pt' || label.includes('portuguese');
  if (normalizedPreference === 'arabic') return language === 'ar' || label.includes('arabic');
  if (normalizedPreference === 'hindi') return language === 'hi' || label.includes('hindi');
  if (normalizedPreference.length === 2) return language === normalizedPreference;

  return label.includes(normalizedPreference);
}

function getPreferredInternalSubtitleTrack(
  tracks: Array<{ id: number; lang: string; default?: boolean }>,
  subtitlePreference: string,
): { id: number; lang: string; default?: boolean } | null {
  if (!tracks.length) return null;
  const normalizedPreference = String(subtitlePreference || '').trim().toLowerCase();

  const matchByLanguage = (expected: string) =>
    tracks.find((track) => normalizeTrackLanguage(track.lang) === expected);

  if (normalizedPreference === 'auto' || normalizedPreference === 'english') {
    return matchByLanguage('en') || tracks.find((track) => track.default) || tracks[0];
  }

  const languageCodeByPreference: Record<string, string> = {
    spanish: 'es',
    french: 'fr',
    german: 'de',
    japanese: 'ja',
    portuguese: 'pt',
    arabic: 'ar',
    hindi: 'hi',
  };

  const expectedCode = languageCodeByPreference[normalizedPreference] || normalizedPreference;
  return matchByLanguage(expectedCode) || matchByLanguage('en') || tracks.find((track) => track.default) || tracks[0];
}

function isTransientTorrentStartupError(message: string): boolean {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('demuxer_error_could_not_open') ||
    normalized.includes('open context failed') ||
    normalized.includes('invalid data found when processing input') ||
    normalized.includes('end of file') ||
    normalized.includes('read error') ||
    normalized.includes('duplicate element') ||
    normalized.includes('could not open')
  );
}

function parseQualityScore(quality?: string): number | null {
  const normalized = String(quality || '').toLowerCase();
  const match = normalized.match(/(\d{3,4})\s*p?/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function selectPreferredSource(
  sources: Array<{ url: string; isM3U8: boolean; quality?: string; sourceType?: string }>,
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
    .filter((entry): entry is { source: { url: string; isM3U8: boolean; quality?: string; sourceType?: string }; score: number } => entry.score != null)
    .sort((left, right) => {
      const distanceDiff = Math.abs(left.score - preferredScore) - Math.abs(right.score - preferredScore);
      if (distanceDiff !== 0) return distanceDiff;
      return right.score - left.score;
    });

  if (candidates.length > 0) return candidates[0].source;

  return sources.find((source) => String(source.quality || '').toLowerCase() === preferredQuality) || sources[0];
}

interface VideoPlayerProps {
  sources: Array<{ url: string; isM3U8: boolean; quality?: string; sourceType?: string }>;
  subtitles?: Array<{ lang: string; url: string; label?: string }>;
  headers?: { Referer?: string; "User-Agent"?: string };
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
  viewCount?: number;
  isLive?: boolean;
  isTimelineLocked?: boolean;
  timelineLockReason?: string;
  hideTimelineUi?: boolean;
  torrentStats?: {
    progress: number;
    downloadSpeed: number;
    uploadSpeed: number;
    numPeers: number;
    seeders: number | null;
    leechers: number | null;
    eta: number | null;
    done: boolean;
    verified: boolean;
    startedAt?: number;
    name?: string;
    infoHash?: string;
    storage?: any;
  };
  torrentSessionId?: string;
  onTorrentRepair?: () => void;
  onTorrentStop?: () => void;
}

function formatTimeLocal(seconds: number): string {
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
  isTimelineLocked = false,
  timelineLockReason = 'Seeking unlocks after the torrent has fully downloaded and verified.',
  hideTimelineUi = false,
  episodeTitle,
  isOffline,
  torrentStats,
  torrentSessionId,
  onTorrentRepair,
  onTorrentStop,
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
  const controlsOverlayRef = useRef<HTMLDivElement>(null);

  const hlsRef = useRef<Hls | null>(null);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { settings, updateSetting } = useVideoSettings();
  const currentSource = useMemo(
    () => selectPreferredSource(sources, settings.defaultQuality),
    [sources, settings.defaultQuality],
  );

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
  const currentTimeRef = useRef(0);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const [duration, setDuration] = useState(0);

  const [lastSavedProgress, setLastSavedProgress] = useState(0);

  const lastSavedProgressRef = useRef<number>(0);

  const progressIntervalRef = useRef<number | null>(null);
  const torrentPlaybackUpdateRef = useRef(0);

  const PROGRESS_SAVE_INTERVAL = 15; // seconds

  const [volume, setVolume] = useState(settings.volume);

  const [isMuted, setIsMuted] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const autoPiPDismissedRef = useRef(false);
  const pipRequestInFlightRef = useRef(false);

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
  const [currentSecondarySubtitle, setCurrentSecondarySubtitle] = useState<string>(settings.secondarySubtitleLanguage || 'off');
  const [secondarySubtitleCues, setSecondarySubtitleCues] = useState<Array<{ start: number; end: number; text: string }>>([]);
  const [audioTracks, setAudioTracks] = useState<Array<{ id: number; label: string; lang: string; default?: boolean }>>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(0);
  const [extractedAudioUrls, setExtractedAudioUrls] = useState<Record<number, string>>({});
  const [activeExtractedAudioTrack, setActiveExtractedAudioTrack] = useState<number | null>(null);
  const [internalSubtitles, setInternalSubtitles] = useState<Array<{ id: number; label: string; lang: string; default?: boolean }>>([]);

  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [customSubtitles, setCustomSubtitles] = useState<Array<{ lang: string; url: string; label: string; internalTrackId?: number }>>([]);
  const [subtitleBlobs, setSubtitleBlobs] = useState<Record<string, string>>({});
  const [activeSkip, setActiveSkip] = useState<any>(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [hoverTime, setHoverTime] = useState<number>(0);
  const [showHoverTime, setShowHoverTime] = useState(false);
  const [hoverPercent, setHoverPercent] = useState(0);
  const isNative = useIsNativeApp();
  const [externalPlayerPath, setExternalPlayerPath] = useState<string | null>(null);

  useEffect(() => {
    if (isNative && (window as any).tatakaiRuntime?.getExternalPlayerPref) {
      (window as any).tatakaiRuntime.getExternalPlayerPref().then((pref: any) => {
        if (pref?.executablePath) {
          setExternalPlayerPath(pref.executablePath);
        }
      });
    }
  }, [isNative]);

  const handleRefresh = useCallback(() => {
    if (!videoRef.current) return;
    
    const wasPlaying = !videoRef.current.paused;
    const currentTimeSnapshot = videoRef.current.currentTime;
    
    toast.info('Refreshing video stream...');
    
    // Reload the video element
    videoRef.current.load();
    
    // Attempt to restore time after metadata loads
    const onLoaded = () => {
      if (videoRef.current) {
        videoRef.current.currentTime = currentTimeSnapshot;
        if (wasPlaying) {
          void videoRef.current.play().catch(() => {});
        }
      }
      videoRef.current?.removeEventListener('loadedmetadata', onLoaded);
    };
    
    videoRef.current.addEventListener('loadedmetadata', onLoaded);
  }, []);

  const handleLaunchExternal = useCallback(async () => {
    if (!isNative || !externalPlayerPath || !currentSource?.url) return;

    try {
      const rt = (window as any).tatakaiRuntime;
      const res = await rt.launchExternalPlayer({
        executablePath: externalPlayerPath,
        streamUrl: currentSource.url,
        options: {
          startTime: currentTimeRef.current,
          title: `${animeName || 'Tatakai'} - ${episodeNumber ? `Episode ${episodeNumber}` : ''} ${episodeTitle || ''}`.trim()
        }
      });

      if (res.success) {
        toast.success(`Launched ${res.player || 'external player'}`);
        if (isPlaying) videoRef.current?.pause();
      } else {
        toast.error(res.error || 'Failed to launch external player');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error launching external player');
    }
  }, [isNative, externalPlayerPath, currentSource?.url, animeName, episodeNumber, episodeTitle, isPlaying]);

  useEffect(() => {
    if (currentSource?.url && settings.alwaysUseExternalPlayer && externalPlayerPath && isNative) {
      handleLaunchExternal();
    }
  }, [currentSource?.url, settings.alwaysUseExternalPlayer, externalPlayerPath, isNative]);

  const externalAudioRef = useRef<HTMLAudioElement | null>(null);

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
    setCurrentSubtitle(getSubtitleSelectionKey(newSub, subtitles.length + customSubtitles.length));

    // Also add to blobs map immediately so it renders
    setSubtitleBlobs(prev => ({ ...prev, [url]: url }));

    toast.success(`Loaded subtitle: ${file.name}`);
  };



  // Keep a stable ref to the latest progress callback to avoid effect churn

  const progressCallbackRef = useRef<typeof onProgressUpdate | null>(onProgressUpdate);



  const initialSeekDoneRef = useRef(false);

  const manifestFallbackRef = useRef(false);
  const manifestRetryRef = useRef(0);
  const audioCodecSwapAttemptedRef = useRef(false);
  const mediaErrorBurstRef = useRef({ windowStart: 0, count: 0, escalatedAt: 0 });
  const bufferingTimeoutRef = useRef<number | null>(null);
  const lastProgressAtRef = useRef<number>(Date.now());
  const lastObservedTimeRef = useRef<number>(0);
  const manualRetryLockUntilRef = useRef(0);
  const subtitleApplyStateRef = useRef<{ lang: string; selectedIndex: number; trackCount: number } | null>(null);
  const subtitleTrackSignatureRef = useRef<string>('');
  const extractedSubtitleCacheRef = useRef<Record<string, string>>({});
  const extractedSubtitlePromiseRef = useRef<
    Map<string, Promise<{ usableUrl: string; extractedUrl: string; rawUrl: string } | null>>
  >(new Map());
  const autoLoadedInternalSubtitleRef = useRef<string>('');
  const allRenderedSubtitles = useMemo(
    () => [...subtitles, ...customSubtitles],
    [subtitles, customSubtitles],
  );
  const internalSubtitleDisplayKeys = useMemo(
    () => new Set(internalSubtitles.map(getSubtitleDisplayKey)),
    [internalSubtitles],
  );
  const visibleSubtitleOptions = useMemo(
    () => {
      const seen = new Set(internalSubtitleDisplayKeys);
      return allRenderedSubtitles
        .map((sub, index) => ({ sub, index }))
        .filter(({ sub }) => {
          if ((sub as { internalTrackId?: number }).internalTrackId != null) return false;
          const key = getSubtitleDisplayKey(sub);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    },
    [allRenderedSubtitles, internalSubtitleDisplayKeys],
  );
  const currentInternalSubtitleTrackId = useMemo(() => {
    const index = allRenderedSubtitles.findIndex(
      (sub, subtitleIndex) => getSubtitleSelectionKey(sub, subtitleIndex) === currentSubtitle,
    );
    const internalTrackId = index >= 0
      ? (allRenderedSubtitles[index] as { internalTrackId?: number } | undefined)?.internalTrackId
      : undefined;
    return typeof internalTrackId === 'number' ? internalTrackId : null;
  }, [allRenderedSubtitles, currentSubtitle]);
  const torrentStartupGraceUntilRef = useRef(0);
  const deferredProbeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timelineSeekingLocked = Boolean(isTimelineLocked && !isLive);
  const timelineUiHidden = Boolean(hideTimelineUi && !isLive);
  const timelineSeekingLockedRef = useRef(timelineSeekingLocked);
  const timelineLockReasonRef = useRef(timelineLockReason);

  const initialSeekRef = useRef(initialSeekSeconds);

  useEffect(() => {
    timelineSeekingLockedRef.current = timelineSeekingLocked;
    timelineLockReasonRef.current = timelineLockReason;
  }, [timelineSeekingLocked, timelineLockReason]);

  const showTimelineLockHint = useCallback(() => {
    toast.info(timelineLockReasonRef.current || 'Seeking is temporarily locked.', {
      id: 'torrent-timeline-locked',
    });
  }, []);



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

  // Sync with Discord RPC (single source of truth for watch activity)
  const lastRpcUpdateRef = useRef(0);
  useEffect(() => {
    if (!isNative || !animeName) return;
    const now = Date.now();
    if (now - lastRpcUpdateRef.current < 5000) return;
    lastRpcUpdateRef.current = now;

    const episodeLabel = episodeNumber
      ? `Episode ${episodeNumber}`
      : 'Watching';

    updateDiscordRpc(`Watching ${animeName}`, episodeLabel, {
      startTime: isPlaying ? new Date(Date.now() - currentTime * 1000) : undefined,
      endTime: isPlaying && duration > 0 ? new Date(Date.now() + (duration - currentTime) * 1000) : undefined,
      smallImageKey: isPlaying ? 'play_icon' : 'pause_icon',
      smallImageText: isPlaying ? 'Playing' : 'Paused',
    });
  }, [isNative, isPlaying, animeName, episodeNumber, currentTime, duration]);



  const handleSubtitleChange = useCallback((lang: string) => {
    const video = videoRef.current;
    if (!video) return;

    const tracks = video.textTracks;
    const orderedSubtitles = allRenderedSubtitles;
    const selectedKey = lang.trim();
    const selectedKeyLower = selectedKey.toLowerCase();

    // 1. Initially disable all tracks to clear any duplicate/orphaned subtitles
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = 'disabled';
    }

    if (lang === 'off') {
      subtitleApplyStateRef.current = { lang, selectedIndex: -1, trackCount: tracks.length };
      setCurrentSubtitle('off');
      return;
    }

    let selectedIndex = -1;
    const trackElements = video.querySelectorAll('track');

    // 2. Try to match tracks by their DOM element src attribute
    if (trackElements.length > 0) {
      for (let i = 0; i < trackElements.length; i++) {
        const trackElement = trackElements[i] as HTMLTrackElement;
        const track = trackElement.track;
        if (!track) continue;

        const trackSrc = trackElement.getAttribute('src') || '';
        const subIndex = orderedSubtitles.findIndex((s, idx) => {
          const subUrl = String(s.url || '').trim();
          if (!subUrl) return false;
          // Match by raw attribute source, resolved source, or blob/proxied source
          const blobUrl = subtitleBlobs[subUrl];
          return trackSrc === subUrl || trackElement.src === subUrl || trackSrc === blobUrl || trackElement.src === blobUrl;
        });

        if (subIndex >= 0) {
          const sub = orderedSubtitles[subIndex];
          const subtitleSelectionKey = getSubtitleSelectionKey(sub, subIndex).toLowerCase();
          
          let isMatch = false;
          if (selectedKeyLower === 'auto' || selectedKeyLower === 'english') {
            isMatch = doesSubtitleTrackMatchPreference(track, 'english');
          } else {
            isMatch = subtitleSelectionKey === selectedKeyLower;
          }

          if (isMatch) {
            track.mode = 'showing';
            selectedIndex = subIndex;
            // Break only if we are matching a specific selection (for auto/english, let it select)
            if (selectedKeyLower !== 'auto' && selectedKeyLower !== 'english') {
              break;
            }
          }
        }
      }
    }

    // 3. Fallback to index/label matching if DOM tracks aren't fully resolved yet
    if (selectedIndex < 0) {
      const englishIndex = (() => {
        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i];
          if (doesSubtitleTrackMatchPreference(track, 'english')) return i;
        }
        return -1;
      })();

      if (lang === 'auto') {
        selectedIndex = englishIndex >= 0 ? englishIndex : (tracks.length > 0 ? 0 : -1);
      } else {
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
            if (doesSubtitleTrackMatchPreference(track, selectedKeyLower)) {
              selectedIndex = i;
              break;
            }
          }
        }
      }

      if (selectedIndex >= 0 && selectedIndex < tracks.length) {
        tracks[selectedIndex].mode = 'showing';
      }
    }

    subtitleApplyStateRef.current = {
      lang,
      selectedIndex,
      trackCount: tracks.length,
    };

    setCurrentSubtitle((prev) => (prev === lang ? prev : lang));
  }, [allRenderedSubtitles, subtitleBlobs]);



  useEffect(() => {

    handleSubtitleChange(settings.subtitleLanguage);

  }, [settings.subtitleLanguage, handleSubtitleChange]);

  useEffect(() => {
    setCurrentSecondarySubtitle(String(settings.secondarySubtitleLanguage || 'off'));
  }, [settings.secondarySubtitleLanguage]);



  // Create a key from subtitle metadata to detect source changes.
  const subtitleKey = [...(subtitles || []), ...(customSubtitles || [])]
    ?.map((s) => `${String(s.url || '').trim()}|${String(s.lang || '').trim()}|${String(s.label || '').trim()}`)
    .join('|') ?? '';
  const subtitleReferer = headers?.Referer || '';
  const subtitleUserAgent = headers?.["User-Agent"] || '';
  const playbackReferer = headers?.Referer || '';
  const playbackUserAgent = headers?.["User-Agent"] || '';
  const sourceKey = currentSource?.url || '';

  useEffect(() => {
    subtitleApplyStateRef.current = null;
    subtitleTrackSignatureRef.current = '';
  }, [subtitleKey, sourceKey]);



  // Prefetch subtitles and normalize to VTT so track loading is deterministic.

  // Also clear old blobs when subtitles change (e.g., switching between sub/dub).

  useEffect(() => {
    const allSubs = [...(subtitles || []), ...(customSubtitles || [])];
    if (allSubs.length === 0) {
      // Clear blobs if no subtitles
      setSubtitleBlobs({});
      return;
    }



    let mounted = true;
    const createdBlobUrls: string[] = [];



    // Clear existing blobs and refetch when subtitle sources change

    setSubtitleBlobs({});



    (async () => {


      for (const sub of allSubs) {

        if (!mounted) break;

        try {
          const subtitleSourceUrl = String(sub.url || '').trim();
          if (!subtitleSourceUrl) continue;

          // Check if local asset
          const isLocalSub = subtitleSourceUrl.startsWith('asset://') || subtitleSourceUrl.includes('asset.localhost');

          if (isLocalSub) {
            if (mounted) setSubtitleBlobs(prev => ({ ...prev, [subtitleSourceUrl]: subtitleSourceUrl }));
            continue;
          }

          // Handle local file:// URLs by converting to data URLs via IPC
          if (subtitleSourceUrl.startsWith('file://')) {
            try {
              const fileResult = await (window as any).tatakaiRuntime?.readLocalFile?.(subtitleSourceUrl);
              if (fileResult?.success && fileResult?.url) {
                if (mounted) {
                  setSubtitleBlobs(prev => ({ ...prev, [subtitleSourceUrl]: fileResult.url }));
                }
                continue;
              }
            } catch (err) {
              console.warn('Failed to read local subtitle file:', subtitleSourceUrl, err);
            }
          }

          const fetchCandidates = buildSubtitleFetchCandidates(
            subtitleSourceUrl,
            subtitleReferer,
            Boolean(isOffline),
            (url, referer) => getProxiedSubtitleUrl(url, referer)
          );

          let normalizedText = '';
          for (const candidateUrl of fetchCandidates) {
            try {
              const response = await fetchViaChain(candidateUrl, {
                headers: {
                  Accept: 'text/vtt, text/plain, */*',
                },
                signal: AbortSignal.timeout(10000),
              });

              if (!response.ok) {
                continue;
              }

              normalizedText = normalizeSubtitleToVtt(await response.text());
              if (normalizedText) {
                break;
              }
            } catch {
              // Continue trying the next candidate URL.
            }
          }

          if (normalizedText) {
            const blob = new Blob([normalizedText], { type: 'text/vtt' });
            const blobUrl = URL.createObjectURL(blob);
            createdBlobUrls.push(blobUrl);

            if (mounted) {
              setSubtitleBlobs((prev) => ({ ...prev, [subtitleSourceUrl]: blobUrl }));
            }
          } else {
            console.warn('Failed to fetch subtitle:', sub.lang, subtitleSourceUrl);
          }

        } catch (e) {

          console.warn('Error prefetching subtitle', sub.lang, e);

        }

      }

    })();



    return () => {

      mounted = false;

      createdBlobUrls.forEach((blobUrl) => {
        URL.revokeObjectURL(blobUrl);
      });

    };

  }, [subtitleKey, subtitleReferer, subtitleUserAgent, isOffline]);

  // Secondary subtitle overlay (dual subs): parse cues from the selected subtitle.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const selection = String(currentSecondarySubtitle || '').trim();
      if (!selection || selection === 'off') {
        setSecondarySubtitleCues([]);
        return;
      }

      const allSubs = [...(subtitles || []), ...(customSubtitles || [])];
      const matchedIndex = allSubs.findIndex((sub, idx) => getSubtitleSelectionKey(sub as any, idx) === selection);
      const sub = matchedIndex >= 0 ? allSubs[matchedIndex] : null;
      const sourceUrl = sub?.url ? String(sub.url).trim() : '';
      if (!sourceUrl) {
        setSecondarySubtitleCues([]);
        return;
      }

      const resolvedUrl = subtitleBlobs[sourceUrl] || sourceUrl;

      try {
        const res = await fetch(resolvedUrl);
        if (!res.ok) {
          if (!cancelled) setSecondarySubtitleCues([]);
          return;
        }
        const text = await res.text();
        const vtt = normalizeSubtitleToVtt(text);
        const cues = parseVttCues(vtt);
        if (!cancelled) setSecondarySubtitleCues(cues);
      } catch {
        if (!cancelled) setSecondarySubtitleCues([]);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [currentSecondarySubtitle, subtitles, customSubtitles, subtitleBlobs]);



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
      }).join('||') + `||select:${currentSubtitle}`;

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
        }).join('||') + `||select:${currentSubtitle}`;

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

    if (timelineSeekingLockedRef.current) {
      showTimelineLockHint();
      return;
    }

    if (activeSkip && videoRef.current) {

      videoRef.current.currentTime = activeSkip.interval.endTime;

      setActiveSkip(null);

    }

  }, [activeSkip, showTimelineLockHint]);



  // Detect mobile

  useEffect(() => {

    const checkMobile = () => setIsMobile(window.innerWidth < 768);

    checkMobile();

    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);

  }, []);



  const autoSkippedWindowRef = useRef<string | null>(null);

  useEffect(() => {
    autoSkippedWindowRef.current = null;
  }, [sourceKey]);

  useEffect(() => {
    if (!settings.autoSkipIntro || !activeSkip || !videoRef.current) return;
    if (timelineSeekingLockedRef.current) return;
    if (activeSkip.skipType !== 'op' && activeSkip.skipType !== 'mixed-op' && activeSkip.skipType !== 'recap') {
      return;
    }

    const windowKey = `${activeSkip.skipType}:${activeSkip.interval.startTime}:${activeSkip.interval.endTime}`;
    if (autoSkippedWindowRef.current === windowKey) return;

    videoRef.current.currentTime = activeSkip.interval.endTime;
    autoSkippedWindowRef.current = windowKey;
    setActiveSkip(null);
  }, [activeSkip, settings.autoSkipIntro, timelineSeekingLocked]);



  const loadVideo = useCallback(
    async () => {
      if (!currentSource?.url || !videoRef.current) return;

      setVideoError(null);
      setIsBuffering(true);

      let mode: 'hls' | 'direct' | 'torrent' | 'offline' | 'debrid' = 'direct';
      if (isOffline) {
        mode = 'offline';
      } else {
        const url = String(currentSource.url || '');
        const isHlsStream = Boolean(currentSource.isM3U8 || url.includes('.m3u8'));
        const isPlayableHttpOrFile = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');

        if (currentSource.sourceType === 'torrent') {
          mode = isHlsStream ? 'hls' : (isPlayableHttpOrFile ? 'direct' : 'torrent');
        } else if (url.startsWith('magnet:')) {
          mode = 'debrid';
        } else if (isHlsStream) {
          mode = 'hls';
        }
      }

      if (deferredProbeTimerRef.current) {
        clearTimeout(deferredProbeTimerRef.current);
        deferredProbeTimerRef.current = null;
      }
      torrentStartupGraceUntilRef.current = mode === 'torrent' ? Date.now() + 15000 : 0;
      
      try {
        // If initial seek was already performed (e.g. switching from HLS to direct
        // URL after torrent completion), use the current playback position to avoid
        // jumping back to the initial seek time.
        const seekTime = initialSeekDoneRef.current
          ? (videoRef.current?.currentTime || initialSeekRef.current)
          : initialSeekRef.current;

        await sourceAdapterRegistry.switchTo({
          source: {
            id: currentSource.url,
            url: currentSource.url,
            mode: mode
          },
          videoElement: videoRef.current,
          startTime: seekTime,
          autoPlay: settings.autoplay
        });

        initialSeekDoneRef.current = true;
      } catch (err: any) {
        setVideoError(err.message || 'Failed to load video');
        setIsBuffering(false);
      }
    },
    [currentSource?.url, currentSource?.isM3U8, currentSource?.sourceType, isOffline, settings.autoplay]
  );

  useEffect(() => {
    loadVideo();
  }, [currentSource?.url, currentSource?.isM3U8, currentSource?.sourceType, isOffline, settings.autoplay]);

  const probeInProgressRef = useRef(false);

  const triggerMediaProbe = useCallback(async () => {
    const url = currentSource?.url;
    if (!url || !isNative || !(window as any).tatakaiRuntime?.probeMedia || probeInProgressRef.current) return;

    // Skip probing local file:// URLs — ffprobe is not bundled and cannot read
    // local files directly from the renderer. Only probe http:// torrent stream URLs.
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) return;

    // Only probe if it's likely an MKV or local file or torrent.
    // For torrent HLS remux, we still want to probe the underlying raw MKV URL
    // (provided by the runtime via `torrentStats.rawUrl`) to list internal tracks.
    const isM3U8 = url.includes('.m3u8') || currentSource?.isM3U8;
    const torrentRawUrl = (torrentStats as any)?.rawUrl;
    const allowTorrentProbeThroughHls = Boolean(
      isM3U8 &&
      currentSource?.sourceType === 'torrent' &&
      typeof torrentRawUrl === 'string' &&
      torrentRawUrl.startsWith('http'),
    );
    if (isM3U8 && !allowTorrentProbeThroughHls) return;

    const isTorrentSource = url.startsWith('magnet:') || url.length === 40 || currentSource?.sourceType === 'torrent';
    if (isTorrentSource && Date.now() < torrentStartupGraceUntilRef.current) {
      const delayMs = Math.max(1000, torrentStartupGraceUntilRef.current - Date.now() + 250);
      if (deferredProbeTimerRef.current) {
        clearTimeout(deferredProbeTimerRef.current);
      }
      deferredProbeTimerRef.current = setTimeout(() => {
        deferredProbeTimerRef.current = null;
        void triggerMediaProbe();
      }, delayMs);
      return;
    }

    if (isTorrentSource) {
      const sessionId = new URLSearchParams(window.location.search).get('sessionId');
      if (!sessionId) return;
    }

    probeInProgressRef.current = true;
    
    let attempts = 0;
    const maxAttempts = isTorrentSource ? 2 : 3;

    const tryProbe = async () => {
      try {
        let probeUrl = allowTorrentProbeThroughHls ? String(torrentRawUrl) : url;
        let result: { success?: boolean; tracks?: Array<any>; error?: string } | undefined;
        
        if (isTorrentSource) {
           const sessionId = new URLSearchParams(window.location.search).get('sessionId');
           const isTorrentComplete = Boolean(torrentStats?.done || torrentStats?.verified);

           if (isTorrentComplete) {
             // Torrent is complete — prefer local file path for fastest probing
             if (sessionId && (window as any).tatakaiRuntime?.getTorrentFilePath) {
               const pathRes = await (window as any).tatakaiRuntime.getTorrentFilePath(sessionId);
               if (pathRes?.success && pathRes?.path) {
                 probeUrl = pathRes.path;
               }
             }
           } else {
             // Torrent still downloading — use WebTorrent HTTP URL (supports range requests)
             // instead of the sparse local file which ffprobe can't read reliably
             const rawUrl = (torrentStats as any)?.rawUrl;
             if (typeof rawUrl === 'string' && rawUrl.startsWith('http')) {
               probeUrl = rawUrl;
             } else if (videoRef.current?.src?.startsWith('http')) {
               probeUrl = videoRef.current.src;
             }
           }

           // Only require prebuffer when probing a local file path.
           // When using the WebTorrent HTTP URL, the server handles on-demand
           // piece fetching, so no prebuffer is needed.
           const isHttpProbe = probeUrl.startsWith('http://') || probeUrl.startsWith('https://');
           if (!isHttpProbe && sessionId && (window as any).tatakaiRuntime?.ensureTorrentPrebuffer) {
             const fileIndex = (window as any).currentFileIndex ?? undefined;
             const prebuffer = await (window as any).tatakaiRuntime.ensureTorrentPrebuffer(sessionId, fileIndex, {
               requireMetadataTail: false,
             });
             if (!prebuffer?.success) {
               console.warn(`[VideoPlayer] Skipping media probe until torrent is ready: ${prebuffer?.error || 'prebuffer pending'}`);
               return false;
             }
           }

           console.log(`[VideoPlayer] Probing media: ${probeUrl} (attempt ${attempts + 1})`);
           result = await (window as any).tatakaiRuntime.probeMedia(probeUrl);
        } else {
          result = await (window as any).tatakaiRuntime.probeMedia(probeUrl);
        }
        
        if (result?.success) {
          if (result.tracks && result.tracks.length > 0) {
            console.log(`[VideoPlayer] Found tracks:`, result.tracks);
            const audio = result.tracks
              .filter((t: any) => t.type === 'audio')
              .map((t: any) => ({
                id: t.index,
                label: formatMediaTrackLabel(t),
                lang: normalizeTrackLanguage(t.language),
                default: !!t.default,
              }));
             
            const subs = result.tracks
              .filter((t: any) => t.type === 'subtitle')
              .map((t: any) => ({
                id: t.index,
                label: formatMediaTrackLabel(t),
                lang: normalizeTrackLanguage(t.language),
                default: !!t.default,
              }));

            const dedupedSubs = dedupeInternalSubtitleTracks(subs);

            setAudioTracks(audio);
            setInternalSubtitles(dedupedSubs);
            
            if (audio.length > 0 || dedupedSubs.length > 0) {
              console.log(`[VideoPlayer] Successfully detected ${audio.length} audio tracks and ${dedupedSubs.length} internal subtitles.`);
              toast.success(`Detected ${audio.length} audio tracks & ${dedupedSubs.length} subtitles`, { 
                id: 'probe-success',
                duration: 2000 
              });
            }

            if (audio.length > 0) {
              const defaultAudio = audio.find((t: any) => t.default) || audio[0];
              setCurrentAudioTrack(defaultAudio.id);
            }
          } else {
            console.warn(`[VideoPlayer] Probe successful but no tracks found in: ${probeUrl}`);
          }
          return true;
        } else {
          console.warn(`[VideoPlayer] Probe attempt ${attempts + 1} failed for ${probeUrl}:`, result?.error);
          return false;
        }
      } catch (err) {
        console.error(`[VideoPlayer] Probe error on attempt ${attempts + 1}:`, err);
        return false;
      }
    };

    while (attempts < maxAttempts) {
      const success = await tryProbe();
      if (success) break;
      attempts++;
      if (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, isTorrentSource ? 4000 : 1200));
      }
    }
    
    probeInProgressRef.current = false;
  }, [currentSource?.url, currentSource?.isM3U8, currentSource?.sourceType, isNative, (torrentStats as any)?.rawUrl]);

  // Probe media for internal tracks (MKV support)
  useEffect(() => {
    setAudioTracks([]);
    setInternalSubtitles([]);
    extractedSubtitleCacheRef.current = {};
    extractedSubtitlePromiseRef.current.clear();
    autoLoadedInternalSubtitleRef.current = '';
    if (deferredProbeTimerRef.current) {
      clearTimeout(deferredProbeTimerRef.current);
      deferredProbeTimerRef.current = null;
    }
    probeInProgressRef.current = false;
    triggerMediaProbe();
  }, [triggerMediaProbe, window.location.search]);

  // Retry media probe when torrent status changes and we haven't found tracks yet
  useEffect(() => {
    const isTorrentSource = currentSource?.sourceType === 'torrent' || currentSource?.url?.startsWith('magnet:') || currentSource?.url?.length === 40;
    if (!isTorrentSource || !isNative) return;

    // If we already have tracks, no need to probe again
    if (internalSubtitles.length > 0 || audioTracks.length > 0) return;

    // Only probe if we have a valid rawUrl and some peers or progress
    const rawUrl = (torrentStats as any)?.rawUrl;
    const hasConnection = (torrentStats?.numPeers ?? 0) > 0 || (torrentStats?.progress ?? 0) > 0 || torrentStats?.done;
    if (typeof rawUrl === 'string' && rawUrl.startsWith('http') && hasConnection) {
      console.log('[VideoPlayer] Retrying media probe due to torrent status update...');
      void triggerMediaProbe();
    }
  }, [
    currentSource?.url,
    torrentStats?.done,
    torrentStats?.progress,
    torrentStats?.numPeers,
    (torrentStats as any)?.rawUrl,
    internalSubtitles.length,
    audioTracks.length,
    triggerMediaProbe
  ]);

  useEffect(() => {
    return () => {
      if (deferredProbeTimerRef.current) {
        clearTimeout(deferredProbeTimerRef.current);
        deferredProbeTimerRef.current = null;
      }
    };
  }, []);

  const handleAudioTrackChange = useCallback((trackId: number) => {
    if (!videoRef.current || !isNative) return;
    const video = videoRef.current as any;

    void (async () => {
      const runtime = (window as any).tatakaiRuntime;
      const sessionId = new URLSearchParams(window.location.search).get('sessionId');
      const isTorrentSource = Boolean(sessionId && (currentSource?.sourceType === 'torrent' || currentSource?.url?.startsWith('magnet:')));

      // Torrent playback should always request a fresh stream for the selected audio
      // track. The media element's native audioTracks API uses its own zero-based track
      // indexes and can silently disable all tracks when fed probe stream indexes.
      if (isTorrentSource && runtime?.getTorrentStreamUrl) {
        try {
          const currentTimeSnapshot = Number.isFinite(video.currentTime) ? video.currentTime : 0;
          const wasPaused = video.paused;
          const playbackRate = video.playbackRate || 1;

          toast.loading('Switching dub audio (reloading stream)...');

          const stream = await runtime.getTorrentStreamUrl(sessionId, (window as any).currentFileIndex ?? undefined, { audioTrackIndex: trackId });
          toast.dismiss();

          if (!stream?.success || !stream.url) {
            toast.error(stream?.error || 'Failed to request audio-switched stream');
            return;
          }

          setActiveExtractedAudioTrack(null);
          setCurrentAudioTrack(trackId);

          const onLoadedMetadata = () => {
            try {
              if (Number.isFinite(currentTimeSnapshot) && currentTimeSnapshot > 0) {
                video.currentTime = currentTimeSnapshot;
              }
              video.playbackRate = playbackRate;
              video.muted = false;
              handleSubtitleChange(currentSubtitle);
              if (!wasPaused) {
                void video.play().catch(() => {});
              }
            } catch {
              // Ignore transient seek/play errors while the stream stabilizes.
            } finally {
              video.removeEventListener('loadedmetadata', onLoadedMetadata);
            }
          };

          video.addEventListener('loadedmetadata', onLoadedMetadata);
          video.src = stream.url;
          video.load();

          toast.success('Dub audio switched');
          return;
        } catch (err: any) {
          toast.dismiss();
          toast.error(err?.message || 'Error switching dub audio');
          return;
        }
      }

      // In Electron, we can try to switch audio tracks via the video element if enabled
      // but a more reliable way for MKV is often not available via standard JS.
      // However, if we enabled experimental features, video.audioTracks might work.
      if (video.audioTracks) {
        for (let i = 0; i < video.audioTracks.length; i++) {
          video.audioTracks[i].enabled = (i === trackId);
        }
        setActiveExtractedAudioTrack(null);
        setCurrentAudioTrack(trackId);
      } else {
      void (async () => {
        try {
          const runtime = (window as any).tatakaiRuntime;
          // If we're playing a torrent session, prefer requesting a new transcode
          // stream that maps the selected audio track, avoiding external extraction.
          const sessionId = new URLSearchParams(window.location.search).get('sessionId');
          const fileIndex = (window as any).currentFileIndex ?? undefined;

          if (sessionId && runtime?.getTorrentStreamUrl) {
            toast.loading('Switching dub audio (reloading stream)...');
            // Request a new transcode stream with the selected audio track
            const stream = await runtime.getTorrentStreamUrl(sessionId, fileIndex, { audioTrackIndex: trackId });
            toast.dismiss();
            if (stream?.success && stream?.url) {
              // Clear any active extracted external audio
              setActiveExtractedAudioTrack(null);
              setExtractedAudioUrls((prev) => {
                const copy = { ...prev };
                return copy;
              });
              // Update video src to the new stream URL
              try {
                if (videoRef.current) {
                  videoRef.current.src = stream.url;
                  videoRef.current.load();
                  setCurrentAudioTrack(trackId);
                  toast.success('Dub audio switched');
                }
              } catch (e) {
                toast.error('Failed to switch audio stream');
              }
            } else {
              toast.error(stream?.error || 'Failed to request audio-switched stream');
            }
            return;
          }

          // Fallback: use extractAudioTrack when not a torrent stream
          if (!runtime?.extractAudioTrack) {
            toast.error('Audio extraction runtime unavailable');
            return;
          }

          const existing = extractedAudioUrls[trackId];
          if (existing) {
            setCurrentAudioTrack(trackId);
            setActiveExtractedAudioTrack(trackId);
            toast.success('Dub audio switched');
            return;
          }

          toast.loading('Extracting dub audio...');
          let probeUrl = currentSource?.url || '';
          if (videoRef.current?.src) probeUrl = videoRef.current.src;

          // Prefer local torrent file path for reliable extraction while torrenting.
          try {
            if (sessionId && runtime?.getTorrentFilePath) {
              const pathRes = await runtime.getTorrentFilePath(sessionId);
              if (pathRes?.success && pathRes?.path) {
                probeUrl = pathRes.path;
              }
            }
          } catch {
            // fallback to stream URL
          }

          const result = await runtime.extractAudioTrack(probeUrl, trackId);
          toast.dismiss();

          if (result?.success && result?.url) {
            let extractedUrl = String(result.url || '').trim();
            if (!/^https?:\/\//i.test(extractedUrl) && !extractedUrl.startsWith('file://') && /^[A-Za-z]:\\|\\\\/.test(extractedUrl)) {
              extractedUrl = convertFileSrc(extractedUrl);
            }

            setExtractedAudioUrls(prev => ({ ...prev, [trackId]: extractedUrl }));
            setCurrentAudioTrack(trackId);
            setActiveExtractedAudioTrack(trackId);
            toast.success('Dub audio loaded');
          } else {
            toast.error(result?.error || 'Failed to extract dub audio');
          }
        } catch (err: any) {
          toast.dismiss();
          toast.error(err?.message || 'Error extracting dub audio');
        }
      })();
      }
    })();
  }, [isNative, currentSource?.url, currentSource?.sourceType, extractedAudioUrls, currentSubtitle, handleSubtitleChange]);

  const handleInternalSubtitleChange = useCallback(async (trackId: number, options?: { silent?: boolean }): Promise<boolean> => {
    if (!currentSource?.url || !isNative) return false;

    const silent = options?.silent === true;
    const toastId = `subtitle-extract-${trackId}`;
    const trackLabel = internalSubtitles.find((subtitleTrack) => subtitleTrack.id === trackId)?.label || 'Internal Sub';
    const cacheKey = `${sourceKey}:${trackId}`;

    const activateSubtitleUrl = (subtitleUrl: string) => {
      const normalizedUrl = String(subtitleUrl || '').trim();
      if (!normalizedUrl) return;

      const available = allRenderedSubtitles;
      const existingIndex = available.findIndex((sub) => String(sub.url || '').trim() === normalizedUrl);

      if (existingIndex >= 0) {
        setCurrentSubtitle(getSubtitleSelectionKey(available[existingIndex], existingIndex));
        return;
      }

      const newSub = {
        lang: 'custom',
        url: normalizedUrl,
        label: trackLabel,
        internalTrackId: trackId,
      };

      setSubtitleBlobs((prev) => ({ ...prev, [normalizedUrl]: normalizedUrl }));
      setCustomSubtitles((prev) => {
        const next = [...prev, newSub];
        setCurrentSubtitle(getSubtitleSelectionKey(newSub, subtitles.length + next.length - 1));
        return next;
      });
    };

    const cachedSubtitle = extractedSubtitleCacheRef.current[cacheKey];
    if (cachedSubtitle) {
      activateSubtitleUrl(cachedSubtitle);
      if (!silent) toast.success(`Subtitle loaded: ${trackLabel}`);
      return true;
    }

    const inFlight = extractedSubtitlePromiseRef.current.get(cacheKey);
    if (inFlight) {
      const resolved = await inFlight;
      if (resolved?.usableUrl) {
        activateSubtitleUrl(resolved.usableUrl);
        if (!silent) toast.success(`Subtitle loaded: ${trackLabel}`);
        return true;
      } else if (!silent) {
        toast.error('Failed to extract subtitle');
      }
      return false;
    }

    try {
      if (!silent) toast.loading('Extracting subtitle...', { id: toastId });
      const runtime = (window as any).tatakaiRuntime;
      const sessionId = new URLSearchParams(window.location.search).get('sessionId');
      const fileIndex = (window as any).currentFileIndex ?? undefined;

      const extractOnce = async () => {
        let probeUrl = currentSource.url;
        if (videoRef.current?.src) probeUrl = videoRef.current.src;

        // For subtitle extraction, we always prefer the local file path if available.
        // Running ffmpeg on the local sparse file reads zeros instantly for missing parts
        // and extracts available subtitles without blocking on network download.
        try {
          if (sessionId && runtime?.getTorrentFilePath) {
            const pathRes = await runtime.getTorrentFilePath(sessionId);
            if (pathRes?.success && pathRes?.path) {
              probeUrl = pathRes.path;
            }
          }
        } catch {
          // fallback to stream URL
        }

        if (sessionId && runtime?.ensureTorrentPrebuffer) {
          try {
            await runtime.ensureTorrentPrebuffer(sessionId, fileIndex, { requireMetadataTail: false });
          } catch (err) {
            console.warn('Subtitle prebuffer check failed:', err);
          }
        }

        const result = await runtime?.extractSubtitle?.(probeUrl, trackId);
        if (!result?.success || !result.url) return null;

        const rawUrl = String(result.url || '').trim();
        let extractedUrl = rawUrl;
        if (!/^https?:\/\//i.test(extractedUrl) && !extractedUrl.startsWith('file://') && /^[A-Za-z]:\\|\\\\/.test(extractedUrl)) {
          extractedUrl = convertFileSrc(extractedUrl);
        }

        let usableUrl = extractedUrl;
        if (extractedUrl.startsWith('file://')) {
          try {
            const fileResult = await runtime?.readLocalFile?.(extractedUrl);
            if (fileResult?.success && fileResult?.url) {
              usableUrl = fileResult.url;
            }
          } catch (err) {
            console.warn('Failed to convert file:// URL to data URL:', err);
          }
        }

        return { usableUrl, extractedUrl, rawUrl };
      };

      const extractionPromise = (async () => {
        let extraction = await extractOnce();
        if (!extraction) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          extraction = await extractOnce();
        }
        return extraction;
      })();

      extractedSubtitlePromiseRef.current.set(cacheKey, extractionPromise);
      const extracted = await extractionPromise;
      extractedSubtitlePromiseRef.current.delete(cacheKey);

      if (extracted?.usableUrl) {
        extractedSubtitleCacheRef.current[cacheKey] = extracted.usableUrl;
        setSubtitleBlobs((prev) => ({
          ...prev,
          [extracted.rawUrl]: extracted.usableUrl,
          [extracted.extractedUrl]: extracted.usableUrl,
          [extracted.usableUrl]: extracted.usableUrl,
        }));
        activateSubtitleUrl(extracted.usableUrl);

        if (!silent) {
          toast.dismiss(toastId);
          toast.success(`Subtitle loaded: ${trackLabel}`);
        }
        return true;
      } else if (!silent) {
        toast.dismiss(toastId);
        toast.error('Failed to extract subtitle');
      }
      return false;
    } catch (err) {
      if (!silent) {
        toast.dismiss(toastId);
        toast.error('Error extracting subtitle');
      }
      return false;
    } finally {
      extractedSubtitlePromiseRef.current.delete(cacheKey);
    }
  }, [currentSource?.url, isNative, internalSubtitles, allRenderedSubtitles, subtitles.length, sourceKey]);

  useEffect(() => {
    if (!isNative || !currentSource?.url) return;
    if (settings.subtitleLanguage === 'off') return;
    if (subtitles.length > 0 || customSubtitles.length > 0) return;
    if (internalSubtitles.length === 0) return;

    const preferredTrack = getPreferredInternalSubtitleTrack(internalSubtitles, settings.subtitleLanguage);
    if (!preferredTrack) return;

    const autoLoadKey = `${sourceKey}:${preferredTrack.id}:${settings.subtitleLanguage}`;
    if (autoLoadedInternalSubtitleRef.current === autoLoadKey) return;
    autoLoadedInternalSubtitleRef.current = autoLoadKey;

    void handleInternalSubtitleChange(preferredTrack.id, { silent: true }).then((success) => {
      if (!success) {
        // Clear reference to allow retrying on the next render/progress update
        if (autoLoadedInternalSubtitleRef.current === autoLoadKey) {
          autoLoadedInternalSubtitleRef.current = '';
        }
      }
    });
  }, [
    isNative,
    currentSource?.url,
    settings.subtitleLanguage,
    subtitles.length,
    customSubtitles.length,
    internalSubtitles,
    sourceKey,
    handleInternalSubtitleChange,
  ]);

  // Sync extracted external audio with video timeline for dub track fallback.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const audioUrl = activeExtractedAudioTrack != null ? extractedAudioUrls[activeExtractedAudioTrack] : undefined;
    if (!audioUrl) {
      if (externalAudioRef.current) {
        externalAudioRef.current.pause();
        externalAudioRef.current.src = '';
      }
      return;
    }

    const audio = externalAudioRef.current || new Audio();
    externalAudioRef.current = audio;
    audio.preload = 'auto';

    if (audio.src !== audioUrl) {
      audio.src = audioUrl;
      audio.load();
    }

    const syncVolume = () => {
      audio.volume = isMuted ? 0 : volume;
      // Mute original audio when external dub track is active.
      video.muted = true;
    };

    const syncTime = () => {
      if (!Number.isFinite(video.currentTime)) return;
      const drift = Math.abs((audio.currentTime || 0) - video.currentTime);
      if (drift > 0.35) {
        try {
          audio.currentTime = video.currentTime;
        } catch {
          // Ignore transient seek errors while buffering.
        }
      }
    };

    const onPlay = () => {
      syncVolume();
      audio.playbackRate = video.playbackRate || 1;
      syncTime();
      void audio.play().catch(() => {});
    };
    const onPause = () => audio.pause();
    const onSeeked = () => syncTime();
    const onRateChange = () => {
      audio.playbackRate = video.playbackRate || 1;
    };

    syncVolume();
    if (!video.paused) onPlay();

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('ratechange', onRateChange);

    const driftTimer = window.setInterval(syncTime, 1000);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('ratechange', onRateChange);
      window.clearInterval(driftTimer);
      // Restore video audio if no external extracted track is active.
      if (activeExtractedAudioTrack == null) {
        video.muted = isMuted;
      }
    };
  }, [activeExtractedAudioTrack, extractedAudioUrls, isMuted, volume]);

  // Handle progress updates in a separate effect to avoid reload loops
  useEffect(() => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    
    progressIntervalRef.current = window.setInterval(() => {
      if (videoRef.current && isPlaying) {
        const time = videoRef.current.currentTime;
        setCurrentTime(time);
        if (progressCallbackRef.current) {
          progressCallbackRef.current(time, videoRef.current.duration || 0);
        }

        const sessionId = new URLSearchParams(window.location.search).get('sessionId');
        const isTorrentSource = Boolean(sessionId && (currentSource?.sourceType === 'torrent' || currentSource?.url?.startsWith('magnet:')));
        if (isNative && isTorrentSource && (window as any).tatakaiRuntime?.updateTorrentPlayback) {
          const now = Date.now();
          if (now - torrentPlaybackUpdateRef.current >= 1500) {
            torrentPlaybackUpdateRef.current = now;
            (window as any).tatakaiRuntime.updateTorrentPlayback(
              sessionId,
              time,
              videoRef.current.duration || 0,
            );
          }
        }
      }
    }, 1000);

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [isPlaying, isNative, currentSource?.url, currentSource?.sourceType]); // Only re-run when playing state changes

  useEffect(() => {
    const bus = playbackEventBus;
    const unsubs = [
      bus.on(PlayerEvents.PLAY, () => setIsPlaying(true)),
      bus.on(PlayerEvents.PAUSE, () => setIsPlaying(false)),
      bus.on(PlayerEvents.TIME_UPDATE, (t) => setCurrentTime(t)),
      bus.on(PlayerEvents.DURATION_CHANGE, (d) => setDuration(d)),
      bus.on(PlayerEvents.BUFFERING, (b) => setIsBuffering(b)),
      bus.on(PlayerEvents.LOADED, () => setIsBuffering(false)),
      bus.on(PlayerEvents.ERROR, (e) => setVideoError(String(e))),
    ];

    return () => unsubs.forEach(unsub => unsub());
  }, []);

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
      // Ensure loading state is cleared when video starts playing
      if (isLoading) {
         // We can't change props, but we can ensure our local buffering state is off
      }
      // Trigger media probe when video starts playing if tracks haven't been found yet
      if (audioTracks.length === 0 && internalSubtitles.length === 0) {
        triggerMediaProbe();
      }
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
      let failureReason = 'native-video-error';
      let friendlyMessage: string | null = null;
      const eventMessageRaw = String(e?.message || e?.target?.error?.message || '').trim();
      const eventMessage = eventMessageRaw.toLowerCase();
      const code = Number(err?.code || 0);
      const rawMessage = String(err?.message || 'Unknown error');
      const normalizedMessage = rawMessage.toLowerCase();
      const compositeMessage = `${normalizedMessage} ${eventMessage}`;

      // For torrents, suppress initial format/decode errors while the file is still buffering
      const isTorrent = currentSource?.url?.startsWith('magnet:') || currentSource?.sourceType === 'torrent';
      const inTorrentStartupGrace = isTorrent && Date.now() < torrentStartupGraceUntilRef.current;
      if ((isTorrent && !initialSeekDoneRef.current) || (inTorrentStartupGrace && (code === 4 || isTransientTorrentStartupError(compositeMessage)))) {
        console.warn('[VideoPlayer] Suppressing early torrent error:', eventMessage);
        setIsBuffering(true);
        return;
      }

      if (err) {
        console.error('Video Error Code:', err.code, err.message);

        if (
          code === 4 &&
          (
            compositeMessage.includes('decoder_error_not_supported') ||
            compositeMessage.includes('pipelinestatus::decoder_error_not_supported') ||
            compositeMessage.includes('unsupportedconfig') ||
            compositeMessage.includes('unsupported config') ||
            compositeMessage.includes('kunsupportedconfig') ||
            compositeMessage.includes('audio decoder initialization failed')
          )
        ) {
          failureReason = 'native-decoder-unsupported-config';
          friendlyMessage = 'Audio codec is not supported for this source. Auto-switching source...';
        } else if (code === 4) {
          failureReason = 'native-playback-not-supported';
          if (compositeMessage.includes('unsupported') || compositeMessage.includes('not supported')) {
            friendlyMessage = 'Playback format is not supported for this source. Auto-switching source...';
          }
        } else if (code === 3 || compositeMessage.includes('decode')) {
          failureReason = 'native-decode-error';
        }

        setVideoError(friendlyMessage || `Playback Error (${code}): ${rawMessage}`);
        if (onError) onError({ statusCode: code || undefined, reason: failureReason });
      } else {
        if (
          eventMessage.includes('decoder_error_not_supported') ||
          eventMessage.includes('kunsupportedconfig') ||
          eventMessage.includes('audio decoder initialization failed')
        ) {
          failureReason = 'native-decoder-unsupported-config';
          friendlyMessage = 'Audio codec is not supported for this source. Auto-switching source...';
        }

        setVideoError(friendlyMessage || 'Playback failed');
        if (onError) onError({ reason: failureReason });
      }
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

  }, [settings.autoNextEpisode, onEpisodeEnd, onPlay, onPause, onProgressUpdate, onError]);

  useEffect(() => {
    if (bufferingTimeoutRef.current !== null) {
      clearTimeout(bufferingTimeoutRef.current);
      bufferingTimeoutRef.current = null;
    }

    if (!isBuffering || !currentSource?.url) return;

    // Skip timeout logic for torrents as they can be slow to start/buffer
    // We handle this inside the timeout now to keep isBuffering consistent

    bufferingTimeoutRef.current = window.setTimeout(() => {
      const stalledMs = Date.now() - lastProgressAtRef.current;
      if (stalledMs >= 15000) {
        // Only switch for non-torrent sources
        const isTorrent = currentSource?.url?.startsWith('magnet:') || currentSource?.sourceType === 'torrent';
        if (!isTorrent) {
          setVideoError("Server timed out. Auto-switching server in 3 seconds...");
          if (onError) onError({ reason: 'buffer-stall-timeout' });
        } else {
          // For torrents, just ensure buffering circle stays visible
          setIsBuffering(true);
        }
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

          if (timelineSeekingLockedRef.current) {
            toast.info(timelineLockReasonRef.current || 'Seeking is temporarily locked.', {
              id: 'torrent-timeline-locked',
            });
            break;
          }

          skip(-10);

          break;

        case "arrowright":

          e.preventDefault();

          if (timelineSeekingLockedRef.current) {
            toast.info(timelineLockReasonRef.current || 'Seeking is temporarily locked.', {
              id: 'torrent-timeline-locked',
            });
            break;
          }

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

    if (timelineSeekingLockedRef.current) {
      showTimelineLockHint();
      return;
    }

    if (videoRef.current) {

      videoRef.current.currentTime = Math.max(

        0,

        Math.min(duration, currentTime + seconds)

      );

    }

  };



  const handleProgressBarHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isLive || timelineSeekingLocked) return;
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

    if (timelineSeekingLockedRef.current) {
      showTimelineLockHint();
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;

    const percent = (clientX - rect.left) / rect.width;

    const newTime = Math.max(0, Math.min(duration, percent * duration));

    if (videoRef.current) {

      const sessionId = new URLSearchParams(window.location.search).get('sessionId');
      const isTorrentSource = Boolean(sessionId && (currentSource?.sourceType === 'torrent' || currentSource?.url?.startsWith('magnet:')));

      if (isTorrentSource && (window as any).tatakaiRuntime?.getTorrentStreamUrl) {
        void (async () => {
          try {
            const runtime = (window as any).tatakaiRuntime;
            const currentVideo = videoRef.current;
            const wasPaused = currentVideo.paused;
            const playbackRate = currentVideo.playbackRate || 1;

            const stream = await runtime.getTorrentStreamUrl(sessionId, (window as any).currentFileIndex ?? undefined, {
              audioTrackIndex: currentAudioTrack,
              startTime: newTime,
            });

            if (!stream?.success || !stream.url) {
              throw new Error(stream?.error || 'Failed to seek torrent stream');
            }

            const onLoadedMetadata = () => {
              try {
                currentVideo.playbackRate = playbackRate;
                currentVideo.muted = false;
                handleSubtitleChange(currentSubtitle);
                if (!wasPaused) {
                  void currentVideo.play().catch(() => {});
                }
              } finally {
                currentVideo.removeEventListener('loadedmetadata', onLoadedMetadata);
              }
            };

            currentVideo.addEventListener('loadedmetadata', onLoadedMetadata);
            currentVideo.src = stream.url;
            currentVideo.load();
            setCurrentTime(newTime);
          } catch (err) {
            console.error('Torrent seek failed:', err);
            toast.error('Could not seek torrent stream');
          }
        })();
        return;
      }

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
        autoPiPDismissedRef.current = true;
        await document.exitPictureInPicture();
      } else if ((document as any).pictureInPictureEnabled !== false) {
        autoPiPDismissedRef.current = false;
        pipRequestInFlightRef.current = true;
        await videoRef.current.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('PiP not supported', e);
    } finally {
      pipRequestInFlightRef.current = false;
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
    const onEnter = () => {
      setIsPiP(true);
    };
    const onLeave = () => {
      setIsPiP(false);
      if (document.visibilityState === 'hidden' && !pipRequestInFlightRef.current) {
        autoPiPDismissedRef.current = true;
      }
    };
    video.addEventListener('enterpictureinpicture', onEnter);
    video.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnter);
      video.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, []);

  useEffect(() => {
    const canUsePiP = () => (
      !isMobile &&
      typeof document !== 'undefined' &&
      'pictureInPictureEnabled' in document &&
      (document as any).pictureInPictureEnabled !== false
    );

    const handleVisibilityChange = () => {
      const video = videoRef.current;
      if (!video || !canUsePiP()) return;

      if (
        document.visibilityState === 'hidden' &&
        !video.paused &&
        !video.ended &&
        !document.pictureInPictureElement &&
        !autoPiPDismissedRef.current
      ) {
        pipRequestInFlightRef.current = true;
        video.requestPictureInPicture()
          .catch(() => {
            autoPiPDismissedRef.current = true;
          })
          .finally(() => {
            pipRequestInFlightRef.current = false;
          });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleVisibilityChange);
    };
  }, [isMobile]);

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;

    const isElectron = typeof window !== 'undefined' && !!(window as any).electron?.setFullscreen;

    if (!isFullscreen) {
      if (isElectron) {
        // Use CSS class to make player fill the window,
        // AND use OS fullscreen via IPC (hides taskbar, titlebar disappears via CSS)
        container.classList.add('is-player-fullscreen');
        setIsFullscreen(true);
        try {
          await (window as any).electron.setFullscreen(true);
          // Signal global fullscreen — TitleBar and Sidebar will hide themselves
          document.documentElement.classList.add('app-fullscreen');
        } catch {
          // CSS fullscreen still works even if IPC fails
        }
      } else {
        // Browser: use native Fullscreen API
        try {
          if (container.requestFullscreen) {
            await container.requestFullscreen();
          } else if ((container as any).webkitRequestFullscreen) {
            await Promise.resolve((container as any).webkitRequestFullscreen());
          } else {
            container.classList.add('is-player-fullscreen');
            setIsFullscreen(true);
          }
        } catch {
          container.classList.add('is-player-fullscreen');
          setIsFullscreen(true);
        }
      }

      await lockLandscapeOnMobile();

    } else {
      // Exit fullscreen
      container.classList.remove('is-player-fullscreen');
      setIsFullscreen(false);

      if (isElectron) {
        document.documentElement.classList.remove('app-fullscreen');
        try {
          await (window as any).electron.setFullscreen(false);
        } catch {
          // Ignore
        }
      } else {
        try {
          if (document.fullscreenElement && document.exitFullscreen) {
            await document.exitFullscreen();
          } else if ((document as any).webkitFullscreenElement && (document as any).webkitExitFullscreen) {
            await Promise.resolve((document as any).webkitExitFullscreen());
          }
        } catch {
          // Ignore exit errors
        }
      }

      unlockOrientationOnMobile();
    }
  };

  // Keep native subtitle positioning aligned to the real control overlay height.
  useEffect(() => {
    const container = containerRef.current;
    const overlay = controlsOverlayRef.current;
    if (!container || !overlay) return;
    if (typeof ResizeObserver === 'undefined') return;

    const apply = () => {
      const h = overlay.getBoundingClientRect().height;
      if (Number.isFinite(h) && h > 0) {
        container.style.setProperty('--tatakai-controls-height', `${Math.round(h)}px`);
      }
    };

    apply();
    const ro = new ResizeObserver(() => apply());
    ro.observe(overlay);
    return () => ro.disconnect();
  }, []);



  useEffect(() => {

    const handleFullscreenChange = () => {

      const activeFullscreen = !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
      setIsFullscreen(activeFullscreen);
      if (!activeFullscreen) {
        // Also clear the CSS class fallback in case it was applied alongside or instead of the Fullscreen API.
        containerRef.current?.classList.remove('is-player-fullscreen');
        unlockOrientationOnMobile();
      }

    };

    // Handle Escape key for the CSS class fallback path (browser won't fire fullscreenchange in this case).
    const handleKeyEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && containerRef.current?.classList.contains('is-player-fullscreen')) {
        containerRef.current.classList.remove('is-player-fullscreen');
        setIsFullscreen(false);
        document.documentElement.classList.remove('app-fullscreen');
        // Exit OS fullscreen in Electron too
        const bridge = (window as any).electron;
        if (bridge?.setFullscreen) {
          void bridge.setFullscreen(false);
        }
        unlockOrientationOnMobile();
      }
    };

    // Handle Electron fullscreen-changed event (e.g. user presses F11 or OS exits fullscreen)
    const handleElectronFullscreenChange = (isFull: boolean) => {
      if (!isFull && containerRef.current?.classList.contains('is-player-fullscreen')) {
        containerRef.current.classList.remove('is-player-fullscreen');
        document.documentElement.classList.remove('app-fullscreen');
        setIsFullscreen(false);
        unlockOrientationOnMobile();
      }
    };
    const unsubFullscreen = (window as any).electron?.onFullscreenChanged?.(handleElectronFullscreenChange);

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    document.addEventListener("keydown", handleKeyEscape);

    return () => {

      document.removeEventListener("fullscreenchange", handleFullscreenChange);

      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);

      document.removeEventListener("keydown", handleKeyEscape);
      unsubFullscreen?.();

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

  const secondarySubtitleActiveText = useMemo(() => {
    if (!currentSecondarySubtitle || currentSecondarySubtitle === 'off') return '';
    if (!secondarySubtitleCues || secondarySubtitleCues.length === 0) return '';
    const t = Number(currentTime || 0);
    const active = secondarySubtitleCues.filter((cue) => t >= cue.start && t < cue.end);
    return active.map((cue) => cue.text).join('\n').trim();
  }, [currentSecondarySubtitle, secondarySubtitleCues, currentTime]);



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

        {allRenderedSubtitles.map((sub, idx) => {
          const subtitleKey = getSubtitleSelectionKey(sub, idx);
          const subtitleSourceUrl = String(sub.url || '').trim();
          if (!subtitleSourceUrl) return null;
          const blobUrl = subtitleBlobs[subtitleSourceUrl];
          // For custom subs, the URL is already local/user-selected.
          // For provider subs, prefer prefetched blob, then proxy URL, then original URL.
          const proxiedUrl = !isOffline
            ? getProxiedSubtitleUrl(subtitleSourceUrl, subtitleReferer)
            : subtitleSourceUrl;
          const src = sub.lang === 'custom'
            ? subtitleSourceUrl
            : (blobUrl || proxiedUrl || subtitleSourceUrl);

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

      {torrentSessionId && torrentStats ? (
        <TorrentStatusPanel
          sessionId={torrentSessionId}
          stats={torrentStats}
          buffering={isBuffering}
          onRepair={onTorrentRepair}
          onStop={onTorrentStop}
          onOpenFolder={async () => {
            try {
              const rt = (window as any).tatakaiRuntime;
              const ep = (window as any).electron;
              if (!rt?.getTorrentFilePath || !ep?.openPath) return;
              const res = await rt.getTorrentFilePath(torrentSessionId);
              if (res?.success && res?.path) {
                await ep.openPath(res.path);
              }
            } catch {
              // ignore
            }
          }}
          className={
            showControls
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 -translate-y-4 pointer-events-none"
          }
        />
      ) : null}

      {/* Secondary subtitle overlay (dual subs) */}
      {secondarySubtitleActiveText ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 md:bottom-32 px-6 z-20 flex justify-center">
          <div className="max-w-[92%] text-center text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-pre-line text-base md:text-lg font-semibold">
            {secondarySubtitleActiveText}
          </div>
        </div>
      ) : null}



      {/* View Counter Overlay - shows in top right */}

      {viewCount !== undefined && viewCount > 0 && showControls && (

        <div className="absolute top-3 right-3 md:top-4 md:right-4 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/70 backdrop-blur-md text-white/90 text-xs md:text-sm font-medium z-10 transition-all duration-300 border border-white/10">

          <Eye className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary" />

          <span className="font-semibold">{viewCount >= 1000 ? `${(viewCount / 1000).toFixed(1)}K` : viewCount}</span>

          <span className="text-white/50 hidden sm:inline">views</span>

        </div>

      )}



      {/* Loading State */}

      {((isLoading && !isPlaying) || isBuffering) && !videoError && (

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

              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center gap-2 transition-all font-medium video-controls-btn"
              >
                <RotateCcw className="w-4 h-4" />
                Refresh Player
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

          className={`absolute bottom-24 md:bottom-28 right-4 md:right-6 px-5 py-3 md:px-6 md:py-3.5 rounded-xl bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white font-bold flex items-center gap-2.5 shadow-2xl transition-all animate-in slide-in-from-right-5 z-20 skip-button-glow border border-white/20 ${timelineSeekingLocked ? 'cursor-not-allowed opacity-60' : 'hover:scale-105'}`}

        >

          <FastForward className="w-5 h-5 md:w-6 md:h-6" />

          <span className="text-sm md:text-base uppercase tracking-wide">{getSkipLabel(activeSkip.skipType)}</span>

        </button>

      )}



      {/* Controls Overlay */}

      <div

        ref={controlsOverlayRef}
        className={`absolute inset-x-0 bottom-0 video-controls-gradient p-4 md:p-5 transition-all duration-300 ${showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"

          }`}

      >

        {/* Progress Bar */}
        {!timelineUiHidden && (
        <div

          className={`relative h-1 md:h-1.5 bg-white/20 rounded-full group/progress mb-4 md:mb-5 video-progress-track ${isLive ? 'cursor-default pointer-events-none' : timelineSeekingLocked ? 'cursor-not-allowed opacity-85' : 'cursor-pointer'}`}

          onClick={!isLive ? (timelineSeekingLocked ? showTimelineLockHint : handleSeek) : undefined}

          onTouchMove={!isLive && !timelineSeekingLocked ? handleSeek : undefined}

          onMouseMove={!isLive && !timelineSeekingLocked ? handleProgressBarHover : undefined}

          onMouseLeave={!isLive ? handleProgressBarLeave : undefined}

        >

          {/* Hover Time Tooltip */}

          {showHoverTime && !isLive && !timelineSeekingLocked && (

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

          {!isLive && !timelineSeekingLocked && (

            <div

              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-all z-30 ring-2 ring-primary/50"

              style={{ left: `calc(${progress}% - 8px)` }}

            />

          )}

          {timelineSeekingLocked && (
            <div className="absolute right-0 bottom-full mb-2 hidden items-center gap-1.5 rounded-full border border-white/10 bg-black/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/75 shadow-xl backdrop-blur-md sm:flex">
              <Lock className="h-3 w-3 text-primary" />
              <span>Seeking locked</span>
            </div>
          )}

        </div>
        )}



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

            <button
              onClick={handleRefresh}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all video-controls-btn group"
              title="Refresh stream"
            >
              <RotateCcw className="w-4 h-4 md:w-5 md:h-5 group-active:-rotate-180 transition-transform duration-500" />
            </button>

            {!isLive && !timelineUiHidden && (

              <>

                <button

                  onClick={() => skip(-10)}
                  disabled={timelineSeekingLocked}

                  className={`p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all hidden sm:flex video-controls-btn ${timelineSeekingLocked ? 'cursor-not-allowed opacity-50 hover:bg-white/10' : ''}`}

                >

                  <SkipBack className="w-4 h-4 md:w-5 md:h-5" />

                </button>



                <button

                  onClick={() => skip(10)}
                  disabled={timelineSeekingLocked}

                  className={`p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all hidden sm:flex video-controls-btn ${timelineSeekingLocked ? 'cursor-not-allowed opacity-50 hover:bg-white/10' : ''}`}

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

            {!timelineUiHidden && (
            <div className="flex items-center gap-1.5 ml-2 px-2.5 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm">

              <span className="text-xs md:text-sm font-medium text-white/90">{formatTime(currentTime)}</span>

              <span className="text-white/40">/</span>

              <span className="text-xs md:text-sm text-white/60">{formatTime(duration)}</span>

            </div>
            )}

          </div>



          {/* Right Controls */}

          <div className="flex items-center gap-1 md:gap-2">

            {/* Subtitle Selector */}
            {(subtitles.length > 0 || customSubtitles.length > 0 || internalSubtitles.length > 0) && (
              <div className="relative">
                <button
                  onClick={() => {
                    setShowSubtitleMenu(!showSubtitleMenu);
                    setShowAudioMenu(false);
                    setShowSettings(false);
                  }}
                  className={`p-2 rounded-lg hover:bg-white/10 transition-colors pointer-events-auto ${currentSubtitle !== 'off' ? 'text-primary' : ''
                    }`}
                  title="Subtitles"
                >
                  <Subtitles className="w-4 h-4 md:w-5 md:h-5" />
                </button>

                {showSubtitleMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-background/95 backdrop-blur-md border border-border rounded-xl p-3 min-w-[180px] md:min-w-[220px] max-h-[450px] overflow-y-auto pointer-events-auto shadow-2xl">
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                      Subtitles
                    </div>
                    <div className="space-y-1 mb-3">
                      <button
                        onClick={() => {
                          handleSubtitleChange('off');
                          setShowSubtitleMenu(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors ${currentSubtitle === 'off'
                          ? "text-primary font-medium bg-primary/10"
                          : "text-foreground"
                          }`}
                      >
                        Off
                      </button>
                      {internalSubtitles.length > 0 && (
                        <div className="pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Internal Tracks
                        </div>
                      )}
                      {internalSubtitles.map((sub) => {
                        const isSelected = currentInternalSubtitleTrackId === sub.id;
                        return (
                        <button
                          key={sub.id}
                          onClick={() => {
                            void handleInternalSubtitleChange(sub.id);
                            setShowSubtitleMenu(false);
                          }}
                          className={`w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors ${isSelected
                            ? "text-primary font-medium bg-primary/10"
                            : "text-foreground"
                            }`}
                        >
                          <span className="truncate block max-w-[150px]">{sub.label || sub.lang}</span>
                        </button>
                        );
                      })}
                      {visibleSubtitleOptions.map(({ sub, index }) => {
                        const subtitleSelectionKey = getSubtitleSelectionKey(sub, index);
                        const isSelected = currentSubtitle === subtitleSelectionKey;
                        return (
                          <button
                            key={subtitleSelectionKey}
                            onClick={() => {
                              handleSubtitleChange(subtitleSelectionKey);
                              setShowSubtitleMenu(false);
                            }}
                            className={`w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors ${isSelected
                              ? "text-primary font-medium bg-primary/10"
                              : "text-foreground"
                              }`}
                          >
                            <span className="truncate block max-w-[150px]">{sub.label || sub.lang}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="h-px bg-border my-2" />

                    {/* Subtitle Style Options */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        <Type className="w-3 h-3" />
                        <span>Style Settings</span>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">Size</span>
                          <div className="flex gap-1">
                            {SIZE_OPTIONS.map(opt => (
                              <button
                                key={opt.value}
                                onClick={() => updateSetting('subtitleSize', opt.value)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${settings.subtitleSize === opt.value
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50'
                                  }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">Font</span>
                          <div className="flex gap-1">
                            {FONT_OPTIONS.map(opt => (
                              <button
                                key={opt.value}
                                onClick={() => updateSetting('subtitleFont', opt.value)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${settings.subtitleFont === opt.value
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50'
                                  }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">BG</span>
                          <div className="flex gap-1">
                            {BG_OPTIONS.map(opt => (
                              <button
                                key={opt.value}
                                onClick={() => updateSetting('subtitleBackground', opt.value)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${settings.subtitleBackground === opt.value
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50'
                                  }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="h-px bg-border my-2" />

                    <label className="w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors text-foreground flex items-center gap-2 cursor-pointer group">
                      <Upload className="w-3 h-3 group-hover:text-primary transition-colors" />
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

            {/* Audio Selector (Multi-track) */}
            {(audioTracks.length > 0) && (
              <div className="relative">
                <button
                  onClick={() => {
                    setShowAudioMenu(!showAudioMenu);
                    setShowSubtitleMenu(false);
                    setShowSettings(false);
                  }}
                  className={`p-2 rounded-lg hover:bg-white/10 transition-colors pointer-events-auto ${audioTracks.length > 1 ? 'text-primary' : ''}`}
                  title="Audio Tracks"
                >
                  <Mic className="w-4 h-4 md:w-5 md:h-5" />
                </button>

                {showAudioMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-background/95 backdrop-blur-sm border border-border rounded-xl p-3 min-w-[150px] md:min-w-[180px] max-h-[300px] overflow-y-auto pointer-events-auto shadow-2xl">
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                      Audio Tracks
                    </div>
                    <div className="space-y-1">
                      {audioTracks.map((track) => (
                        <button
                          key={track.id}
                          onClick={() => {
                            handleAudioTrackChange(track.id);
                            setShowAudioMenu(false);
                          }}
                          className={`w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors ${currentAudioTrack === track.id
                            ? "text-primary font-medium bg-primary/10"
                            : "text-foreground"
                            }`}
                        >
                          <span className="truncate block">{track.label || `Track ${track.id}`} ({track.lang || 'und'})</span>
                        </button>
                      ))}
                    </div>
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
                  setShowAudioMenu(false);
                }}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                title="Playback Speed"
              >
                <Settings className="w-4 h-4 md:w-5 md:h-5" />
              </button>

              {showSettings && (
                <div className="absolute bottom-full right-0 mb-2 bg-background/95 backdrop-blur-sm border border-border rounded-xl p-2 min-w-[100px] md:min-w-[120px] shadow-2xl">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-2 py-1 mb-1">
                    Speed
                  </div>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => handlePlaybackRateChange(rate)}
                      className={`w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors ${playbackRate === rate
                        ? "text-primary font-medium bg-primary/10"
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



            {/* Download management removed during V6 rebuild (will be reintroduced with new core). */}



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

            {/* External Player Button */}
            {isNative && externalPlayerPath && (
              <button
                onClick={handleLaunchExternal}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-blue-400"
                title="Play in External Player"
              >
                <MonitorPlay className="w-4 h-4 md:w-5 md:h-5" />
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
        availableSubtitles={visibleSubtitleOptions.map(({ sub, index }) => ({
          lang: sub.lang,
          label: sub.label || sub.lang,
          value: getSubtitleSelectionKey(sub, index),
        }))}
        audioTracks={audioTracks}
        currentAudioTrack={currentAudioTrack}
        onAudioTrackChange={handleAudioTrackChange}
        internalSubtitles={internalSubtitles}
        currentInternalSubtitleTrackId={currentInternalSubtitleTrackId}
        onInternalSubtitleChange={handleInternalSubtitleChange}
      />

    </div >

  );

}
