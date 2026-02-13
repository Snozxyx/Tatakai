import { useState, useRef, useEffect, useCallback } from "react";
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
  isLoading?: boolean;
  serverName?: string;
  onEpisodeEnd?: () => void;
  malId?: number | null;
  episodeNumber?: number;
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

export function MobileVideoPlayer({
  sources,
  subtitles = [],
  headers,
  poster,
  onError,
  onServerSwitch,
  isLoading = false,
  serverName,
  onEpisodeEnd,
  malId,
  episodeNumber,
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
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { settings } = useVideoSettings();
  const { skipTimes, fetchSkipTimes, getActiveSkip } = useAniskip();
  const { startDownload, queue } = useMobileDownload();

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
  const [currentSubtitle, setCurrentSubtitle] = useState<string>(settings.subtitleLanguage);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [activeSkip, setActiveSkip] = useState<any>(null);
  const [playbackRate, setPlaybackRate] = useState(settings.playbackSpeed);
  const [subtitleBlobs, setSubtitleBlobs] = useState<Record<string, string>>({});
  
  // Double-tap seek
  const [doubleTapSide, setDoubleTapSide] = useState<'left' | 'right' | null>(null);
  const [seekAmount, setSeekAmount] = useState(0);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const seekAccumulatorRef = useRef(0);

  // Progress tracking
  const lastSavedProgressRef = useRef<number>(0);
  const PROGRESS_SAVE_INTERVAL = 15;

  // Fetch skip times for intro/outro
  useEffect(() => {
    if (malId && episodeNumber && duration > 0) {
      fetchSkipTimes(malId, episodeNumber, Math.floor(duration));
    }
  }, [malId, episodeNumber, duration, fetchSkipTimes]);

  // Check for active skip
  useEffect(() => {
    if (skipTimes.length > 0) {
      const skip = getActiveSkip(currentTime);
      setActiveSkip(skip);
    }
  }, [currentTime, skipTimes, getActiveSkip]);

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

  // Initialize HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video || sources.length === 0) return;

    const source = sources[0];
    const finalUrl = !isOffline && headers?.Referer
      ? getProxiedVideoUrl(source.url, headers.Referer, headers?.["User-Agent"])
      : source.url;

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

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
        video.play().catch(console.error);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (retryCount < 3) {
            setRetryCount(prev => prev + 1);
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
    } else {
      // Direct MP4
      video.src = finalUrl;
      if (initialSeekSeconds && initialSeekSeconds > 0) {
        video.currentTime = initialSeekSeconds;
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [sources, headers, initialSeekSeconds, retryCount, isOffline]);

  // Load subtitles
  useEffect(() => {
    const loadSubtitles = async () => {
      const blobs: Record<string, string> = {};
      for (const sub of subtitles) {
        try {
          const url = !isOffline && headers?.Referer
            ? getProxiedSubtitleUrl(sub.url, headers.Referer)
            : sub.url;
          const response = await fetch(url);
          const text = await response.text();
          const blob = new Blob([text], { type: 'text/vtt' });
          blobs[sub.lang] = URL.createObjectURL(blob);
        } catch (e) {
          console.warn('Failed to load subtitle:', sub.lang, e);
        }
      }
      setSubtitleBlobs(blobs);
    };
    if (subtitles.length > 0) {
      loadSubtitles();
    }
  }, [subtitles, headers, isOffline]);

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
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      try {
        await StatusBar.hide();
        await ScreenOrientation.lock({ orientation: 'landscape' });
        
        document.body.style.overflow = 'hidden';
        containerRef.current.style.position = 'fixed';
        containerRef.current.style.top = '0';
        containerRef.current.style.left = '0';
        containerRef.current.style.width = '100vw';
        containerRef.current.style.height = '100vh';
        containerRef.current.style.zIndex = '99999';
        containerRef.current.style.backgroundColor = 'black';
        
        setIsFullscreen(true);
      } catch (e) {
        console.warn('Failed to enter fullscreen:', e);
      }
    } else {
      try {
        await StatusBar.show();
        await ScreenOrientation.unlock();
        
        document.body.style.overflow = '';
        containerRef.current.style.position = '';
        containerRef.current.style.top = '';
        containerRef.current.style.left = '';
        containerRef.current.style.width = '';
        containerRef.current.style.height = '';
        containerRef.current.style.zIndex = '';
        containerRef.current.style.backgroundColor = '';
        
        setIsFullscreen(false);
      } catch (e) {
        console.warn('Failed to exit fullscreen:', e);
      }
    }
  };

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
    video.currentTime = Math.max(0, Math.min(time, duration));
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
      id: episodeId,
      animeId,
      animeName,
      season: 1,
      episode: episodeNumber || 1,
      episodeTitle: episodeTitle || `Episode ${episodeNumber || 1}`,
      posterUrl: animePoster || poster || '',
      videoUrl: source.url,
      isM3U8: source.isM3U8,
      headers,
    });
    toast.success("Download started");
  };

  // Retry on error
  const handleRetry = () => {
    setVideoError(null);
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
        {subtitles.map((sub) => (
          <track
            key={sub.lang}
            kind="subtitles"
            label={sub.label || sub.lang}
            srcLang={sub.lang}
            src={subtitleBlobs[sub.lang] || ''}
            default={sub.lang === currentSubtitle}
          />
        ))}
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
              Skip {activeSkip.type === 'op' ? 'Intro' : 'Outro'}
            </button>
          )}

          {/* Bottom Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-3 pb-4 safe-area-bottom">
            {/* Progress Bar */}
            <div 
              className="relative h-1.5 bg-white/20 rounded-full mb-3 touch-none"
              onTouchStart={handleProgressSeek}
              onTouchMove={handleProgressSeek}
            >
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
                      {subtitles.map((sub) => (
                        <button
                          key={sub.lang}
                          onClick={() => handleSubtitleChange(sub.lang)}
                          className={cn(
                            "w-full px-4 py-3 text-left text-sm rounded-xl transition-colors",
                            currentSubtitle === sub.lang ? 'bg-primary text-white font-semibold' : 'text-white/80 hover:bg-white/5'
                          )}
                        >
                          {sub.label || sub.lang}
                        </button>
                      ))}
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
