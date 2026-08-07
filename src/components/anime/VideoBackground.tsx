import { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { getProxiedImageUrl } from '@/lib/api';
import { usePreviewSource } from '@/hooks/usePreviewSource';

interface VideoBackgroundProps {
  animeId: string;
  poster: string;
  children: React.ReactNode;
  /** AniList ID for preview resolution (req 9.6) */
  anilistId?: number;
  /** Titles array for multi-title fallback search */
  titles?: string[];
}

export function VideoBackground({ animeId, poster, children, anilistId, titles }: VideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { startHover, source } = usePreviewSource();

  // Resolve preview on mount (no hover guard for detail page — req 9.6)
  useEffect(() => {
    if (!anilistId) return;
    startHover(anilistId, titles ?? [], undefined);
  }, [anilistId, titles, startHover]);

  // Attach video src when source resolves (req 9.7)
  useEffect(() => {
    if (!videoRef.current || !source?.streamUrl) return;
    const videoEl = videoRef.current;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const seekToPreviewTimestamp = () => {
      if (videoRef.current && source.previewTimestampSec > 0) {
        videoRef.current.currentTime = source.previewTimestampSec;
      }
    };

    const playVideo = () => {
      videoEl.play()
        .then(() => setIsVideoReady(true))
        .catch(() => setIsVideoReady(false));
    };

    if (source.isHls) {
      if (!Hls.isSupported()) {
        setIsVideoReady(false);
        return;
      }

      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(source.streamUrl);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        seekToPreviewTimestamp();
        playVideo();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setIsVideoReady(false);
      });
      return;
    }

    videoEl.src = source.streamUrl;
    videoEl.addEventListener('loadedmetadata', seekToPreviewTimestamp, { once: true });
    playVideo();
  }, [source]);

  const hasVideo = isVideoReady && !!source?.streamUrl;

  useEffect(() => {
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, []);

  return (
    <div className="relative min-h-[70vh] md:min-h-[80vh] overflow-hidden">
      {/* Video or Poster Background */}
      <div className="absolute inset-0">
        {/* Video — only shown when source resolved and ready (req 9.6, 9.7) */}
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${hasVideo ? 'opacity-50' : 'opacity-0'}`}
          loop
          muted
          playsInline
        />

        {/* Poster fallback — shown when no video source or not yet ready (req 9.5) */}
        <img
          src={getProxiedImageUrl(poster)}
          alt=""
          loading="lazy"
          data-preview-unavailable={!hasVideo ? 'true' : undefined}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${hasVideo ? 'opacity-0' : 'opacity-50'}`}
        />

        {/* Gradient Overlays — unchanged (req 9.7) */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/90 to-background/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-transparent to-background" />

        {/* Vignette effect */}
        <div className="absolute inset-0 shadow-[inset_0_0_200px_rgba(0,0,0,0.9)]" />

        {/* Noise texture overlay */}
        <div className="absolute inset-0 opacity-[0.02] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNhKSIgb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')]" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
