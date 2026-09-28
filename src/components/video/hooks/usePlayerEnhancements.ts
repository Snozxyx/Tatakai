import { useEffect, useRef, useState } from "react";
import type { SleepTimerOption } from "@/hooks/media/useVideoSettings";

/**
 * Stable volume — routes the media element through a WebAudio
 * DynamicsCompressor so loud spikes (action scenes, ads) are tamed and quiet
 * dialogue is lifted. Disabled → the graph is torn down and the element plays
 * natively.
 *
 * The MediaElementSourceNode is created lazily and reused: a video element can
 * only ever be adopted by ONE source node for its lifetime, so we keep it on a
 * ref and never recreate it.
 */
export function useStableVolume(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!enabled) {
      // Bypass: reconnect the source straight to the destination.
      try {
        if (sourceRef.current && ctxRef.current) {
          sourceRef.current.disconnect();
          sourceRef.current.connect(ctxRef.current.destination);
        }
      } catch {
        // Graph may not exist yet — nothing to bypass.
      }
      return;
    }

    try {
      const AudioCtx =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!ctxRef.current) ctxRef.current = new AudioCtx();
      const ctx = ctxRef.current;

      if (!sourceRef.current) {
        sourceRef.current = ctx.createMediaElementSource(video);
      }
      if (!compressorRef.current) {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -28;
        comp.knee.value = 30;
        comp.ratio.value = 12;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;
        compressorRef.current = comp;
      }

      const source = sourceRef.current;
      const comp = compressorRef.current;
      source.disconnect();
      source.connect(comp);
      comp.connect(ctx.destination);

      if (ctx.state === "suspended") void ctx.resume();
    } catch (err) {
      console.warn("[usePlayerEnhancements] stable volume unavailable:", err);
    }
  }, [enabled, videoRef]);

  // Tear down the AudioContext on unmount.
  useEffect(() => {
    return () => {
      try {
        compressorRef.current?.disconnect();
        sourceRef.current?.disconnect();
        void ctxRef.current?.close();
      } catch {
        // Ignore teardown errors.
      }
      ctxRef.current = null;
      sourceRef.current = null;
      compressorRef.current = null;
    };
  }, []);
}

const SLEEP_TIMER_MINUTES: Record<Exclude<SleepTimerOption, "off" | "end-of-episode">, number> = {
  "15": 15,
  "30": 30,
  "45": 45,
  "60": 60,
};

/**
 * Sleep timer — pauses the video after the chosen duration. "end-of-episode"
 * is handled by the caller (it just suppresses auto-next); this hook covers the
 * fixed-minute options. Returns the remaining seconds for an optional readout.
 */
export function useSleepTimer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  option: SleepTimerOption,
) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (option === "off" || option === "end-of-episode") {
      setRemainingSeconds(null);
      return;
    }

    const minutes = SLEEP_TIMER_MINUTES[option];
    if (!minutes) {
      setRemainingSeconds(null);
      return;
    }

    let remaining = minutes * 60;
    setRemainingSeconds(remaining);

    const interval = window.setInterval(() => {
      remaining -= 1;
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        window.clearInterval(interval);
        try {
          videoRef.current?.pause();
        } catch {
          // Ignore pause errors.
        }
        setRemainingSeconds(null);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [option, videoRef]);

  return remainingSeconds;
}

/**
 * Ambient mode — paints a heavily-blurred, low-frequency copy of the current
 * frame onto a backing canvas so the player glows with the video's colors.
 * Only runs while playing and while enabled; canvas stays a tiny 32×18 sample
 * (CSS blur does the rest) so the cost is negligible.
 */
export function useAmbientMode(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
  isPlaying: boolean,
) {
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!enabled || !video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 32;
    canvas.height = 18;

    let raf = 0;
    let last = 0;
    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw);
      // ~4fps is plenty for an ambient glow and keeps the main thread free.
      if (ts - last < 240) return;
      last = ts;
      if (video.readyState < 2 || video.videoWidth === 0) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch {
        // Cross-origin frame with no CORS — skip silently.
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [enabled, isPlaying, videoRef, canvasRef]);
}
