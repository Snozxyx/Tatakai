import { useCallback } from "react";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import type { UseVideoControlsParams } from "../VideoPlayer.types";

export function useVideoControls({
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
}: UseVideoControlsParams) {
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
  }, [videoRef, isPlaying]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [videoRef, isMuted, setIsMuted]);

  const changeVolume = useCallback(
    (delta: number) => {
      if (!videoRef.current) return;
      const newVolume = Math.max(0, Math.min(1, volume + delta));
      videoRef.current.volume = newVolume;
      videoRef.current.muted = newVolume === 0;
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
    },
    [videoRef, volume, setVolume, setIsMuted],
  );

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value);
      if (!videoRef.current) return;
      videoRef.current.volume = newVolume;
      videoRef.current.muted = newVolume === 0;
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
    },
    [videoRef, setVolume, setIsMuted],
  );

  const skip = useCallback(
    (seconds: number) => {
      if (timelineSeekingLocked) {
        showTimelineLockHint();
        return;
      }
      if (!videoRef.current) return;
      videoRef.current.currentTime = Math.max(
        0,
        Math.min(duration, currentTime + seconds),
      );
    },
    [videoRef, duration, currentTime, timelineSeekingLocked, showTimelineLockHint],
  );

  const handlePlaybackRateChange = useCallback(
    (rate: number) => {
      if (!videoRef.current) return;
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    },
    [videoRef, setPlaybackRate],
  );

  const handleRefresh = useCallback(() => {
    if (!videoRef.current) return;
    const wasPlaying = !videoRef.current.paused;
    const currentTimeSnapshot = videoRef.current.currentTime;

    toast.info(i18n.t('player.refreshingStream'));

    videoRef.current.load();

    const onLoaded = () => {
      if (videoRef.current) {
        videoRef.current.currentTime = currentTimeSnapshot;
        if (wasPlaying) {
          void videoRef.current.play().catch(() => {});
        }
      }
      videoRef.current?.removeEventListener("loadedmetadata", onLoaded);
    };

    videoRef.current.addEventListener("loadedmetadata", onLoaded);
  }, [videoRef]);

  return {
    togglePlay,
    toggleMute,
    changeVolume,
    handleVolumeChange,
    skip,
    handlePlaybackRateChange,
    handleRefresh,
  };
}
