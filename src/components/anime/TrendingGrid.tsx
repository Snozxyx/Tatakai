import { Play, Flame } from "lucide-react";
import { memo } from "react";
import { TrendingAnime } from "@/lib/api";
import { Link, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import Hls from "hls.js";
import { buildPreferredAnimeRouteId } from "@/lib/animeIdMapping";
import { usePreviewSource } from "@/hooks/usePreviewSource";
import { Peekable } from "@/components/media/MediaQuickPeek";
import { peekFromAnime } from "@/components/media/quickPeekStore";

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

const TrendingCard = memo(function TrendingCard({ anime, spanClass }: { anime: TrendingAnime; spanClass: string }) {
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
    <Peekable
      media={peekFromAnime(
        { id: anime.id, name: anime.name, poster: anime.poster, anilistId: previewAniListId },
        routeAnimeId ? `/anime/${routeAnimeId}` : `/search?q=${encodeURIComponent(anime.name)}`,
      )}
    >
    <div
      onClick={() => {
        if (routeAnimeId) {
          navigate(`/anime/${routeAnimeId}`);
          return;
        }
        navigate(`/search?q=${encodeURIComponent(anime.name)}`);
      }}
      onMouseEnter={() => {
        // Hover previews are desktop-only — touch devices never hover.
        if (typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches) return;
        setIsHovering(true);
        if (previewError && !previewUrl) {
          setPreviewError(false);
        }
      }}
      onMouseLeave={() => {
        setIsHovering(false);
        cancelHover();
      }}
      className={`relative group rounded-3xl overflow-hidden cursor-pointer ${spanClass} border border-border/30 min-h-[200px] md:min-h-0 active:scale-[0.99]`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 300px' }}
    >
      <img
        src={getTrendingPoster(anime.poster)}
        alt={anime.name}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        className={`w-full h-full object-cover md:transition-all md:duration-700 ${
          isHovering && previewUrl ? 'opacity-0' : 'md:group-hover:scale-110'
        }`}
      />

      {/* Video Preview — desktop hover only */}
      <video
        ref={videoRef}
        className={`absolute inset-0 hidden w-full h-full object-cover transition-opacity duration-300 md:block ${
          isHovering && previewUrl ? 'opacity-100' : 'opacity-0'
        }`}
        muted
        loop
        playsInline
        preload="none"
        crossOrigin="anonymous"
      />

      {/* Loading indicator */}
      {isHovering && isLoading && (
        <div className="absolute inset-0 hidden items-center justify-center bg-black/30 z-10 md:flex">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent opacity-80 md:transition-opacity md:duration-300 md:group-hover:opacity-60" />

      <div className="absolute top-3 left-3 md:top-4 md:left-4 z-10">
        <span className="px-2.5 py-1 md:px-3 rounded-full bg-black/50 border border-white/10 text-[11px] md:text-xs font-bold uppercase tracking-wider">
          #{anime.rank} Trending
        </span>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 z-10">
        <h4 className="font-display text-lg md:text-2xl font-bold mb-1 leading-tight line-clamp-2">{anime.name}</h4>
        <div className="flex items-center justify-between">
          <p className="text-xs md:text-sm font-medium text-primary">Rank #{anime.rank}</p>
          <span className="hidden w-10 h-10 rounded-full bg-foreground text-background md:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
            <Play className="w-4 h-4 fill-background" />
          </span>
        </div>
      </div>
    </div>
    </Peekable>
  );
})

export const TrendingGrid = memo(function TrendingGrid({ animes }: TrendingGridProps) {
  const displayAnimes = animes.slice(0, 4);

  return (
    <section className="mb-14 md:mb-24" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 500px' }}>
      <div className="flex items-center justify-between mb-5 md:mb-8 px-1 md:px-2">
        <h3 className="font-display text-xl md:text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange" />
          Trending Now
        </h3>
        <Link to="/trending" className="text-sm text-muted-foreground hover:text-foreground transition-colors border-b border-transparent hover:border-foreground pb-0.5">
          View All
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 md:grid-rows-2 gap-3 md:gap-4 h-auto md:h-[600px]">
        {displayAnimes.map((anime, idx) => (
          <TrendingCard key={anime.id} anime={anime} spanClass={SPAN_CLASSES[idx]} />
        ))}
      </div>
    </section>
  );
})