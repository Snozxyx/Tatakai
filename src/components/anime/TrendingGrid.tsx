import { Play, Flame } from "lucide-react";
import { TrendingAnime } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import Hls from "hls.js";
import { buildPreferredAnimeRouteId } from "@/lib/animeIdMapping";
import { usePreviewSource } from "@/hooks/usePreviewSource";

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

const resolveAniListId = (value: unknown): number | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const prefixed = raw.match(/^anilist[:_-]?(\d+)$/i);
  if (prefixed?.[1]) return Number(prefixed[1]);

  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const getTrendingPoster = (poster: string) => {
  if (!poster) return '/placeholder.svg';
  return poster
    .replace('/cover/medium/', '/cover/large/')
    .replace(/\/banner\/(small|medium)\//, '/banner/large/');
};

function TrendingCard({ anime, spanClass }: { anime: TrendingAnime; spanClass: string }) {
  const navigate = useNavigate();
  const routeAnimeId = buildPreferredAnimeRouteId({
    id: anime.id,
    name: anime.name,
    malId: (anime as any)?.malId ?? (anime as any)?.malID ?? (anime as any)?.mal_id,
    anilistId: (anime as any)?.anilistId ?? (anime as any)?.anilistID ?? (anime as any)?.anilist_id,
  });
  const previewAnimeId = routeAnimeId || String(anime.id || "").trim();
  const previewAniListId =
    (anime as any)?.anilistId ??
    (anime as any)?.anilistID ??
    (anime as any)?.anilist_id ??
    resolveAniListId(anime.id) ??
    null;
  const [isHovering, setIsHovering] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewM3U8, setIsPreviewM3U8] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { source, loading, startHover, cancelHover } = usePreviewSource();

  useEffect(() => {
    if (!previewAnimeId) return;

    const cached = trendingPreviewCache.get(previewAnimeId);
    if (!cached) return;

    if (Date.now() - cached.cachedAt > TRENDING_PREVIEW_CACHE_TTL) {
      trendingPreviewCache.delete(previewAnimeId);
      return;
    }

    setPreviewUrl(cached.url);
    setIsPreviewM3U8(cached.isM3U8);
  }, [previewAnimeId]);

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
    if (!isHovering || !previewAniListId) {
      if (!isHovering) cancelHover();
      return;
    }

    startHover(previewAniListId, [anime.name]);
  }, [anime.name, cancelHover, isHovering, previewAniListId, startHover]);

  useEffect(() => {
    const streamUrl = source?.streamUrl ?? null;

    if (!streamUrl || !videoRef.current) {
      if (isHovering && !loading && !previewUrl) {
        setPreviewError(true);
      }
      setPreviewUrl(null);
      setIsPreviewM3U8(false);
      return;
    }

    setPreviewError(false);
    setPreviewUrl(streamUrl);
    setIsPreviewM3U8(Boolean(source?.isHls));
    trendingPreviewCache.set(previewAnimeId, {
      url: streamUrl,
      isM3U8: Boolean(source?.isHls),
      cachedAt: Date.now(),
    });
  }, [isHovering, loading, previewAnimeId, previewUrl, source]);

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

  useEffect(() => {
    setIsLoading(Boolean(isHovering && loading && !previewUrl));
  }, [isHovering, loading, previewUrl]);

  return (
    <div 
      onClick={() => {
        if (routeAnimeId) {
          navigate(`/anime/${routeAnimeId}`);
          return;
        }
        navigate(`/search?q=${encodeURIComponent(anime.name)}`);
      }}
      onMouseEnter={() => {
        setIsHovering(true);
        if (previewError && !previewUrl) {
          setPreviewError(false);
        }
      }}
      onMouseLeave={() => {
        setIsHovering(false);
        cancelHover();
      }}
      className={`relative group rounded-3xl overflow-hidden cursor-pointer ${spanClass} border border-border/30 min-h-[200px] md:min-h-0`}
    >
      <img 
        src={getTrendingPoster(anime.poster)} 
        alt={anime.name} 
        loading="lazy"
        decoding="async"
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