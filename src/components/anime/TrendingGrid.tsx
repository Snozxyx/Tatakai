import { Play, Flame } from "lucide-react";
import { TrendingAnime, getProxiedVideoUrl } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { fetchEpisodes, fetchStreamingSources } from "@/lib/api";
import Hls from "hls.js";

interface TrendingGridProps {
  animes: TrendingAnime[];
}

const SPAN_CLASSES = [
  "col-span-1 md:col-span-2 row-span-2",
  "col-span-1 row-span-1",
  "col-span-1 row-span-2",
  "col-span-1 row-span-1",
];

type CachedTrendingPreview = {
  url: string;
  isM3U8: boolean;
  cachedAt: number;
};

const TRENDING_PREVIEW_CACHE_TTL = 20 * 60 * 1000;
const trendingPreviewCache = new Map<string, CachedTrendingPreview>();

const getTrendingPoster = (poster: string) => {
  if (!poster) return '/placeholder.svg';
  return poster
    .replace('/cover/medium/', '/cover/large/')
    .replace(/\/banner\/(small|medium)\//, '/banner/large/');
};

function TrendingCard({ anime, spanClass }: { anime: TrendingAnime; spanClass: string }) {
  const navigate = useNavigate();
  const [isHovering, setIsHovering] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewM3U8, setIsPreviewM3U8] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const cached = trendingPreviewCache.get(anime.id);
    if (!cached) return;

    if (Date.now() - cached.cachedAt > TRENDING_PREVIEW_CACHE_TTL) {
      trendingPreviewCache.delete(anime.id);
      return;
    }

    setPreviewUrl(cached.url);
    setIsPreviewM3U8(cached.isM3U8);
  }, [anime.id]);

  // Cleanup HLS on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isHovering || previewUrl || previewError) return;

    hoverTimeoutRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const episodes = await fetchEpisodes(anime.id);
        if (episodes.episodes.length > 0) {
          // Pick a random episode for preview
          const randomEpisode = episodes.episodes[Math.floor(Math.random() * episodes.episodes.length)];
          let sources: Awaited<ReturnType<typeof fetchStreamingSources>> | null = null;
          const preferredServers = ["hd-2", "hd-1", "hd-3"];
          for (const server of preferredServers) {
            try {
              const candidate = await fetchStreamingSources(randomEpisode.episodeId, server, "sub");
              if (candidate?.sources?.length) {
                sources = candidate;
                break;
              }
            } catch {
              // Try next server.
            }
          }

          if (sources?.sources?.length) {
            const source = sources.sources[0];
            const proxiedUrl = getProxiedVideoUrl(source.url, sources.headers?.Referer);
            setPreviewUrl(proxiedUrl);
            setIsPreviewM3U8(Boolean(source.isM3U8));
            trendingPreviewCache.set(anime.id, {
              url: proxiedUrl,
              isM3U8: Boolean(source.isM3U8),
              cachedAt: Date.now(),
            });
          } else {
            setPreviewError(true);
          }
        }
      } catch (error) {
        setPreviewError(true);
      } finally {
        setIsLoading(false);
      }
    }, 220);

    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, [isHovering, anime.id, previewUrl, previewError]);

  useEffect(() => {
    if (!previewUrl || !videoRef.current) return;

    const videoEl = videoRef.current;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (isPreviewM3U8) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 8,
          xhrSetup: () => {},
        });

        hls.loadSource(previewUrl);
        hls.attachMedia(videoEl);
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) setPreviewError(true);
        });

        hlsRef.current = hls;
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = previewUrl;
      } else {
        setPreviewError(true);
      }
    } else {
      videoEl.src = previewUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [previewUrl, isPreviewM3U8]);

  useEffect(() => {
    if (videoRef.current) {
      if (isHovering && previewUrl) {
        if (hlsRef.current) {
          hlsRef.current.startLoad(-1);
        }
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
        if (hlsRef.current && !isHovering) {
          hlsRef.current.stopLoad();
        }
      }
    }
  }, [isHovering, previewUrl]);

  return (
    <div 
      onClick={() => navigate(`/anime/${anime.id}`)}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={`relative group rounded-3xl overflow-hidden cursor-pointer ${spanClass} border border-border/30 min-h-[200px] md:min-h-0`}
    >
      <img 
        src={getTrendingPoster(anime.poster)} 
        alt={anime.name} 
        className={`w-full h-full object-cover transition-all duration-700 ${
          isHovering && previewUrl ? 'opacity-0' : 'group-hover:scale-110'
        }`}
      />
      
      {/* Video Preview */}
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          isHovering && previewUrl ? 'opacity-100' : 'opacity-0'
        }`}
        muted
        loop
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
      />

      {/* Loading indicator */}
      {isHovering && isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-60" />
      
      <div className="absolute top-4 left-4 z-10">
        <span className="px-3 py-1 rounded-full bg-foreground/20 backdrop-blur-md border border-foreground/10 text-xs font-bold uppercase tracking-wider">
          #{anime.rank} Trending
        </span>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-6 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300 z-10">
        <h4 className="font-display text-xl md:text-2xl font-bold mb-1 leading-tight line-clamp-2">{anime.name}</h4>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-primary">Rank #{anime.rank}</p>
          <button className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 delay-75">
            <Play className="w-4 h-4 fill-background" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function TrendingGrid({ animes }: TrendingGridProps) {
  const displayAnimes = animes.slice(0, 4);

  return (
    <section className="mb-24">
      <div className="flex items-center justify-between mb-8 px-2">
        <h3 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange" />
          Trending Now
        </h3>
        <a href="/collections" className="text-sm text-muted-foreground hover:text-foreground transition-colors border-b border-transparent hover:border-foreground pb-0.5">
          View All Collection
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 grid-rows-2 gap-4 h-auto md:h-[600px]">
        {displayAnimes.map((anime, idx) => (
          <TrendingCard key={anime.id} anime={anime} spanClass={SPAN_CLASSES[idx]} />
        ))}
      </div>
    </section>
  );
}