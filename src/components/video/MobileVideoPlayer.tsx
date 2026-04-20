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
  Download,
  Rewind,
  FastForward,
  Camera,
} from "lucide-react";
import Hls from "hls.js";
import { toast } from "sonner";
import { useVideoSettings } from "@/hooks/useVideoSettings";
import { useAniskip } from "@/hooks/useAniskip";
import { getProxiedImageUrl, getProxiedVideoUrl, getProxiedSubtitleUrl, trackEvent } from "@/lib/api";
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { useMobileDownload } from "@/hooks/useMobileDownload";
import { cn } from "@/lib/utils";

interface MobileVideoPlayerProps {
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
  onProgressUpdate?: (progressSeconds: number, durationSeconds?: number, completed?: boolean) => void;
  animeId?: string;
  animeName?: string;
  animePoster?: string;
  episodeId?: string;
  onBack?: () => void;
  episodeTitle?: string;
  isOffline?: boolean;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getSubtitleSelectionKey(subtitle: { lang: string; url: string; label?: string }, index: number): string {
  const baseKey = subtitle.url || subtitle.label || subtitle.lang || `subtitle-${index}`;
  return `${subtitle.lang === 'custom' ? 'custom' : 'sub'}:${baseKey}`;
}

function normalizeSubtitleToVtt(rawText: string): string {
  const text = String(rawText || '');
  const trimmed = text.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('WEBVTT')) {
    return text;
  }

  if (/^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed)) {
    return '';
  }

  if (trimmed.includes('-->')) {
    const withNormalizedTimestamps = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return withNormalizedTimestamps.includes('WEBVTT')
      ? withNormalizedTimestamps
      : `WEBVTT\n\n${withNormalizedTimestamps}`;
  }

  return `WEBVTT\n\n00:00:00.000 --> 99:59:59.000\n${text}`;
}

