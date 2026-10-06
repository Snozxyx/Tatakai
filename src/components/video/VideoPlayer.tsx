import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Hls from "hls.js";
import { toast } from "sonner";
import { Lock, Maximize, SlidersHorizontal } from "lucide-react";

import { useVideoSettings } from "@/hooks/media/useVideoSettings";
import { useKeybinds } from "@/hooks/media/useKeybinds";
import { useIsNativeApp } from "@/hooks/ui/useIsNativeApp";

import { VideoSettingsPanel } from "./VideoSettingsPanel";
import { useAniskip } from "@/hooks/media/useAniskip";
import { sourceAdapterRegistry } from "@/core/player/SourceAdapterRegistry";
import { registerGlobalVideo, updateGlobalVideoTime } from "@/core/player/global-video-ref";
import { getSubtitleSelectionKey } from "@/core/player/subtitle-utils";
import { getProxiedImageUrl, getProxiedSubtitleUrl } from "@/lib/api";
import { formatTime } from "@/core/player/time-utils";
import { Seekbar } from "./controls/Seekbar";
import { TorrentStatusPanel } from "@/components/torrent/TorrentStatusPanel";

// Hooks
import { useVideoControls } from "./hooks/useVideoControls";
import { useVideoFullscreen } from "./hooks/useVideoFullscreen";
import { useVideoPiP } from "./hooks/useVideoPiP";
import { useVideoKeyboard } from "./hooks/useVideoKeyboard";
import { useControlsVisibility } from "./hooks/useControlsVisibility";
import { useSubtitleManager } from "./hooks/useSubtitleManager";
import { useAudioTrackManager } from "./hooks/useAudioTrackManager";
import { useMediaProbe } from "./hooks/useMediaProbe";
import { useVideoProgress } from "./hooks/useVideoProgress";
import { useActiveCues } from "./hooks/useActiveCues";
import { useStableVolume, useSleepTimer, useAmbientMode } from "./hooks/usePlayerEnhancements";
import { SubtitleOverlay } from "./overlays/SubtitleOverlay";
import { Anime4KRenderer, type Anime4KMode } from "@/lib/video/anime4k/Anime4KRenderer";
import { isDesktop, isMobileNative } from "@/lib/platform/platform";
import { ensureCustomSubtitleFontLoaded } from "@/lib/video/customSubtitleFont";

// Controls
import { PlaybackControls } from "./controls/PlaybackControls";
import { VolumeControl } from "./controls/VolumeControl";
import { TimeDisplay } from "./controls/TimeDisplay";
import { SubtitleSelector } from "./controls/SubtitleSelector";
import { AudioTrackSelector } from "./controls/AudioTrackSelector";
import { SpeedSelector } from "./controls/SpeedSelector";
import { FullscreenButton } from "./controls/FullscreenButton";
import { PiPButton } from "./controls/PiPButton";
import { ScreenshotButton } from "./controls/ScreenshotButton";
import { DownloadButton } from "./controls/DownloadButton";
import { ExternalPlayerButton } from "./controls/ExternalPlayerButton";
import { SkipButton } from "./controls/SkipButton";
import { KeyboardShortcutOverlay } from "./controls/KeyboardShortcutOverlay";

// Overlays
import { LoadingOverlay } from "./overlays/LoadingOverlay";
import { ErrorOverlay } from "./overlays/ErrorOverlay";
import { CenterPlayButton } from "./overlays/CenterPlayButton";
import { ViewCountBadge } from "./overlays/ViewCountBadge";
import { UpNextOverlay } from "./overlays/UpNextOverlay";

// Gestures
import { DoubleTapSeek } from "./gestures/DoubleTapSeek";
import { LongPressSpeed } from "./gestures/LongPressSpeed";

// Types
import type {
  VideoPlayerProps,
  VideoPlayerExtendedProps,
  PlaybackSource,
  CustomSubtitle,
  InternalSubtitleTrack,
  AudioTrack,
  ActiveSkip,
} from "./VideoPlayer.types";

// ---------------------------------------------------------------------------
// Quality selection helper
// ---------------------------------------------------------------------------

