import { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import { fetchEpisodes, fetchStreamingSources, getProxiedVideoUrl, getProxiedImageUrl } from '@/lib/api';

interface VideoBackgroundProps {
  animeId: string;
  poster: string;
  children: React.ReactNode;
}

export function VideoBackground({ animeId, poster, children }: VideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  const loadRandomEpisode = useCallback(async () => {
    try {
      const episodesData = await fetchEpisodes(animeId);
      if (!episodesData?.episodes?.length) {
        setHasError(true);
        return;
      }

      // Pick a random episode
      const randomIndex = Math.floor(Math.random() * Math.min(episodesData.episodes.length, 5)); // Limit to first 5 episodes
      const randomEpisode = episodesData.episodes[randomIndex];

      // Fetch streaming sources with retry logic - hd-2 (HD Pro) is default
      let sources = null;
      const servers = ['hd-2', 'megacloud'];
      
      for (const server of servers) {
        try {
          sources = await fetchStreamingSources(randomEpisode.episodeId, server, 'sub');
          if (sources?.sources?.length) break;
        } catch {
          continue;
        }
      }
      
      if (!sources?.sources?.length) {
        setHasError(true);
        return;
      }

      const source = sources.sources[0];
      // Use the centralized proxy helper
      const proxiedUrl = getProxiedVideoUrl(source.url, sources.headers?.Referer);

      if (videoRef.current && source.isM3U8 && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          xhrSetup: (xhr) => {
            // Include Supabase anon key for function invocation
            try {
              xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY || '');
            } catch (e) {
              // Some browsers may disallow setting certain headers
            }
          },
        });

        hls.loadSource(proxiedUrl);
        hls.attachMedia(videoRef.current);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsVideoReady(true);
          if (videoRef.current) {
            videoRef.current.muted = true;
            videoRef.current.currentTime = Math.random() * 60;
            videoRef.current.play().catch(() => {});
          }
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            console.error('VideoBackground HLS error:', data.type);
            setHasError(true);
          }
        });

        hlsRef.current = hls;
      } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = proxiedUrl;
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
        setIsVideoReady(true);
      } else {
        // Fallback for non-HLS
        setHasError(true);
      }
    } catch (error) {
      console.error('Error loading video background:', error);
      setHasError(true);
    }
  }, [animeId]);

  useEffect(() => {
    loadRandomEpisode();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [loadRandomEpisode]);

  return (
    <div className="relative min-h-[70vh] md:min-h-[80vh] overflow-hidden">
      {/* Video or Poster Background */}
      <div className="absolute inset-0">
        {!hasError && (
          <video
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
              isVideoReady ? 'opacity-50' : 'opacity-0'
            }`}
            loop
            muted
            playsInline
          />
        )}
        
        {/* Fallback poster */}
        <img
          src={getProxiedImageUrl(poster)}
          alt=""
          loading="lazy"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
            isVideoReady && !hasError ? 'opacity-0' : 'opacity-50'
          }`}
        />
        
        {/* Gradient Overlays */}
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