function buildSubtitleFetchCandidates(subtitleUrl: string, referer?: string, offline?: boolean): string[] {
  const candidates: string[] = [];
  const addCandidate = (value?: string) => {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  addCandidate(subtitleUrl);
  if (!offline) {
    addCandidate(getProxiedSubtitleUrl(subtitleUrl, referer));
  }

  return candidates;
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

type SkipSegment = {
  startTime: number;
  endTime: number;
  type: 'op' | 'ed' | 'mixed-op' | 'mixed-ed' | 'recap';
};

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
  onProgressUpdate,
  animeId,
  animeName,
  animePoster,
  episodeId,
  onBack,
  episodeTitle,
  isOffline,
}: MobileVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const { settings } = useVideoSettings();
  const { skipTimes, fetchSkipTimes } = useAniskip();
  const { startDownload, queue } = useMobileDownload();

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

  const resolvedPoster = poster ? getProxiedImageUrl(poster) : undefined;

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
  const [currentSubtitle, setCurrentSubtitle] = useState<string>(settings.subtitleLanguage);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [activeSkip, setActiveSkip] = useState<SkipSegment | null>(null);
  const [playbackRate, setPlaybackRate] = useState(settings.playbackSpeed);
  const [subtitleBlobs, setSubtitleBlobs] = useState<Record<string, string>>({});
  
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
    () => selectPreferredSource(sources, settings.defaultQuality),
    [sources, settings.defaultQuality],
  );
  const sourceUrlKey = currentSource?.url || '';
  const sourceTypeKey = currentSource?.isM3U8 ? 'm3u8' : 'file';
  const playbackReferer = headers?.Referer || '';
  const playbackUserAgent = headers?.["User-Agent"] || '';
  const autoSkippedWindowRef = useRef<string | null>(null);

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
            const label = `${sub.lang || ''} ${sub.label || ''}`.toLowerCase();
            return label.includes('english') || label === 'en';
          });
          selectedIndex = englishIndex >= 0 ? englishIndex : 0;
        } else {
          selectedIndex = subtitles.findIndex((sub, idx) => getSubtitleSelectionKey(sub, idx) === currentSubtitle);

          if (selectedIndex < 0) {
            const key = currentSubtitle.toLowerCase();
            selectedIndex = subtitles.findIndex((sub) => {
              const label = `${sub.lang || ''} ${sub.label || ''}`.toLowerCase();
              if (key === 'english') return label.includes('english') || label === 'en';
              if (key === 'spanish') return label.includes('spanish') || label.includes('espanol') || label === 'es';
              if (key === 'french') return label.includes('french') || label === 'fr';
              if (key === 'german') return label.includes('german') || label === 'de';
              if (key === 'japanese') return label.includes('japanese') || label === 'ja';
              if (key === 'portuguese') return label.includes('portuguese') || label === 'pt';
              if (key === 'arabic') return label.includes('arabic') || label === 'ar';
              if (key === 'hindi') return label.includes('hindi') || label === 'hi';
              return false;
            });
          }
        }
      }

      for (let i = 0; i < tracks.length; i += 1) {
        tracks[i].mode = i === selectedIndex ? 'showing' : 'disabled';
      }
    };

    applySubtitleMode();
    video.addEventListener('loadedmetadata', applySubtitleMode);

    return () => {
      video.removeEventListener('loadedmetadata', applySubtitleMode);
    };
  }, [currentSubtitle, subtitles, subtitleBlobs]);

  // Initialize HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentSource?.url) return;

    const source = currentSource;
    const finalUrl = !isOffline && playbackReferer
      ? getProxiedVideoUrl(source.url, playbackReferer, playbackUserAgent || undefined)
      : source.url;

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    let metadataAutoplayHandler: (() => void) | null = null;

    if (source.isM3U8 && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });

      hls.loadSource(finalUrl);
      hls.attachMedia(video);
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (initialSeekSeconds && initialSeekSeconds > 0) {
          video.currentTime = initialSeekSeconds;
        }
        if (settings.autoplay) {
          video.play().catch(console.error);
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (retryCountRef.current < 3) {
            setRetryCount(prev => {
              const next = prev + 1;
              retryCountRef.current = next;
              return next;
            });
            hls.loadSource(finalUrl);
          } else {
            setVideoError("Failed to load video. Please try another server.");
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
      video.src = finalUrl;
      if (initialSeekSeconds && initialSeekSeconds > 0) {
        video.currentTime = initialSeekSeconds;
      }

      if (settings.autoplay) {
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
      // Direct MP4
      video.src = finalUrl;
      if (initialSeekSeconds && initialSeekSeconds > 0) {
        video.currentTime = initialSeekSeconds;
      }

      if (settings.autoplay) {
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

    return () => {
      if (metadataAutoplayHandler) {
        video.removeEventListener('loadedmetadata', metadataAutoplayHandler);
      }

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [sourceUrlKey, sourceTypeKey, initialSeekSeconds, isOffline, playbackReferer, playbackUserAgent, settings.autoplay]);

  // Load subtitles
  useEffect(() => {
    if (!subtitles.length) {
      setSubtitleBlobs({});
      return;
    }

    let mounted = true;
    const createdBlobUrls: string[] = [];

    const loadSubtitles = async () => {
      const blobs: Record<string, string> = {};

      for (let i = 0; i < subtitles.length; i += 1) {
        const sub = subtitles[i];
        const subtitleKey = getSubtitleSelectionKey(sub, i);
        const subtitleSourceUrl = String(sub.url || '').trim();
        if (!subtitleSourceUrl) continue;

        if (subtitleSourceUrl.startsWith('asset://') || subtitleSourceUrl.includes('asset.localhost')) {
          blobs[subtitleKey] = subtitleSourceUrl;
          continue;
        }

        try {
          const candidates = buildSubtitleFetchCandidates(
            subtitleSourceUrl,
            playbackReferer,
            Boolean(isOffline)
          );

          let normalizedText = '';
          for (const candidateUrl of candidates) {
            try {
              const response = await fetch(candidateUrl, {
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
              // Try next subtitle URL candidate.
            }
          }

          if (!normalizedText) {
            console.warn('Failed to load subtitle:', sub.lang, subtitleSourceUrl);
            continue;
          }

          const blob = new Blob([normalizedText], { type: 'text/vtt' });
          const blobUrl = URL.createObjectURL(blob);
          createdBlobUrls.push(blobUrl);
          blobs[subtitleKey] = blobUrl;
        } catch (e) {
          console.warn('Failed to load subtitle:', sub.lang, e);
        }
      }

      if (mounted) {
        setSubtitleBlobs(blobs);
      }
    };

    setSubtitleBlobs({});
    loadSubtitles();

    return () => {
      mounted = false;
      createdBlobUrls.forEach((blobUrl) => {
        URL.revokeObjectURL(blobUrl);
      });
    };
  }, [subtitles, playbackReferer, isOffline]);

  useEffect(() => {
    if (!subtitles.length || currentSubtitle === 'off') return;

    const keys = subtitles.map((sub, idx) => getSubtitleSelectionKey(sub, idx));
    if (keys.includes(currentSubtitle)) return;

    const englishIndex = subtitles.findIndex((sub) => {
      const label = `${sub.lang || ''} ${sub.label || ''}`.toLowerCase();
      return label.includes('english') || label === 'en';
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
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    const handleProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const handleEnded = () => {
      onProgressUpdate?.(video.duration, video.duration, true);
      onEpisodeEnd?.();
    };
    const handleError = () => {
      setVideoError("Error loading video");
      onError?.();
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
  }, [onEpisodeEnd, onProgressUpdate, onError]);

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

  const applyFullscreenStyles = useCallback(() => {
    if (!containerRef.current) return;

    document.body.style.overflow = 'hidden';
    containerRef.current.style.position = 'fixed';
    containerRef.current.style.top = '0';
    containerRef.current.style.left = '0';
    containerRef.current.style.width = '100vw';
    containerRef.current.style.height = '100vh';
    containerRef.current.style.zIndex = '99999';
    containerRef.current.style.backgroundColor = 'black';
  }, []);

  const clearFullscreenStyles = useCallback(() => {
    if (!containerRef.current) return;

    document.body.style.overflow = '';
    containerRef.current.style.position = '';
    containerRef.current.style.top = '';
    containerRef.current.style.left = '';
    containerRef.current.style.width = '';
    containerRef.current.style.height = '';
    containerRef.current.style.zIndex = '';
    containerRef.current.style.backgroundColor = '';
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
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
      if (Capacitor.isNativePlatform()) {
        try {
          await StatusBar.show();
        } catch (e) {
          console.warn('Failed to show status bar:', e);
        }
      }

      await unlockOrientation();
      clearFullscreenStyles();
      setIsFullscreen(false);
    }
  };

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
    
    const now = Date.now();
    const { clientX } = e.changedTouches[0];
    const containerWidth = containerRef.current?.clientWidth || 0;
    const isLeftSide = clientX < containerWidth / 2;
    
    const timeDiff = now - lastTapRef.current.time;
    const isDoubleTap = timeDiff < 300;
    
    if (isDoubleTap) {
      // Clear single tap timeout
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
      
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
    setCurrentSubtitle(lang);
    setShowSubtitleMenu(false);
  };

  // Playback speed change
  const handleSpeedChange = (speed: number) => {
    setPlaybackRate(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSettingsMenu(false);
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

  // Handle download
  const handleDownload = async () => {
    if (!animeId || !episodeId || !animeName) {
      toast.error("Cannot download: missing info");
      return;
    }
    const source = sources[0];
    if (!source) {
      toast.error("No video source available");
      return;
    }
    await startDownload({
      animeId,
      animeTitle: animeName,
      season: 1,
      episode: episodeNumber || 1,
      poster: animePoster || poster || '',
      videoUrl: source.url,
    });
    toast.success("Download started");
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
          <div className="flex gap-4 justify-center">
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 px-6 py-3 bg-primary rounded-xl text-white text-lg"
            >
              <RefreshCw className="w-5 h-5" />
              Retry
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
      className="relative w-full aspect-video bg-black select-none touch-none"
      onTouchEnd={handleTap}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        poster={resolvedPoster}
        playsInline
        crossOrigin="anonymous"
      >
        {/* Subtitles */}
        {subtitles.map((sub, idx) => {
          const subtitleKey = getSubtitleSelectionKey(sub, idx);
          const subtitleSourceUrl = String(sub.url || '').trim();
          if (!subtitleSourceUrl) return null;
          const proxiedSubtitleUrl = !isOffline
            ? getProxiedSubtitleUrl(subtitleSourceUrl, playbackReferer)
            : subtitleSourceUrl;
          return (
          <track
            key={subtitleKey}
            kind="subtitles"
            label={sub.label || sub.lang}
            srcLang={sub.lang}
            src={subtitleBlobs[subtitleKey] || proxiedSubtitleUrl || subtitleSourceUrl}
            default={subtitleKey === currentSubtitle}
          />
        )})}
      </video>

      {/* Loading Overlay */}
      {(isLoading || isBuffering) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Loader2 className="w-16 h-16 text-primary animate-spin" />
        </div>
      )}

      {/* Double-tap Seek Indicator */}
      {doubleTapSide && (
        <div 
          className={cn(
            "absolute top-1/2 -translate-y-1/2 flex flex-col items-center gap-2",
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
        <div className="absolute inset-0 flex items-center justify-center">
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
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90">
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
                {/* Download button */}
                {!isOffline && animeId && (
                  <button
                    onClick={handleDownload}
                    className="p-2.5 rounded-full bg-white/10 backdrop-blur-md active:bg-white/20 border border-white/10"
                  >
                    <Download className="w-5 h-5 text-white" />
                  </button>
                )}
                
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
                {/* Subtitles */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowSubtitleMenu(!showSubtitleMenu);
                      setShowSettingsMenu(false);
                    }}
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
                    <div className="absolute bottom-14 right-0 bg-black/95 backdrop-blur-xl rounded-2xl p-2 min-w-[180px] max-h-[250px] overflow-y-auto border border-white/10 shadow-2xl">
                      <button
                        onClick={() => handleSubtitleChange('off')}
                        className={cn(
                          "w-full px-4 py-3 text-left text-sm rounded-xl transition-colors",
                          currentSubtitle === 'off' ? 'bg-primary text-white font-semibold' : 'text-white/80 hover:bg-white/5'
                        )}
                      >
                        Off
                      </button>
                      {subtitles.map((sub, idx) => {
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

                {/* Settings */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowSettingsMenu(!showSettingsMenu);
                      setShowSubtitleMenu(false);
                    }}
                    className="p-2.5 rounded-full bg-white/10 backdrop-blur-md active:scale-95 transition-transform border border-white/10"
                  >
                    <Settings className="w-5 h-5 text-white" />
                  </button>
                  
                  {showSettingsMenu && (
                    <div className="absolute bottom-14 right-0 bg-black/95 backdrop-blur-xl rounded-2xl p-2 min-w-[160px] border border-white/10 shadow-2xl">
                      <p className="px-4 py-2 text-white/50 text-xs font-semibold uppercase tracking-wide">Playback Speed</p>
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                        <button
                          key={speed}
                          onClick={() => handleSpeedChange(speed)}
                          className={cn(
                            "w-full px-4 py-3 text-left text-sm rounded-xl transition-colors",
                            playbackRate === speed ? 'bg-primary text-white font-semibold' : 'text-white/80 hover:bg-white/5'
                          )}
                        >
                          {speed}x {speed === 1 && '(Normal)'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Server Info Badge */}
      {serverName && showControls && !isLocked && (
        <div className="absolute top-20 right-3 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
          <span className="text-white/80 text-xs font-medium">{serverName}</span>
        </div>
      )}
    </div>
  );
}