function parseQualityScore(quality?: string): number | null {
  const normalized = String(quality || "").toLowerCase();
  const match = normalized.match(/(\d{3,4})\s*p?/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function selectPreferredSource(
  sources: PlaybackSource[],
  preferredQuality: "auto" | "1080p" | "720p" | "480p" | "360p",
) {
  if (!sources.length) return undefined;
  if (preferredQuality === "auto") return sources[0];

  const preferredScore = parseQualityScore(preferredQuality);
  if (!preferredScore) {
    return (
      sources.find(
        (source) => String(source.quality || "").toLowerCase() === preferredQuality,
      ) || sources[0]
    );
  }

  const candidates = sources
    .map((source) => ({ source, score: parseQualityScore(source.quality) }))
    .filter(
      (entry): entry is { source: PlaybackSource; score: number } => entry.score != null,
    )
    .sort((left, right) => {
      const distanceDiff =
        Math.abs(left.score - preferredScore) - Math.abs(right.score - preferredScore);
      if (distanceDiff !== 0) return distanceDiff;
      return right.score - left.score;
    });

  if (candidates.length > 0) return candidates[0].source;
  return (
    sources.find(
      (source) => String(source.quality || "").toLowerCase() === preferredQuality,
    ) || sources[0]
  );
}

function isTransientTorrentStartupError(message: string): boolean {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("demuxer_error_could_not_open") ||
    normalized.includes("open context failed") ||
    normalized.includes("invalid data found when processing input") ||
    normalized.includes("end of file") ||
    normalized.includes("read error") ||
    normalized.includes("duplicate element") ||
    normalized.includes("could not open")
  );
}

// One-time discovery hint: shown after a single click until the user has
// used double-click fullscreen once (desktop only).
const FS_HINT_SEEN_KEY = "tatakai:player:fs-hint-seen";

// Click vs double-click disambiguation window (ms).
const DBL_CLICK_DELAY_MS = 260;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
  onPreviousEpisode,
  onNextEpisode,
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
  timelineLockReason = "Seeking unlocks after the torrent has fully downloaded and verified.",
  hideTimelineUi = false,
  episodeTitle,
  isOffline,
  torrentStats,
  torrentSessionId,
  onTorrentRepair,
  onTorrentStop,
  nextEpisodeTitle,
  nextEpisodeThumbnail,
  nextEpisodeNumber,
}: VideoPlayerProps & VideoPlayerExtendedProps) {
  // ---------------------------------------------------------------------------
  // Refs
  // ---------------------------------------------------------------------------

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsOverlayRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const ambientCanvasRef = useRef<HTMLCanvasElement>(null);
  const anime4kCanvasRef = useRef<HTMLCanvasElement>(null);
  const anime4kRendererRef = useRef<Anime4KRenderer | null>(null);
  // Set when the renderer disables itself (e.g. a CORS-tainted stream WebGL
  // can't sample) so the canvas overlay is hidden and the raw video shows.
  const [anime4kDisabled, setAnime4kDisabled] = useState(false);

  // Auto-next "Up Next" countdown. null = hidden; a number = seconds remaining
  // before onEpisodeEnd() fires. Set on `ended` when Auto Next Episode is on.
  const [upNextCountdown, setUpNextCountdown] = useState<number | null>(null);

  // Sync external ref
  useEffect(() => {
    if (externalRef) {
      externalRef.current = videoRef.current;
    }
  }, [externalRef]);

  // Clear pending click/hint timers on unmount.
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
      if (hintTimeoutRef.current) window.clearTimeout(hintTimeoutRef.current);
    };
  }, []);

  // Register global video for PiP/Miniplayer
  useEffect(() => {
    registerGlobalVideo(videoRef.current, window.location.pathname, {
      animeName: animeName ?? undefined,
      animePoster: poster ?? undefined,
    });
    return () => registerGlobalVideo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Settings & derived state
  // ---------------------------------------------------------------------------

  const { settings, updateSetting } = useVideoSettings();
  const isNative = useIsNativeApp();
  const currentSource = useMemo(
    () => selectPreferredSource(sources, settings.defaultQuality),
    [sources, settings.defaultQuality],
  );

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const currentTimeRef = useRef(0);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(settings.volume);
  const [isMuted, setIsMuted] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(settings.playbackSpeed);
  const [isMobile, setIsMobile] = useState(false);
  const [currentSubtitle, setCurrentSubtitle] = useState<string>(settings.subtitleLanguage);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(0);
  const [extractedAudioUrls, setExtractedAudioUrls] = useState<Record<number, string>>({});
  const [activeExtractedAudioTrack, setActiveExtractedAudioTrack] = useState<number | null>(null);
  const [internalSubtitles, setInternalSubtitles] = useState<InternalSubtitleTrack[]>([]);
  const [customSubtitles, setCustomSubtitles] = useState<CustomSubtitle[]>([]);
  const [subtitleBlobs, setSubtitleBlobs] = useState<Record<string, string>>({});
  const [activeSkip, setActiveSkip] = useState<ActiveSkip | null>(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hoverTime, setHoverTime] = useState<number>(0);
  const [showHoverTime, setShowHoverTime] = useState(false);
  const [hoverPercent, setHoverPercent] = useState(0);
  const [externalPlayerPath, setExternalPlayerPath] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [originalSpeed, setOriginalSpeed] = useState(1);
  // "Double-click for fullscreen" discovery pill (desktop only).
  const [showFsHint, setShowFsHint] = useState(false);
  const clickTimerRef = useRef<number | null>(null);
  const hintTimeoutRef = useRef<number | null>(null);

  // ---------------------------------------------------------------------------
  // AniSkip
  // ---------------------------------------------------------------------------

  const { skipTimes, fetchSkipTimes, getSkipLabel } = useAniskip();

  const tatakaiSkipTimes = useMemo(() => {
    const windows: ActiveSkip[] = [];
    if (introWindow && Number.isFinite(introWindow.start) && Number.isFinite(introWindow.end) && introWindow.end > introWindow.start) {
      windows.push({
        interval: { startTime: introWindow.start, endTime: introWindow.end },
        skipType: "op",
        skipId: `tatakai-op-${episodeId || episodeNumber || "current"}`,
        episodeLength: 0,
      });
    }
    if (outroWindow && Number.isFinite(outroWindow.start) && Number.isFinite(outroWindow.end) && outroWindow.end > outroWindow.start) {
      windows.push({
        interval: { startTime: outroWindow.start, endTime: outroWindow.end },
        skipType: "ed",
        skipId: `tatakai-ed-${episodeId || episodeNumber || "current"}`,
        episodeLength: 0,
      });
    }
    return windows;
  }, [introWindow?.start, introWindow?.end, outroWindow?.start, outroWindow?.end, episodeId, episodeNumber]);

  const hasTatakaiSkipWindows = tatakaiSkipTimes.length > 0;
  const effectiveSkipTimes = hasTatakaiSkipWindows ? tatakaiSkipTimes : skipTimes;
  const hasTatakaiSkipWindowsRef = useRef(hasTatakaiSkipWindows);
  useEffect(() => { hasTatakaiSkipWindowsRef.current = hasTatakaiSkipWindows; }, [hasTatakaiSkipWindows]);

  const resolvedPoster = poster ? getProxiedImageUrl(poster) : undefined;

  // ---------------------------------------------------------------------------
  // Timeline lock
  // ---------------------------------------------------------------------------

  const timelineSeekingLocked = Boolean(isTimelineLocked && !isLive);
  const timelineUiHidden = Boolean(hideTimelineUi && !isLive);
  const timelineSeekingLockedRef = useRef(timelineSeekingLocked);
  const timelineLockReasonRef = useRef(timelineLockReason);
  useEffect(() => {
    timelineSeekingLockedRef.current = timelineSeekingLocked;
    timelineLockReasonRef.current = timelineLockReason;
  }, [timelineSeekingLocked, timelineLockReason]);

  const showTimelineLockHint = useCallback(() => {
    toast.info(timelineLockReasonRef.current || "Seeking is temporarily locked.", {
      id: "torrent-timeline-locked",
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Hooks
  // ---------------------------------------------------------------------------

  const {
    togglePlay,
    toggleMute,
    changeVolume,
    handleVolumeChange,
    skip,
    handlePlaybackRateChange,
    handleRefresh,
  } = useVideoControls({
    videoRef,
    isPlaying,
    isMuted,
    volume,
    duration,
    currentTime,
    playbackRate,
    timelineSeekingLocked,
    showTimelineLockHint,
    setIsPlaying,
    setIsMuted,
    setVolume,
    setPlaybackRate,
    onPlay,
    onPause,
  });

  const { isFullscreen, toggleFullscreen } = useVideoFullscreen({
    containerRef,
    isMobile,
  });

  const { isPiP, togglePiP } = useVideoPiP({
    videoRef,
    isMobile,
    isPlaying,
  });

  // ---------------------------------------------------------------------------
  // Single click = play/pause (+ "double-click for fullscreen" hint on
  // desktop), double click = fullscreen. A short delay disambiguates the two
  // so a double-click doesn't toggle play twice.
  // ---------------------------------------------------------------------------

  const hideFsHintSoon = useCallback(() => {
    if (hintTimeoutRef.current) window.clearTimeout(hintTimeoutRef.current);
    hintTimeoutRef.current = window.setTimeout(() => setShowFsHint(false), 3500);
  }, []);

  const handleVideoClick = useCallback(() => {
    if (isMobile) {
      togglePlay();
      return;
    }
    if (clickTimerRef.current) {
      // Second click within the window → double-click: fullscreen instead.
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      setShowFsHint(false);
      try {
        localStorage.setItem(FS_HINT_SEEN_KEY, "1");
      } catch { /* storage unavailable — hint may show again */ }
      void toggleFullscreen();
      return;
    }
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      togglePlay();
      // One-time discovery hint for desktop users.
      if (isDesktop()) {
        let seen = false;
        try {
          seen = localStorage.getItem(FS_HINT_SEEN_KEY) === "1";
        } catch { /* ignore */ }
        if (!seen) {
          setShowFsHint(true);
          hideFsHintSoon();
        }
      }
    }, DBL_CLICK_DELAY_MS);
  }, [isMobile, togglePlay, toggleFullscreen, hideFsHintSoon]);

  const {
    showControls,
    getShowControls,
    setShowControls: setControlsVisible,
    showControlsTemporarily,
  } = useControlsVisibility({ isPlaying, isMobile });

  const { keybinds } = useKeybinds();

  useVideoKeyboard({
    isMobile,
    timelineSeekingLocked,
    keybinds,
    togglePlay,
    toggleFullscreen,
    toggleMute,
    togglePiP,
    skip,
    changeVolume,
    showTimelineLockHint,
    onPrevEpisode: onPreviousEpisode,
    onNextEpisode,
  });

  const {
    handleSubtitleChange,
    handleCustomSubtitleUpload,
    visibleSubtitleOptions,
    currentInternalSubtitleTrackId,
    allRenderedSubtitles,
  } = useSubtitleManager({
    videoRef,
    subtitles,
    customSubtitles,
    internalSubtitles,
    currentSubtitle,
    subtitleBlobs,
    isOffline: Boolean(isOffline),
    headers,
    sourceKey: currentSource?.url || "",
    settings,
    setCurrentSubtitle,
    setCustomSubtitles,
    setSubtitleBlobs,
  });

  // Custom subtitle rendering: tracks run in "hidden" mode, we paint the active
  // cues ourselves so color/opacity/outline/position are styleable and sit above
  // the Anime4K canvas. Re-scan when the source or subtitle selection changes.
  const activeCueLines = useActiveCues(videoRef, `${currentSource?.url || ""}|${currentSubtitle}`, settings.subtitleOffset);

  // Register a user-uploaded subtitle font (if any) so 'custom' cues render it.
  useEffect(() => {
    void ensureCustomSubtitleFontLoaded();
  }, []);

  // Player enhancement modes (settings-driven). Stable volume adopts the <video>
  // into a WebAudio graph via createMediaElementSource — but an offline file
  // streamed from the 127.0.0.1 HTTP bridge is cross-origin/untainted-CORS, so
  // that source node would output ZEROES (permanent silence, since a node adopts
  // an element for its whole lifetime). Skip it for offline playback; the element
  // plays its own audio directly.
  useStableVolume(videoRef, settings.stableVolume && !isOffline);
  const sleepRemaining = useSleepTimer(videoRef, settings.sleepTimer);
  useAmbientMode(videoRef, ambientCanvasRef, settings.ambientMode, isPlaying);

  const handleInternalSubtitleLoad = useCallback(
    async (trackId: number) => {
      const video = videoRef.current;
      if (!video) return;

      const runtime = (window as any).tatakaiRuntime;
      if (!runtime?.extractSubtitle) {
        toast.error("Internal subtitle extraction not available");
        return;
      }

      const sub = internalSubtitles.find((s) => s.id === trackId);
      if (!sub) return;

      const sessionId = new URLSearchParams(window.location.search).get("sessionId");
      const isTorrentSource = Boolean(
        sessionId &&
          (currentSource?.sourceType === "torrent" || currentSource?.url?.startsWith("magnet:")),
      );

      let probeUrl = currentSource?.url || "";
      if (video.src) probeUrl = video.src;

      try {
        if (isTorrentSource && sessionId && runtime.getTorrentFilePath) {
          const pathRes = await runtime.getTorrentFilePath(sessionId);
          if (pathRes?.success && pathRes?.path) probeUrl = pathRes.path;
        }
      } catch {
        // fall back to stream URL
      }

      toast.loading(`Loading ${sub.label || sub.lang} subtitle...`, { id: "internal-sub-load" });

      try {
        const result = await runtime.extractSubtitle(probeUrl, trackId);
        toast.dismiss("internal-sub-load");

        if (!result?.success || !result?.url) {
          toast.error(result?.error || "Failed to extract subtitle");
          return;
        }

        let subtitleUrl = String(result.url || "").trim();
        if (
          !/^https?:\/\//i.test(subtitleUrl) &&
          !subtitleUrl.startsWith("file://") &&
          !subtitleUrl.startsWith("data:") &&
          !subtitleUrl.startsWith("tatakai-media://") &&
          /^[A-Za-z]:\\|\\\\/.test(subtitleUrl)
        ) {
          subtitleUrl = `file:///${subtitleUrl.replace(/\\/g, "/")}`;
        }

        // Fetch and convert the subtitle to a blob URL
        let text: string;
        if (subtitleUrl.startsWith("data:")) {
          // Data URL: decode directly
          const commaIndex = subtitleUrl.indexOf(",");
          text = decodeURIComponent(subtitleUrl.slice(commaIndex + 1));
        } else {
          const res = await fetch(subtitleUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          text = await res.text();
        }
        const blob = new Blob([text], { type: "text/vtt" });
        const blobUrl = URL.createObjectURL(blob);

        // Remove any existing internal subtitle tracks
        const existingTracks = Array.from(video.textTracks);
        for (let i = video.children.length - 1; i >= 0; i--) {
          const child = video.children[i];
          if ((child as HTMLTrackElement).kind === "subtitles" && (child as HTMLTrackElement).dataset?.internal === "true") {
            video.removeChild(child);
          }
        }

        // Add the new track element
        const trackEl = document.createElement("track");
        trackEl.kind = "subtitles";
        trackEl.label = sub.label || sub.lang;
        trackEl.srclang = sub.lang || "und";
        trackEl.src = blobUrl;
        trackEl.dataset.internal = "true";
        video.appendChild(trackEl);

        // Activate it. "hidden" so SubtitleOverlay renders it (see useActiveCues)
        // instead of the browser double-painting it.
        const newTrack = trackEl.track;
        newTrack.mode = "hidden";

        // Disable other text tracks
        for (let i = 0; i < video.textTracks.length; i++) {
          const t = video.textTracks[i];
          if (t !== newTrack) {
            t.mode = "disabled";
          }
        }

        setCurrentSubtitle(`internal:${trackId}`);
        toast.success(`Loaded ${sub.label || sub.lang} subtitle`);
      } catch (err: any) {
        toast.dismiss("internal-sub-load");
        toast.error(err?.message || "Failed to load internal subtitle");
      }
    },
    [videoRef, internalSubtitles, currentSource?.url, currentSource?.sourceType, currentSource?.isM3U8, setCurrentSubtitle],
  );

  const { handleAudioTrackChange, externalAudioRef } = useAudioTrackManager({
    videoRef,
    audioTracks,
    currentAudioTrack,
    currentSource,
    currentSubtitle,
    extractedAudioUrls,
    isNative,
    setCurrentAudioTrack,
    setExtractedAudioUrls,
    setActiveExtractedAudioTrack,
    handleSubtitleChange,
  });

  const { triggerMediaProbe } = useMediaProbe({
    videoRef,
    currentSource,
    isNative,
    torrentStats,
    setAudioTracks,
    setInternalSubtitles,
  });

  useVideoProgress({
    videoRef,
    isPlaying,
    isNative,
    currentSource,
    onProgressUpdate,
    animeName,
    episodeNumber,
    animeImageUrl: animePoster,
    animeUrl: animeId ? `https://tatakai.me/anime/${encodeURIComponent(animeId)}` : undefined,
  });

  // ---------------------------------------------------------------------------
  // External player
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (isNative && (window as any).tatakaiRuntime?.getExternalPlayerPref) {
      (window as any).tatakaiRuntime.getExternalPlayerPref().then((pref: any) => {
        if (pref?.executablePath) {
          setExternalPlayerPath(pref.executablePath);
        }
      });
    }
  }, [isNative]);

  useEffect(() => {
    if (currentSource?.url && settings.alwaysUseExternalPlayer && externalPlayerPath && isNative) {
      // Auto-launch handled by ExternalPlayerButton
    }
  }, [currentSource?.url, settings.alwaysUseExternalPlayer, externalPlayerPath, isNative]);

  // ---------------------------------------------------------------------------
  // Subtitle apply state ref
  // ---------------------------------------------------------------------------

  const subtitleApplyStateRef = useRef<{ lang: string; selectedIndex: number; trackCount: number } | null>(null);
  const subtitleTrackSignatureRef = useRef<string>("");
  const autoSkippedWindowRef = useRef<string | null>(null);
  const manualRetryLockUntilRef = useRef(0);
  // Timestamp until which code-4 errors are ignored. Set whenever we
  // programmatically empty the element (unload effect / adapter switch), because
  // Chromium fires MEDIA_ERR_SRC_NOT_SUPPORTED ("Empty src attribute") for that
  // load() and the event can arrive after the next source has already mounted —
  // at which point neither the current source nor the element looks empty, so
  // only a time window reliably identifies it as ours.
  const suppressEmptySrcUntilRef = useRef(0);
  const initialSeekDoneRef = useRef(false);
  const initialSeekRef = useRef(initialSeekSeconds);
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (initialSeekSeconds !== undefined && !initialSeekDoneRef.current) {
      initialSeekRef.current = initialSeekSeconds;
    }
  }, [initialSeekSeconds]);

  // This player stays mounted across in-app episode navigation, so re-arm the
  // one-time resume seek whenever the episode changes — otherwise only the first
  // episode of a session would ever resume.
  useEffect(() => {
    initialSeekDoneRef.current = false;
    initialSeekRef.current = initialSeekSeconds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId]);

  // ---------------------------------------------------------------------------
  // Apply settings
  // ---------------------------------------------------------------------------

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

  // Loop the current episode. With loop on the video restarts instead of firing
  // "ended", so auto-next never triggers — which is the intended behavior.
  useEffect(() => {
    if (videoRef.current) videoRef.current.loop = settings.loopVideo;
  }, [settings.loopVideo, currentSource?.url]);

  // Theater mode — a wider cinematic layout. Toggles a class on <html> that the
  // watch-page layout widens against (see index.css `.player-theater`).
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theaterMode) root.classList.add("player-theater");
    else root.classList.remove("player-theater");
    return () => root.classList.remove("player-theater");
  }, [settings.theaterMode]);

  // Announce the sleep timer once when armed to a fixed duration.
  const sleepAnnouncedRef = useRef<string>("off");
  useEffect(() => {
    if (settings.sleepTimer === sleepAnnouncedRef.current) return;
    sleepAnnouncedRef.current = settings.sleepTimer;
    if (settings.sleepTimer !== "off" && settings.sleepTimer !== "end-of-episode") {
      toast.info(`Sleep timer set for ${settings.sleepTimer} minutes.`, { id: "sleep-timer-set" });
    }
  }, [settings.sleepTimer]);

  // ---------------------------------------------------------------------------
  // Anime4K GPU upscaling (desktop only, opt-in)
  // ---------------------------------------------------------------------------

  // Anime4K on the Capacitor mobile app is opt-in and capability-gated: allowed
  // only when the device supports WebGL2, and the preset is clamped to the
  // cheapest ("light") mode so a phone GPU isn't asked to run the heavy CNN.
  // A narrow desktop/web viewport (`isMobile` state, viewport-based) keeps the
  // prior behavior of no Anime4K. On the mobile app we bypass that viewport gate.
  const isMobileApp = isMobileNative();
  const anime4kAllowed = isMobileApp ? Anime4KRenderer.isSupported() : !isMobile;
  const effectiveAnime4kPreset: Anime4KMode =
    isMobileApp && settings.anime4kPreset !== "off"
      ? ("light" as Anime4KMode)
      : (settings.anime4kPreset as Anime4KMode);
  const anime4kActive = anime4kAllowed && settings.anime4kPreset !== "off";

  useEffect(() => {
    // Off, unsupported, or disallowed on this surface → tear down and bail.
    if (!anime4kActive || !Anime4KRenderer.isSupported()) {
      anime4kRendererRef.current?.destroy();
      anime4kRendererRef.current = null;
      return;
    }

    const video = videoRef.current;
    const canvas = anime4kCanvasRef.current;
    if (!video || !canvas) return;

    let renderer = anime4kRendererRef.current;
    if (!renderer) {
      try {
        renderer = new Anime4KRenderer(video, canvas);
        anime4kRendererRef.current = renderer;
      } catch (err) {
        console.warn("[VideoPlayer] Anime4K init failed:", err);
        return;
      }
    }

    // A source change may hand us a clean (CORS-friendly) stream, so clear any
    // prior permanent-disable and re-show the overlay before (re)starting.
    renderer.resetDisabled();
    setAnime4kDisabled(false);
    renderer.setDisabledCallback(() => setAnime4kDisabled(true));

    renderer.setMode(effectiveAnime4kPreset);
    renderer.start();

    return () => {
      anime4kRendererRef.current?.stop();
    };
  }, [anime4kActive, effectiveAnime4kPreset, currentSource?.url]);

  // Destroy the renderer on unmount.
  useEffect(() => {
    return () => {
      anime4kRendererRef.current?.destroy();
      anime4kRendererRef.current = null;
    };
  }, []);

  // Mobile app: keep the screen awake while playing so the device doesn't dim /
  // sleep mid-episode. Released on pause and unmount. No-ops off Capacitor.
  useEffect(() => {
    if (!isMobileApp) return;
    let released = false;
    void (async () => {
      try {
        const { KeepAwake } = await import("@capacitor-community/keep-awake");
        if (isPlaying) await KeepAwake.keepAwake();
        else await KeepAwake.allowSleep();
      } catch {
        /* plugin missing — ignore */
      }
    })();
    return () => {
      if (released) return;
      released = true;
      void import("@capacitor-community/keep-awake")
        .then(({ KeepAwake }) => KeepAwake.allowSleep().catch(() => {}))
        .catch(() => {});
    };
  }, [isMobileApp, isPlaying]);

  // ---------------------------------------------------------------------------
  // Subtitle change on settings change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    handleSubtitleChange(settings.subtitleLanguage);
  }, [settings.subtitleLanguage, handleSubtitleChange]);

  // Reset subtitle state on source change
  const subtitleKey = [...(subtitles || []), ...(customSubtitles || [])]
    ?.map((s) => `${String(s.url || "").trim()}|${String(s.lang || "").trim()}|${String(s.label || "").trim()}`)
    .join("|") ?? "";
  const sourceKey = currentSource?.url || "";

  useEffect(() => {
    subtitleApplyStateRef.current = null;
    subtitleTrackSignatureRef.current = "";
  }, [subtitleKey, sourceKey]);

  // ---------------------------------------------------------------------------
  // Skip times
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (hasTatakaiSkipWindows) return;
    if (!malId || !episodeNumber) return;

    const onManifestParsed = () => {
      const length = videoRef.current?.duration;
      fetchSkipTimes(malId, episodeNumber, isFinite(length!) && length! > 0 ? Math.floor(length!) : undefined);
    };

    if (videoRef.current?.duration && isFinite(videoRef.current.duration) && videoRef.current.duration > 0) {
      onManifestParsed();
    }

    const handler = () => onManifestParsed();
    const hls = hlsRef.current;
    if (hls) hls.on(Hls.Events.MANIFEST_PARSED, handler);

    return () => {
      if (hls) hls.off(Hls.Events.MANIFEST_PARSED, handler);
    };
  }, [malId, episodeNumber, fetchSkipTimes, hasTatakaiSkipWindows]);

  // Active skip detection
  useEffect(() => {
    const skip = effectiveSkipTimes.find(
      (candidate) =>
        currentTime >= candidate.interval.startTime && currentTime < candidate.interval.endTime,
    ) || null;
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

  // Auto-skip
  useEffect(() => {
    if (!settings.autoSkipIntro || !activeSkip || !videoRef.current) return;
    if (timelineSeekingLockedRef.current) return;
    if (activeSkip.skipType !== "op" && activeSkip.skipType !== "mixed-op" && activeSkip.skipType !== "recap") return;

    const windowKey = `${activeSkip.skipType}:${activeSkip.interval.startTime}:${activeSkip.interval.endTime}`;
    if (autoSkippedWindowRef.current === windowKey) return;

    videoRef.current.currentTime = activeSkip.interval.endTime;
    autoSkippedWindowRef.current = windowKey;
    setActiveSkip(null);
  }, [activeSkip, settings.autoSkipIntro, timelineSeekingLocked]);

  useEffect(() => {
    autoSkippedWindowRef.current = null;
  }, [sourceKey]);

  // ---------------------------------------------------------------------------
  // Load video
  // ---------------------------------------------------------------------------

  const loadVideo = useCallback(async () => {
    if (!currentSource?.url || !videoRef.current) return;

    setVideoError(null);
    setIsBuffering(true);

    let mode: "hls" | "direct" | "torrent" | "offline" | "debrid" = "direct";
    if (isOffline) {
      mode = "offline";
    } else {
      const url = String(currentSource.url || "");
      const isHlsStream = Boolean(currentSource.isM3U8 || url.includes(".m3u8"));
      const isPlayableHttpOrFile =
        url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://");

      if (currentSource.sourceType === "torrent") {
        mode = isHlsStream ? "hls" : isPlayableHttpOrFile ? "direct" : "torrent";
      } else if (url.startsWith("magnet:")) {
        mode = "debrid";
      } else if (isHlsStream) {
        mode = "hls";
      }
    }

    try {
      const seekTime = initialSeekDoneRef.current
        ? videoRef.current?.currentTime || initialSeekRef.current
        : initialSeekRef.current;

      await sourceAdapterRegistry.switchTo({
        source: {
          id: currentSource.url,
          url: currentSource.url,
          mode: mode,
          episodeNumber: currentSource.episodeNumber ?? episodeNumber,
          filenameHint: currentSource.filenameHint,
        },
        videoElement: videoRef.current,
        startTime: seekTime,
        autoPlay: settings.autoplay,
      });

      initialSeekDoneRef.current = true;
    } catch (err: any) {
      setVideoError(err.message || "Failed to load video");
      setIsBuffering(false);
    }
  }, [
    currentSource?.url,
    currentSource?.isM3U8,
    currentSource?.sourceType,
    currentSource?.episodeNumber,
    currentSource?.filenameHint,
    episodeNumber,
    isOffline,
    settings.autoplay,
  ]);

  useEffect(() => {
    loadVideo();
  }, [currentSource?.url, currentSource?.isM3U8, currentSource?.sourceType, isOffline, settings.autoplay]);

  // Unload adapter when source becomes empty
  useEffect(() => {
    if (currentSource) return;
    const adapter = sourceAdapterRegistry.getCurrentAdapter();
    if (adapter) {
      void adapter.unload();
    }
    const video = videoRef.current;
    if (video) {
      // Calling load() on an already-empty element fires a MEDIA_ERR_SRC_NOT_SUPPORTED
      // (code 4, "Empty src attribute") error event. That spurious event used to
      // set videoError and trigger a server failover even though there was simply
      // no source selected yet (loading / torrent handover) — and the stale error
      // then sat on top of the video after the real source mounted and started
      // playing. Skip the reset entirely when there is nothing to unload.
      const hasSrc =
        Boolean(video.currentSrc) ||
        Boolean(video.getAttribute("src")) ||
        video.querySelectorAll("source").length > 0;
      if (!hasSrc) return;
      suppressEmptySrcUntilRef.current = Date.now() + 1500;
      video.removeAttribute("src");
      video.querySelectorAll("source").forEach((node) => node.remove());
      video.load();
    }
  }, [currentSource]);

  // ---------------------------------------------------------------------------
  // Video event handlers
  // ---------------------------------------------------------------------------

  const lastProgressAtRef = useRef(Date.now());
  const lastEmitRef = useRef(0);
  const bufferingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const t = video.currentTime;
      setCurrentTime(t);
      updateGlobalVideoTime(t);
      // Persist progress periodically DURING playback — not just on pause/ended.
      // Closing the tab fires no reliable pause, so without this a mid-playback
      // close left only the 0s seed row and Continue Watching showed 0:00.
      // Throttled to 5s; WatchPage writes localStorage synchronously each call
      // (survives an abrupt close) and throttles the Supabase/Dexie write itself.
      const now = Date.now();
      if (onProgressUpdate && t > 1 && now - lastEmitRef.current >= 5000) {
        lastEmitRef.current = now;
        onProgressUpdate(Math.floor(t), Math.floor(video.duration || 0) || 0, false);
      }
    };
    const handleDurationChange = () => setDuration(video.duration);
    const handleLoadedMetadata = () => {
      // Metadata means the mounted source is genuinely readable — any earlier
      // transient error (empty-src from a switch, a first-segment stall that
      // later resolved) is stale. Clear it so the overlay never covers a
      // playable video, including when autoplay is off and `playing` hasn't
      // fired yet.
      setVideoError((prev) => (prev ? null : prev));
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      // Save the exact position the moment playback stops so reopening resumes here.
      const t = Math.floor(video.currentTime || 0);
      if (t > 0 && onProgressUpdate) {
        onProgressUpdate(t, Math.floor(video.duration || 0) || 0, false, true);
      }
    };
    const handleWaiting = () => {
      if (!videoRef.current?.paused) {
        setIsBuffering(true);
      }
    };
    const handlePlaying = () => {
      setIsBuffering(false);
      // Playback recovered (or started) — drop any stale error overlay. Without
      // this a transient failure (e.g. the empty-src event fired by a
      // programmatic unload during a source switch) stayed visible on top of a
      // now-playing video.
      setVideoError((prev) => (prev ? null : prev));
      lastProgressAtRef.current = Date.now();
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
      const dur = Math.floor(videoRef.current?.duration || 0) || undefined;
      const finalPos = Math.floor(videoRef.current?.currentTime || 0);
      if (onProgressUpdate) onProgressUpdate(dur ?? finalPos, dur, true);
      // "End of episode" sleep timer stops the chain here, overriding auto-next.
      if (settings.sleepTimer === "end-of-episode") {
        toast.info("Sleep timer: stopped at end of episode.", { id: "sleep-timer-end" });
        return;
      }
      // Auto-next: don't jump instantly — show the Up-Next overlay and count
      // down, letting the viewer play now or cancel. The interval effect below
      // fires onEpisodeEnd() when it reaches zero.
      if (settings.autoNextEpisode && onEpisodeEnd) {
        setUpNextCountdown(Math.max(1, Math.round(settings.autoNextCountdownSeconds || 10)));
      }
    };
    const handleError = (e: any) => {
      console.error("Video Error:", e);
      const videoEl = videoRef.current;
      const err = videoEl?.error;
      // No source selected (initial load, torrent handover, episode switch):
      // the element legitimately has nothing to play, so any error event here
      // — typically code 4 "Empty src attribute" from a programmatic unload —
      // is not a playback failure. Ignore it instead of raising the overlay
      // (and triggering a server failover) while the real source mounts.
      if (!currentSource?.url) return;
      const code = Number(err?.code || 0);
      const rawMessage = String(err?.message || "Unknown error");
      // Our own programmatic unload fires code 4 ("Empty src attribute") and the
      // event can land after the next source has mounted, when nothing looks
      // empty anymore — the timestamp is the only reliable identifier.
      if (Date.now() < suppressEmptySrcUntilRef.current && (code === 4 || code === 0)) return;
      const elementSrc = String(videoEl?.currentSrc || videoEl?.src || videoEl?.getAttribute?.("src") || "").trim();
      if (!elementSrc || /empty[^a-z]*src/i.test(rawMessage)) return;
      let failureReason = "native-video-error";
      let friendlyMessage: string | null = null;
      const eventMessage = String(e?.message || e?.target?.error?.message || "").trim().toLowerCase();
      const normalizedMessage = rawMessage.toLowerCase();
      const compositeMessage = `${normalizedMessage} ${eventMessage}`;

      const isTorrent =
        currentSource?.url?.startsWith("magnet:") || currentSource?.sourceType === "torrent";
      const inTorrentStartupGrace = isTorrent && Date.now() < (Date.now());
      if (
        (isTorrent && !initialSeekDoneRef.current) ||
        (inTorrentStartupGrace && (code === 4 || isTransientTorrentStartupError(compositeMessage)))
      ) {
        console.warn("[VideoPlayer] Suppressing early torrent error:", eventMessage);
        setIsBuffering(true);
        return;
      }

      if (err) {
        if (
          code === 4 &&
          (compositeMessage.includes("decoder_error_not_supported") ||
            compositeMessage.includes("unsupportedconfig") ||
            compositeMessage.includes("audio decoder initialization failed"))
        ) {
          failureReason = "native-decoder-unsupported-config";
          friendlyMessage = "Audio codec is not supported for this source. Auto-switching source...";
        } else if (code === 4) {
          failureReason = "native-playback-not-supported";
          if (compositeMessage.includes("unsupported") || compositeMessage.includes("not supported")) {
            friendlyMessage = "Playback format is not supported for this source. Auto-switching source...";
          }
        } else if (code === 3 || compositeMessage.includes("decode")) {
          failureReason = "native-decode-error";
        }
        setVideoError(friendlyMessage || `Playback Error (${code}): ${rawMessage}`);
        if (onError) onError({ statusCode: code || undefined, reason: failureReason });
      } else {
        setVideoError(friendlyMessage || "Playback failed");
        if (onError) onError({ reason: failureReason });
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
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
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("progress", handleProgress);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("error", handleError);
    };
  }, [
    settings.autoNextEpisode,
    settings.autoNextCountdownSeconds,
    settings.sleepTimer,
    onEpisodeEnd,
    onPlay,
    onPause,
    onProgressUpdate,
    onError,
    audioTracks.length,
    internalSubtitles.length,
    triggerMediaProbe,
    currentSource?.url,
    currentSource?.sourceType,
  ]);

  // ---------------------------------------------------------------------------
  // Up-Next countdown driver
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (upNextCountdown === null) return;
    if (upNextCountdown <= 0) {
      setUpNextCountdown(null);
      if (onEpisodeEnd) onEpisodeEnd();
      return;
    }
    const id = window.setTimeout(() => {
      setUpNextCountdown((prev) => (prev === null ? null : prev - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [upNextCountdown, onEpisodeEnd]);

  // ---------------------------------------------------------------------------
  // Buffering timeout
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (bufferingTimeoutRef.current !== null) {
      clearTimeout(bufferingTimeoutRef.current);
      bufferingTimeoutRef.current = null;
    }

    if (!isBuffering || !currentSource?.url) return;

    bufferingTimeoutRef.current = window.setTimeout(() => {
      const stalledMs = Date.now() - lastProgressAtRef.current;
      if (stalledMs >= 15000) {
        const isTorrent =
          currentSource?.url?.startsWith("magnet:") || currentSource?.sourceType === "torrent";
        if (!isTorrent) {
          setVideoError("Server timed out. Auto-switching server in 3 seconds...");
          if (onError) onError({ reason: "buffer-stall-timeout" });
        } else {
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

  // ---------------------------------------------------------------------------
  // Sync extracted audio
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const audioUrl =
      activeExtractedAudioTrack != null ? extractedAudioUrls[activeExtractedAudioTrack] : undefined;
    if (!audioUrl) {
      if (externalAudioRef.current) {
        externalAudioRef.current.pause();
        externalAudioRef.current.removeAttribute("src");
        externalAudioRef.current.load();
      }
      return;
    }

    const audio = externalAudioRef.current || new Audio();
    externalAudioRef.current = audio;
    audio.preload = "auto";

    if (audio.src !== audioUrl) {
      audio.src = audioUrl;
      audio.load();
    }

    const syncVolume = () => {
      audio.volume = isMuted ? 0 : volume;
      video.muted = true;
    };

    const syncTime = () => {
      if (!Number.isFinite(video.currentTime)) return;
      const drift = Math.abs((audio.currentTime || 0) - video.currentTime);
      if (drift > 0.35) {
        try { audio.currentTime = video.currentTime; } catch { /* ignore */ }
      }
    };

    const onPlaySync = () => {
      syncVolume();
      audio.playbackRate = video.playbackRate || 1;
      syncTime();
      void audio.play().catch(() => {});
    };
    const onPauseSync = () => audio.pause();
    const onSeeked = () => syncTime();
    const onRateChange = () => { audio.playbackRate = video.playbackRate || 1; };

    syncVolume();
    if (!video.paused) onPlaySync();

    video.addEventListener("play", onPlaySync);
    video.addEventListener("pause", onPauseSync);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("ratechange", onRateChange);

    const driftTimer = window.setInterval(syncTime, 1000);

    return () => {
      video.removeEventListener("play", onPlaySync);
      video.removeEventListener("pause", onPauseSync);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("ratechange", onRateChange);
      window.clearInterval(driftTimer);
      if (activeExtractedAudioTrack == null) {
        video.muted = isMuted;
      }
    };
  }, [activeExtractedAudioTrack, extractedAudioUrls, isMuted, volume, videoRef, externalAudioRef]);

  // ---------------------------------------------------------------------------
  // Detect mobile
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // ---------------------------------------------------------------------------
  // Keyboard shortcut overlay
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ---------------------------------------------------------------------------
  // Handle seek (with torrent support)
  // ---------------------------------------------------------------------------

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement> | number) => {
      if (timelineSeekingLockedRef.current) {
        showTimelineLockHint();
        return;
      }

      let newTime: number;
      if (typeof e === "number") {
        newTime = e;
      } else {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const percent = (clientX - rect.left) / rect.width;
        newTime = Math.max(0, Math.min(duration, percent * duration));
      }

      if (videoRef.current) {
        const sessionId = new URLSearchParams(window.location.search).get("sessionId");
        const isTorrentSource = Boolean(
          sessionId &&
            (currentSource?.sourceType === "torrent" || currentSource?.url?.startsWith("magnet:")),
        );

        if (isTorrentSource && (window as any).tatakaiRuntime?.getTorrentStreamUrl) {
          const isHlsTorrent = Boolean(
            currentSource?.isM3U8 || currentSource?.url?.includes(".m3u8"),
          );
          if (isHlsTorrent) {
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime);
            return;
          }

          void (async () => {
            try {
              const runtime = (window as any).tatakaiRuntime;
              const currentVideo = videoRef.current;
              const wasPaused = currentVideo?.paused;
              const currentPlaybackRate = currentVideo?.playbackRate || 1;

              const stream = await runtime.getTorrentStreamUrl(
                sessionId,
                (window as any).currentFileIndex ?? undefined,
                { audioTrackIndex: currentAudioTrack, startTime: newTime },
              );

              if (!stream?.success || !stream.url) {
                throw new Error(stream?.error || "Failed to seek torrent stream");
              }

              await sourceAdapterRegistry.switchTo({
                source: {
                  id: stream.url,
                  url: stream.url,
                  mode: stream.isM3U8 || String(stream.url).includes(".m3u8") ? "hls" : "direct",
                },
                videoElement: currentVideo!,
                startTime: newTime,
                autoPlay: !wasPaused,
              });

              if (currentVideo) currentVideo.playbackRate = currentPlaybackRate;
              handleSubtitleChange(currentSubtitle);
              setCurrentTime(newTime);
            } catch (err) {
              console.error("Torrent seek failed:", err);
              toast.error("Could not seek torrent stream");
            }
          })();
          return;
        }

        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    },
    [duration, currentSource, currentAudioTrack, currentSubtitle, handleSubtitleChange, showTimelineLockHint],
  );

  // ---------------------------------------------------------------------------
  // Progress bar hover
  // ---------------------------------------------------------------------------

  const handleProgressBarHover = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isLive || timelineSeekingLocked) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clientX = e.clientX;
      const percent = (clientX - rect.left) / rect.width;
      const clampedPercent = Math.max(0, Math.min(1, percent));
      const time = clampedPercent * duration;
      setHoverPercent(clampedPercent * 100);
      setHoverTime(time);
      setShowHoverTime(true);
    },
    [isLive, timelineSeekingLocked, duration],
  );

  const handleProgressBarLeave = useCallback(() => {
    setShowHoverTime(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Long press speed handlers
  // ---------------------------------------------------------------------------

  const handleLongPressSpeedStart = useCallback(() => {
    if (videoRef.current) {
      setOriginalSpeed(videoRef.current.playbackRate);
      videoRef.current.playbackRate = 2;
    }
  }, [videoRef]);

  const handleLongPressSpeedEnd = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = originalSpeed;
    }
  }, [videoRef, originalSpeed]);

  // ---------------------------------------------------------------------------
  // Calculate progress
  // ---------------------------------------------------------------------------

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      ref={containerRef}
      className="relative aspect-video min-h-[12rem] bg-black rounded-xl md:rounded-2xl overflow-hidden group touch-manipulation video-player-container video-player-modern"
      onMouseMove={!isMobile ? showControlsTemporarily : undefined}
      onMouseLeave={() => !isMobile && isPlaying && setControlsVisible(false)}
      onTouchStart={showControlsTemporarily}
    >
      {/* Double-click fullscreen discovery hint (desktop only, one-time).
          Non-interactive so it never swallows clicks. */}
      {showFsHint && !isMobile && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white border border-white/10 shadow-lg backdrop-blur-md whitespace-nowrap">
            <Maximize className="w-3.5 h-3.5 shrink-0" />
            <span>Double-click for fullscreen</span>
          </div>
        </div>
      )}

      {/* Media stack — ambient glow, video, and Anime4K canvas share one
          stacking context (z-0) so their internal z-index:1/2 (video below the
          upscaled canvas) never lifts above the controls overlay, which paints
          later in DOM order. Without this the video (z-1) sat on top of the
          controls and swallowed every click. */}
      <div className="player-media-stack absolute inset-0 z-0">
        {/* Ambient glow — blurred low-res copy of the frame behind the video */}
        {settings.ambientMode && !isMobile ? (
          <canvas ref={ambientCanvasRef} className="player-ambient-glow" aria-hidden="true" />
        ) : null}

        {/* Anime4K upscaled output — painted above the video, below subtitles/controls.
            Hidden (not unmounted) when the renderer disables itself, so the ref stays
            stable and the raw <video> shows through. */}
        {anime4kActive ? (
          <canvas
            ref={anime4kCanvasRef}
            className="player-anime4k-canvas"
            aria-hidden="true"
            style={anime4kDisabled ? { display: "none" } : undefined}
          />
        ) : null}

        <LongPressSpeed
        onLongPressStart={handleLongPressSpeedStart}
        onLongPressEnd={handleLongPressSpeedEnd}
      >
        <DoubleTapSeek
          onSeek={(direction) => skip(direction === "forward" ? 10 : -10)}
        >
          {/* Video Element */}
          <video
            ref={videoRef}
            className={`w-full h-full object-contain video-with-subtitles subtitle-${settings.subtitleSize} subtitle-font-${settings.subtitleFont} subtitle-bg-${settings.subtitleBackground}`}
            poster={resolvedPoster}
            playsInline
            {...(!isOffline ? { crossOrigin: "anonymous" } : {})}
            onClick={handleVideoClick}
          >
            {(() => {
              // Dedup by selection key (URL-based) before rendering tracks. The same
              // subtitle often arrives from several providers; without this each copy
              // became a <track> sharing one key, so multiple `default` tracks showed
              // at once and stacked identical lines on screen.
              const seenTrackKeys = new Set<string>();
              return allRenderedSubtitles.filter((sub, idx) => {
                const key = getSubtitleSelectionKey(sub, idx);
                if (seenTrackKeys.has(key)) return false;
                seenTrackKeys.add(key);
                return true;
              });
            })().map((sub, idx) => {
              const subtitleSelectionKey = getSubtitleSelectionKey(sub, idx);
              const subtitleSourceUrl = String(sub.url || "").trim();
              if (!subtitleSourceUrl) return null;
              const blobUrl = subtitleBlobs[subtitleSourceUrl];
              const proxiedUrl = !isOffline
                ? getProxiedSubtitleUrl(subtitleSourceUrl, headers?.Referer || "")
                : subtitleSourceUrl;
              const src =
                sub.lang === "custom"
                  ? blobUrl || subtitleSourceUrl
                  : blobUrl ||
                    (proxiedUrl && (proxiedUrl.endsWith(".vtt") || proxiedUrl.startsWith("blob:") || proxiedUrl.startsWith("data:"))
                      ? proxiedUrl
                      : undefined);

              if (!src) return null;

              return (
                <track
                  key={subtitleSelectionKey}
                  kind="subtitles"
                  src={src}
                  srcLang={
                    sub.lang === "custom"
                      ? "und"
                      : String(sub.lang || "").slice(0, 2) || "und"
                  }
                  label={sub.label || sub.lang}
                  default={
                    currentSubtitle !== "off" && currentSubtitle === subtitleSelectionKey
                  }
                />
              );
            })}
          </video>
        </DoubleTapSeek>
      </LongPressSpeed>
      </div>

      {/* Torrent Status Panel */}
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
              if (res?.success && res?.path) await ep.openPath(res.path);
            } catch { /* ignore */ }
          }}
          className={
            getShowControls()
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 -translate-y-4 pointer-events-none"
          }
        />
      ) : null}

      {/* View Counter */}
      <ViewCountBadge viewCount={viewCount || 0} isVisible={getShowControls() && !isBuffering} />

      {/* Loading */}
      <LoadingOverlay
        isVisible={(isLoading && !isPlaying) || (isBuffering && !videoError)}
        serverName={serverName}
      />

      {/* Error */}
      <ErrorOverlay
        videoError={videoError || ""}
        isOffline={Boolean(isOffline)}
        isBuffering={isBuffering}
        videoSrc={videoRef.current?.currentSrc}
        videoErrorObj={videoRef.current?.error}
        onRetry={() => {
          const now = Date.now();
          if (now < manualRetryLockUntilRef.current) return;
          manualRetryLockUntilRef.current = now + 2500;
          if (onRetryCurrentServer) onRetryCurrentServer();
          retryCountRef.current = 0;
          loadVideo();
        }}
        onRefresh={handleRefresh}
        onServerSwitch={onServerSwitch}
      />

      {/* Center Play Button */}
      <CenterPlayButton
        isVisible={!isPlaying && !isLoading && !isBuffering && !videoError && !isLive}
        onClick={togglePlay}
      />

      {/* AniSkip Skip Button */}
      <SkipButton
        activeSkip={activeSkip}
        timelineSeekingLocked={timelineSeekingLocked}
        onSkip={handleSkip}
        getSkipLabel={getSkipLabel}
      />

      {/* Custom subtitle overlay — paints active cues above the Anime4K canvas,
          fully styled from user settings (color/opacity/outline/position). */}
      <SubtitleOverlay
        lines={activeCueLines}
        settings={settings}
        controlsVisible={getShowControls()}
      />

      {/* Auto-next Up-Next countdown */}
      {upNextCountdown !== null && (
        <UpNextOverlay
          secondsLeft={upNextCountdown}
          total={Math.max(1, Math.round(settings.autoNextCountdownSeconds || 10))}
          title={nextEpisodeTitle}
          thumbnail={nextEpisodeThumbnail}
          episodeNumber={nextEpisodeNumber}
          onPlayNow={() => {
            setUpNextCountdown(null);
            if (onEpisodeEnd) onEpisodeEnd();
          }}
          onCancel={() => setUpNextCountdown(null)}
        />
      )}

      {/* Controls Overlay */}
      <div
        ref={controlsOverlayRef}
        className={`absolute inset-x-0 bottom-0 video-controls-gradient px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6 sm:p-4 md:p-5 transition-all duration-300 ${
          getShowControls()
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        {/* Progress Bar */}
        {!timelineUiHidden && (
          <div
            className={`relative h-1 md:h-1.5 bg-white/20 rounded-full group/progress mb-4 md:mb-5 video-progress-track ${
              isLive
                ? "cursor-default pointer-events-none"
                : timelineSeekingLocked
                  ? "cursor-not-allowed opacity-85"
                  : "cursor-pointer"
            }`}
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

            {/* Skip Time Markers */}
            {effectiveSkipTimes.map((skip) => {
              const startPercent = duration > 0 ? (skip.interval.startTime / duration) * 100 : 0;
              const widthPercent =
                duration > 0 ? ((skip.interval.endTime - skip.interval.startTime) / duration) * 100 : 0;
              return (
                <div
                  key={skip.skipId}
                  className="absolute h-full bg-yellow-400 rounded-full z-10"
                  style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
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
            <PlaybackControls
              isPlaying={isPlaying}
              isLive={Boolean(isLive)}
              timelineSeekingLocked={timelineSeekingLocked}
              timelineUiHidden={timelineUiHidden}
              onTogglePlay={togglePlay}
              onRefresh={handleRefresh}
              onSkip={skip}
            />

            <VolumeControl
              volume={volume}
              isMuted={isMuted}
              onToggleMute={toggleMute}
              onVolumeChange={handleVolumeChange}
            />

            <TimeDisplay
              currentTime={currentTime}
              duration={duration}
              timelineUiHidden={timelineUiHidden}
            />
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1 md:gap-2">
            <SubtitleSelector
              subtitles={subtitles}
              customSubtitles={customSubtitles}
              internalSubtitles={internalSubtitles}
              currentSubtitle={currentSubtitle}
              currentInternalSubtitleTrackId={currentInternalSubtitleTrackId}
              subtitleBlobs={subtitleBlobs}
              visibleSubtitleOptions={visibleSubtitleOptions}
              showSubtitleMenu={showSubtitleMenu}
              onToggleMenu={() => {
                setShowSubtitleMenu(!showSubtitleMenu);
                setShowAudioMenu(false);
                setShowSettings(false);
              }}
              onSubtitleChange={handleSubtitleChange}
              onInternalSubtitleChange={handleInternalSubtitleLoad}
              onCustomUpload={handleCustomSubtitleUpload}
            />

            <AudioTrackSelector
              audioTracks={audioTracks}
              currentAudioTrack={currentAudioTrack}
              showAudioMenu={showAudioMenu}
              onToggleMenu={() => {
                setShowAudioMenu(!showAudioMenu);
                setShowSubtitleMenu(false);
                setShowSettings(false);
              }}
              onTrackChange={handleAudioTrackChange}
            />

            <SpeedSelector
              playbackRate={playbackRate}
              showSettings={showSettings}
              onToggleMenu={() => {
                setShowSettings(!showSettings);
                setShowSubtitleMenu(false);
                setShowAudioMenu(false);
              }}
              onRateChange={(rate) => {
                handlePlaybackRateChange(rate);
                setShowSettings(false);
              }}
            />

            <button
              onClick={() => setShowSettingsPanel(true)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="Player Preferences"
            >
              <SlidersHorizontal className="w-4 h-4 md:w-5 md:h-5" />
            </button>

            {!isLive && (
              <ScreenshotButton
                videoRef={videoRef}
                animeName={animeName}
                episodeNumber={episodeNumber}
              />
            )}

            {isNative && (
              <DownloadButton
                episodeId={episodeId}
                animeName={animeName}
                episodeNumber={episodeNumber}
                posterUrl={animePoster ?? poster}
                sourceUrl={currentSource?.url}
                sourceType={currentSource?.sourceType}
                // Only hand the torrent magnet/bridge URL over when the playing
                // source is actually a torrent — otherwise a stale session
                // hijacks stream downloads into the slow torrent path.
                torrentUrl={
                  String((currentSource as any)?.sourceType || '').toLowerCase() === 'torrent' ||
                  String((currentSource as any)?.sourceType || '').toLowerCase() === 'debrid' ||
                  String(currentSource?.url || '').startsWith('magnet:')
                    ? torrentStats?.rawUrl
                    : undefined
                }
                headers={headers as Record<string, string> | undefined}
                animeId={animeId ?? malId}
                subtitles={subtitles}
              />
            )}

            {isNative && (
              <ExternalPlayerButton
                videoRef={videoRef}
                externalPlayerPath={externalPlayerPath}
                currentSourceUrl={currentSource?.url}
                isPlaying={isPlaying}
                animeName={animeName}
                episodeNumber={episodeNumber}
                episodeTitle={episodeTitle}
              />
            )}

            {/* Picture-in-Picture temporarily disabled (see useVideoPiP). */}

            <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
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
        onInternalSubtitleChange={handleInternalSubtitleLoad}
      />

      {/* Keyboard Shortcuts */}
      <KeyboardShortcutOverlay
        isVisible={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </div>
  );
}

// Re-export types for backward compatibility
export type { VideoPlayerProps, VideoPlayerExtendedProps } from "./VideoPlayer.types";
