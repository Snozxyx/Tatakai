import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Maximize2, Play, Pause, PictureInPicture2 } from 'lucide-react';
import { playbackEventBus, PlayerEvents } from '@/core/player/PlaybackEventBus';
import {
  getGlobalVideo,
  getLastWatchPath,
  getLastSavedTime,
  getGlobalVideoMeta,
  setPipModeActive,
  isPipModeActive,
  triggerPipExitCallback,
} from '@/core/player/global-video-ref';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Miniplayer — shown when the user navigates away from the watch page while
 * something is playing.
 *
 * Two modes:
 *  1. Native browser PiP (preferred): calls `video.requestPictureInPicture()` on
 *     the VideoPlayer's live <video> element.
 *  2. In-app fallback draggable overlay with play/pause + progress + resume.
 *
 * Key design points:
 *  • The video element lives in the VideoPlayer on the /watch route. When the user
 *    navigates away the VideoPlayer unmounts and `getGlobalVideo()` returns null.
 *    We fall back to `getLastSavedTime()` for display and keep audio playing via
 *    the PlaybackEventBus until the user stops or returns.
 *  • "Expand" navigates back to the watch path so the watch page re-mounts with
 *    the same episodeId — it will read the continue-watching position and resume.
 */
export function Miniplayer() {
  const navigate = useNavigate();
  const location = useLocation();

  const [active, setActive] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [pipNative, setPipNative] = useState(false);
  const [animeName, setAnimeName] = useState<string | null>(null);
  const pipAttemptedRef = useRef(false);

  const isOnWatchPage = location.pathname.startsWith('/watch');

  // Track playing state from the event bus
  useEffect(() => {
    const unsubs = [
      playbackEventBus.on(PlayerEvents.PLAY, () => setIsPlaying(true)),
      playbackEventBus.on(PlayerEvents.PAUSE, () => setIsPlaying(false)),
      playbackEventBus.on(PlayerEvents.TIME_UPDATE, (t: number) => setCurrentTime(t)),
      playbackEventBus.on(PlayerEvents.DURATION_CHANGE, (d: number) => setDuration(d)),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // Show / hide based on route + duration
  useEffect(() => {
    const shouldShow = !isOnWatchPage && duration > 0;
    setActive(shouldShow);

    if (shouldShow) {
      // Grab meta once when we first become visible
      const meta = getGlobalVideoMeta();
      if (meta.animeName) setAnimeName(meta.animeName);

      // Sync initial time from global ref in case bus hasn't fired since mount
      const video = getGlobalVideo();
      if (video && video.currentTime > 0) setCurrentTime(video.currentTime);
      else if (getLastSavedTime() > 0) setCurrentTime(getLastSavedTime());

      // Auto-trigger native PiP once
      if (!pipAttemptedRef.current) {
        pipAttemptedRef.current = true;
        void tryNativePiP();
      }
    }

    if (isOnWatchPage) {
      pipAttemptedRef.current = false;
      setPipNative(false);
    }
  }, [isOnWatchPage, duration]);

  const tryNativePiP = useCallback(async () => {
    const video = getGlobalVideo();
    if (!video) return;
    if (!document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement) return;
    try {
      await video.requestPictureInPicture();
      setPipNative(true);
      setPipModeActive(true, () => setPipNative(false));
    } catch {
      setPipNative(false);
      setPipModeActive(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      setPipNative(false);
      setPipModeActive(false);
      triggerPipExitCallback();
    };
    document.addEventListener('leavepictureinpicture', handler);
    return () => document.removeEventListener('leavepictureinpicture', handler);
  }, []);

  // Nothing to render when native PiP is active or not active
  if (!active || pipNative) return null;

  const togglePlay = () => {
    const video = getGlobalVideo();
    if (video) {
      if (video.paused) void video.play().catch(() => {});
      else video.pause();
    } else {
      // Video element is gone (watch page unmounted) — emit bus event
      playbackEventBus.emit(isPlaying ? 'pause' : 'play');
    }
  };

  const close = () => {
    const video = getGlobalVideo();
    if (video) video.pause();
    else playbackEventBus.emit('pause');
    setActive(false);
    setDuration(0);
    setCurrentTime(0);
  };

  const expand = () => {
    const path = getLastWatchPath();
    if (path && path.startsWith('/watch')) {
      navigate(path);
    } else {
      navigate(-1);
    }
  };

  const displayTime = (() => {
    const video = getGlobalVideo();
    return video ? video.currentTime : (currentTime || getLastSavedTime());
  })();

  const displayDuration = (() => {
    const video = getGlobalVideo();
    return video ? video.duration : duration;
  })();

  const progress = displayDuration > 0 ? (displayTime / displayDuration) * 100 : 0;

  return (
    <AnimatePresence>
      <motion.div
        drag
        dragMomentum={false}
        dragConstraints={{
          left: 0,
          right: Math.max(0, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 300),
          top: 0,
          bottom: Math.max(0, (typeof window !== 'undefined' ? window.innerHeight : 800) - 220),
        }}
        initial={{ opacity: 0, scale: 0.9, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 50 }}
        className="fixed bottom-6 right-6 w-72 bg-black/95 backdrop-blur-sm rounded-2xl border border-white/10 shadow-2xl overflow-hidden z-[999] cursor-move select-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-black/60 border-b border-white/5">
          <span className="text-[10px] font-black text-white/60 uppercase tracking-wider truncate max-w-[140px]">
            {animeName || 'Now Playing'}
          </span>
          <div className="flex gap-1 shrink-0">
            {document.pictureInPictureEnabled && (
              <button
                onClick={tryNativePiP}
                className="p-1.5 rounded-md bg-white/5 hover:bg-white/15 transition-colors text-white/60 hover:text-white"
                title="Picture in Picture"
              >
                <PictureInPicture2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={expand}
              className="p-1.5 rounded-md bg-white/5 hover:bg-white/15 transition-colors text-white/60 hover:text-white"
              title="Return to player"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={close}
              className="p-1.5 rounded-md bg-white/5 hover:bg-destructive/40 transition-colors text-white/60 hover:text-destructive"
              title="Stop"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30 hover:brightness-110 active:scale-95 transition-all flex-shrink-0"
          >
            {isPlaying
              ? <Pause className="w-4 h-4 text-primary-foreground fill-primary-foreground" />
              : <Play className="w-4 h-4 text-primary-foreground fill-primary-foreground ml-0.5" />
            }
          </button>

          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-white/40 mb-1.5 flex justify-between font-mono">
              <span>{formatTime(displayTime)}</span>
              <span>{formatTime(displayDuration)}</span>
            </div>
            <div
              className="h-1.5 rounded-full bg-white/15 overflow-hidden cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const video = getGlobalVideo();
                if (video && displayDuration > 0) {
                  video.currentTime = ratio * displayDuration;
                  setCurrentTime(ratio * displayDuration);
                }
              }}
            >
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Tap to return */}
        <button
          onClick={expand}
          className="w-full px-4 pb-2.5 text-[10px] text-white/25 hover:text-white/50 transition-colors text-center"
        >
          Tap to return to player →
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

function formatTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
