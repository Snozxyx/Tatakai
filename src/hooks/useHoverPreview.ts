/**
 * The hover video preview behind the media cards.
 *
 * It grew inside `AnimeCardWithPreview` as a pair of effects that resolved a
 * source, attached hls.js, seeked to the preview timestamp and tore the instance
 * down again. The v6 `PosterCard` needs the same behaviour on the trending,
 * favorites and genre grids, so it lives here rather than being copied: one
 * hls.js lifecycle, one set of fade rules, one definition of "no usable source".
 *
 * Resolution itself stays `usePreviewSource`'s job, including its 200 ms hover
 * guard and its cache; this hook owns only the hover state and the video element.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { usePreviewSource } from './usePreviewSource';

interface UseHoverPreviewOptions {
  /** The resolver keys off AniList ids; without one there is nothing to fetch. */
  anilistId?: number | null;
  /** Fallback title for the resolver's search. */
  title: string;
  /** Off for surfaces that should never fetch — pickers, manga, list rows. */
  enabled?: boolean;
}

export interface HoverPreview {
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Hover is live and a stream is attached: fade the poster out. */
  isActive: boolean;
  /** The resolver is still working, so the card can show a spinner. */
  isLoading: boolean;
  /** The video has actually started moving — the fade-in gate. */
  isPlaying: boolean;
  /** No usable stream, so the card keeps its play affordance. */
  showFallback: boolean;
  onEnter: () => void;
  onLeave: () => void;
  /** For the `<video>`'s own `onError` — a source that fails after attaching. */
  onError: () => void;
}

export function useHoverPreview({
  anilistId,
  title,
  enabled = true,
}: UseHoverPreviewOptions): HoverPreview {
  const [isHovering, setIsHovering] = useState(false);
  const [hasError, setHasError] = useState(false);
  // Local in-app proxy is preferred; on playback failure we retry once through
  // the cloud proxy (`source.fallbackStreamUrl`) before surfacing an error.
  const [useFallback, setUseFallback] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const { source, loading, startHover, cancelHover } = usePreviewSource();

  const primaryUrl = enabled ? source?.streamUrl ?? null : null;
  const fallbackUrl = enabled ? source?.fallbackStreamUrl ?? null : null;
  const streamUrl = useFallback && fallbackUrl ? fallbackUrl : primaryUrl;

  // A freshly resolved source starts on its primary (local-proxy) URL again.
  useEffect(() => {
    setUseFallback(false);
  }, [primaryUrl]);

  const handleFailure = useCallback(() => {
    if (fallbackUrl && !useFallback) {
      setUseFallback(true);
    } else {
      setHasError(true);
    }
  }, [fallbackUrl, useFallback]);

  useEffect(() => {
    if (!isHovering || !enabled || !anilistId) {
      if (!isHovering) cancelHover();
      return;
    }

    startHover(anilistId, [title]);
  }, [anilistId, cancelHover, enabled, isHovering, startHover, title]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // A fresh instance per attach: reusing one across sources leaves the old
    // manifest's fragments queued against the media element.
    hlsRef.current?.destroy();
    hlsRef.current = null;

    if (!isHovering || !streamUrl) {
      // `usePreviewSource` caches its hit, so `streamUrl` survives the pointer
      // leaving — the element has to be paused explicitly or a progressive
      // source keeps downloading behind a faded-out video.
      video.pause();
      if (!streamUrl) setHasError(true);
      return;
    }

    setHasError(false);

    const seekToPreview = () => {
      const at = source?.previewTimestampSec;
      if (at && Number.isFinite(at)) {
        try {
          video.currentTime = at;
        } catch {
          // Unseekable source; it just starts from the top.
        }
      }
    };

    const play = () => {
      void video.play().catch(() => {});
    };

    if (source?.isHls) {
      if (!Hls.isSupported()) {
        setHasError(true);
        return;
      }

      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        seekToPreview();
        play();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) handleFailure();
      });
      return;
    }

    video.src = streamUrl;
    video.addEventListener(
      'loadedmetadata',
      () => {
        seekToPreview();
        play();
      },
      { once: true },
    );
    play();
  }, [isHovering, source, streamUrl, handleFailure]);

  useEffect(() => {
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, []);

  const onEnter = useCallback(() => {
    setIsHovering(true);
    // A previous miss must not stop the next hover from trying again.
    setHasError((previous) => (previous && !streamUrl ? false : previous));
  }, [streamUrl]);

  const onLeave = useCallback(() => {
    setIsHovering(false);
    cancelHover();
  }, [cancelHover]);

  const onError = useCallback(() => handleFailure(), [handleFailure]);

  return {
    videoRef,
    isActive: isHovering && Boolean(streamUrl),
    isLoading: isHovering && loading,
    showFallback: !streamUrl || hasError || (isHovering && loading),
    onEnter,
    onLeave,
    onError,
  };
}
