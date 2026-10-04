import type { VideoSettings } from "@/hooks/media/useVideoSettings";

// ---------------------------------------------------------------------------
// Source types
// ---------------------------------------------------------------------------

export interface PlaybackSource {
  url: string;
  isM3U8: boolean;
  quality?: string;
  sourceType?: string;
  /** Upstream URL + request headers retained by the mobile in-app proxy. */
  originalUrl?: string;
  headers?: Record<string, string>;
}

export interface PlaybackHeaders {
  Referer?: string;
  "User-Agent"?: string;
}

// ---------------------------------------------------------------------------
// Subtitle types
// ---------------------------------------------------------------------------

export interface ExternalSubtitle {
  lang: string;
  url: string;
  label?: string;
  originalUrl?: string;
  headers?: Record<string, string>;
}

export interface CustomSubtitle extends ExternalSubtitle {
  internalTrackId?: number;
}

export interface InternalSubtitleTrack {
  id: number;
  label: string;
  lang: string;
  default?: boolean;
}

export interface SubtitleDisplayKey {
  lang: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Audio track types
// ---------------------------------------------------------------------------

export interface AudioTrack {
  id: number;
  label: string;
  lang: string;
  default?: boolean;
}

// ---------------------------------------------------------------------------
// Skip / AniSkip types
// ---------------------------------------------------------------------------

export interface SkipTimeWindow {
  interval: { startTime: number; endTime: number };
  skipType: "op" | "ed" | "mixed-op" | "mixed-ed" | "recap";
  skipId: string;
  episodeLength: number;
}

export interface ActiveSkip {
  interval: { startTime: number; endTime: number };
  skipType: "op" | "ed" | "mixed-op" | "mixed-ed" | "recap";
  skipId: string;
  episodeLength: number;
}

// ---------------------------------------------------------------------------
// Chapter types (for seekbar)
// ---------------------------------------------------------------------------

export interface Chapter {
  startTime: number;
  endTime: number;
  type: "op" | "ed" | "recap" | "mixed-op" | "mixed-ed";
}

// ---------------------------------------------------------------------------
// Torrent types
// ---------------------------------------------------------------------------

export interface TorrentStats {
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
  rawUrl?: string;
}

// ---------------------------------------------------------------------------
// Quality types
// ---------------------------------------------------------------------------

export type QualityPreset = "auto" | "1080p" | "720p" | "480p" | "360p";

export interface QualityOption {
  value: QualityPreset;
  label: string;
}

// ---------------------------------------------------------------------------
// Speed option
// ---------------------------------------------------------------------------

export interface SpeedOption {
  value: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Subtitle style options
// ---------------------------------------------------------------------------

export type SubtitleSize = VideoSettings["subtitleSize"];
export type SubtitleFont = VideoSettings["subtitleFont"];
export type SubtitleBackground = VideoSettings["subtitleBackground"];

export interface SizeOption {
  value: SubtitleSize;
  label: string;
}

export interface FontOption {
  value: SubtitleFont;
  label: string;
}

export interface BgOption {
  value: SubtitleBackground;
  label: string;
}

// ---------------------------------------------------------------------------
// VideoPlayer props (main component)
// ---------------------------------------------------------------------------

export interface VideoPlayerProps {
  sources: PlaybackSource[];
  subtitles?: ExternalSubtitle[];
  headers?: PlaybackHeaders;
  poster?: string;
  onError?: (context?: { statusCode?: number; reason?: string }) => void;
  onServerSwitch?: () => void;
  onRetryCurrentServer?: () => void;
  isLoading?: boolean;
  serverName?: string;
  onEpisodeEnd?: () => void;
  onPreviousEpisode?: () => void;
  onNextEpisode?: () => void;
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
  torrentStats?: TorrentStats;
  torrentSessionId?: string;
  onTorrentRepair?: () => void;
  onTorrentStop?: () => void;
}

export interface VideoPlayerExtendedProps {
  onProgressUpdate?: (progressSeconds: number, durationSeconds?: number, completed?: boolean, flush?: boolean) => void;
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
  /** Optional metadata for the auto-next "Up Next" countdown overlay. */
  nextEpisodeTitle?: string;
  nextEpisodeThumbnail?: string;
  nextEpisodeNumber?: number;
}

// ---------------------------------------------------------------------------
// Hook parameter types
// ---------------------------------------------------------------------------

export interface UseVideoControlsParams {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  duration: number;
  currentTime: number;
  playbackRate: number;
  timelineSeekingLocked: boolean;
  showTimelineLockHint: () => void;
  setIsPlaying: (v: boolean) => void;
  setIsMuted: (v: boolean) => void;
  setVolume: (v: number) => void;
  setPlaybackRate: (v: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
}

export interface UseVideoFullscreenParams {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isMobile: boolean;
}

export interface UseVideoPiPParams {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isMobile: boolean;
  isPlaying: boolean;
}

export interface UseSubtitleManagerParams {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  subtitles: ExternalSubtitle[];
  customSubtitles: CustomSubtitle[];
  internalSubtitles: InternalSubtitleTrack[];
  currentSubtitle: string;
  subtitleBlobs: Record<string, string>;
  isOffline: boolean;
  headers?: PlaybackHeaders;
  sourceKey: string;
  settings: VideoSettings;
  setCurrentSubtitle: (v: string) => void;
  setCustomSubtitles: React.Dispatch<React.SetStateAction<CustomSubtitle[]>>;
  setSubtitleBlobs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export interface UseAudioTrackManagerParams {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audioTracks: AudioTrack[];
  currentAudioTrack: number;
  currentSource?: PlaybackSource;
  currentSubtitle: string;
  extractedAudioUrls: Record<number, string>;
  isNative: boolean;
  setCurrentAudioTrack: (v: number) => void;
  setExtractedAudioUrls: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  setActiveExtractedAudioTrack: (v: number | null) => void;
  handleSubtitleChange: (lang: string) => void;
}

export interface UseMediaProbeParams {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  currentSource?: PlaybackSource;
  isNative: boolean;
  torrentStats?: TorrentStats;
  setAudioTracks: (v: AudioTrack[]) => void;
  setInternalSubtitles: (v: InternalSubtitleTrack[]) => void;
}

export interface UseVideoProgressParams {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  isNative: boolean;
  currentSource?: PlaybackSource;
  onProgressUpdate?: (progressSeconds: number, durationSeconds?: number, completed?: boolean, flush?: boolean) => void;
  animeName?: string;
  episodeNumber?: number;
  /** External URL of the anime poster — passed to Discord RPC as the large image. */
  animeImageUrl?: string;
  /** Deep link to the anime page on Tatakai — used for the "Show in Tatakai" RPC button. */
  animeUrl?: string;
}

export interface UseVideoKeyboardParams {
  isMobile: boolean;
  timelineSeekingLocked: boolean;
  keybinds: import("@/lib/video/keybindings").KeybindMap;
  togglePlay: () => void;
  toggleFullscreen: () => void;
  toggleMute: () => void;
  togglePiP: () => void;
  skip: (seconds: number) => void;
  changeVolume: (delta: number) => void;
  showTimelineLockHint: () => void;
  onPrevEpisode?: () => void;
  onNextEpisode?: () => void;
}

export interface UseControlsVisibilityParams {
  isPlaying: boolean;
  isMobile: boolean;
}

// ---------------------------------------------------------------------------
// Gesture types (new features)
// ---------------------------------------------------------------------------

export interface GestureState {
  type: "seek" | "volume" | "brightness" | "speed" | null;
  value: number;
  startX: number;
  startY: number;
}

export interface DoubleTapState {
  side: "left" | "right" | null;
  count: number;
  lastTapTime: number;
}

// ---------------------------------------------------------------------------
// Keyboard shortcut definition
// ---------------------------------------------------------------------------

export interface KeyboardShortcut {
  key: string;
  label: string;
  category: "playback" | "navigation" | "volume" | "subtitles" | "other";
}
