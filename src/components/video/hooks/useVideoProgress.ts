import { useEffect, useRef, useCallback } from "react";
import { setWatchingRpc, setPausedRpc } from "@/lib/discordRpc";
import { updateGlobalVideoTime } from "@/core/player/global-video-ref";
import { playbackEventBus, PlayerEvents } from "@/core/player/PlaybackEventBus";
import type { UseVideoProgressParams } from "../VideoPlayer.types";

export function useVideoProgress({
  videoRef,
  isPlaying,
  isNative,
  currentSource,
  onProgressUpdate,
  animeName,
  episodeNumber,
  animeImageUrl,
  animeUrl,
}: UseVideoProgressParams) {
  const progressIntervalRef = useRef<number | null>(null);
  const progressCallbackRef = useRef<typeof onProgressUpdate | null>(onProgressUpdate);
  const lastProgressAtRef = useRef<number>(Date.now());
  const lastObservedTimeRef = useRef<number>(0);
  const lastRpcUpdateRef = useRef(0);
  const torrentPlaybackUpdateRef = useRef(0);

  // Keep latest callback without re-subscribing effects
  useEffect(() => {
    progressCallbackRef.current = onProgressUpdate ?? null;
  }, [onProgressUpdate]);

  // Progress interval — ticks every second while playing
  useEffect(() => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

    progressIntervalRef.current = window.setInterval(() => {
      if (videoRef.current && isPlaying) {
        const time = videoRef.current.currentTime;
        if (progressCallbackRef.current) {
          progressCallbackRef.current(time, videoRef.current.duration || 0);
        }

        const sessionId = new URLSearchParams(window.location.search).get("sessionId");
        const isTorrentSource = Boolean(
          sessionId &&
            (currentSource?.sourceType === "torrent" ||
              currentSource?.url?.startsWith("magnet:")),
        );

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
  }, [isPlaying, isNative, currentSource?.url, currentSource?.sourceType, videoRef]);

  // PlaybackEventBus sync
  useEffect(() => {
    const bus = playbackEventBus;
    const unsubs = [
      bus.on(PlayerEvents.TIME_UPDATE, (t) => {
        lastObservedTimeRef.current = t;
        updateGlobalVideoTime(t);
      }),
      bus.on(PlayerEvents.BUFFERING, (b) => {
        if (!b) lastProgressAtRef.current = Date.now();
      }),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  // Discord RPC — throttled to once per 5 s; switches between watching / paused
  useEffect(() => {
    if (!isNative || !animeName) return;

    const now = Date.now();
    if (now - lastRpcUpdateRef.current < 5000) return;
    lastRpcUpdateRef.current = now;

    const video = videoRef.current;
    const currentTime = lastObservedTimeRef.current ?? 0;
    const duration = video?.duration ?? 0;

    if (isPlaying) {
      setWatchingRpc({
        animeTitle: animeName,
        episode: episodeNumber ?? 0,
        currentTime,
        duration,
        animeImageUrl,
        animeUrl,
      });
    } else {
      setPausedRpc({
        animeTitle: animeName,
        episode: episodeNumber ?? 0,
        animeImageUrl,
        animeUrl,
      });
    }
  }, [isNative, isPlaying, animeName, episodeNumber, animeImageUrl, animeUrl]);

  // Persist final progress on unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      const time = Math.floor(videoRef.current?.currentTime || 0);
      const dur = Math.floor(videoRef.current?.duration || 0) || undefined;
      if (progressCallbackRef.current) progressCallbackRef.current(time, dur, false, true);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);

      if (progressIntervalRef.current !== null) {
        clearInterval(progressIntervalRef.current as number);
        progressIntervalRef.current = null;
      }

      // Save one last time on unmount
      const time = Math.floor(videoRef.current?.currentTime || 0);
      const dur = Math.floor(videoRef.current?.duration || 0) || undefined;
      if (progressCallbackRef.current) progressCallbackRef.current(time, dur, false, true);
    };
  }, [videoRef]);

  return {
    lastProgressAtRef,
    lastObservedTimeRef,
  };
}
