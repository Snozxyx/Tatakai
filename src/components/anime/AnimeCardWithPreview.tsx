import { Play, Star, Plus, Check, Loader2, ShieldAlert } from "lucide-react";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { BlurhashImage } from "@/components/ui/blurhash-image";
import { AnimeCard as AnimeCardType, getHighQualityPoster } from "@/lib/api";
import { FeatureFlag, useFeatureFlag } from '@/core/feature-flags';
import { inferAnimeAdultFlag } from "@/lib/contentSafety";
import { useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, useMemo } from "react";
import { usePreviewSource } from "@/hooks/usePreviewSource";
import { buildPreferredAnimeRouteId } from "@/lib/animeIdMapping";
import Hls from "hls.js";
import { useAuth } from "@/contexts/AuthContext";
import { useWatchlistItem, useAddToWatchlist, useRemoveFromWatchlist } from "@/hooks/user/useWatchlist";

interface AnimeCardWithPreviewProps {
  anime: AnimeCardType;
  showPreview?: boolean;
  disableClick?: boolean;
}

const resolveAniListId = (value: unknown): number | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const prefixed = raw.match(/^anilist[:_-]?(\d+)$/i);
  if (prefixed?.[1]) return Number(prefixed[1]);

  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

export function AnimeCardWithPreview({ anime, showPreview = true, disableClick = false }: AnimeCardWithPreviewProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const blurhashEnabled = useFeatureFlag(FeatureFlag.BLURHASH_IMAGES);

  const [isHovering, setIsHovering] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [posterIndex, setPosterIndex] = useState(0);

  const routeAnimeId = buildPreferredAnimeRouteId({
    id: anime.id,
    name: anime.name,
    malId: anime.malId,
    malID: (anime as any)?.malID,
    mal_id: (anime as any)?.mal_id,
    anilistId: anime.anilistId,
    anilistID: (anime as any)?.anilistID,
    anilist_id: (anime as any)?.anilist_id,
  });
  const previewAniListId =
    anime.anilistId ??
    (anime as any)?.anilistID ??
    (anime as any)?.anilist_id ??
    resolveAniListId(anime.id) ??
    null;

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const { source, loading, startHover, cancelHover } = usePreviewSource();

  const { data: watchlistItem, isLoading: isWatchlistLoading } = useWatchlistItem(anime.id);
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();

  const posterCandidates = useMemo(() => {
    const directPoster = anime.poster?.trim() || "";
    const directLargeAniList = directPoster
      .replace('/cover/medium/', '/cover/large/')
      .replace(/\/banner\/(small|medium)\//, '/banner/large/');

    return [
      directLargeAniList,
      directPoster,
      getHighQualityPoster(directPoster, previewAniListId ?? undefined),
      '/placeholder.svg',
    ].filter((value, index, arr) => Boolean(value) && arr.indexOf(value) === index);
  }, [anime.poster, previewAniListId]);

  useEffect(() => {
    setPosterIndex(0);
  }, [anime.id, anime.poster, previewAniListId]);

  useEffect(() => {
    if (!isHovering || !showPreview || !previewAniListId) {
      if (!isHovering) cancelHover();
      return;
    }

    startHover(previewAniListId, [anime.name]);
  }, [anime.name, cancelHover, isHovering, previewAniListId, showPreview, startHover]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const streamUrl = source?.streamUrl ?? null;
    setPreviewUrl(streamUrl);
    setIsLoadingPreview(Boolean(isHovering && loading));

    if (!isHovering || !showPreview || !streamUrl) {
      if (!streamUrl) setPreviewError(true);
      return;
    }

    setPreviewError(false);

    const applyPreviewTimestamp = () => {
      if (source?.previewTimestampSec && Number.isFinite(source.previewTimestampSec)) {
        try {
          video.currentTime = source.previewTimestampSec;
        } catch {
          // Ignore seek failures for unseekable sources.
        }
      }
    };

    const playVideo = () => {
      void video.play().catch(() => {});
    };

    if (source?.isHls) {
      if (!Hls.isSupported()) {
        setPreviewError(true);
        return;
      }

      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        applyPreviewTimestamp();
        playVideo();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setPreviewError(true);
      });
      return;
    }

    video.src = streamUrl;
    video.addEventListener('loadedmetadata', () => {
      applyPreviewTimestamp();
      playVideo();
    }, { once: true });
    playVideo();
  }, [isHovering, loading, showPreview, source]);

  const handlePosterError = () => {
    setPosterIndex((current) => {
      if (current >= posterCandidates.length - 1) return current;
      return current + 1;
    });
  };

  const handleWatchlistClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!user) {
      navigate('/auth');
      return;
    }

    if (watchlistItem) {
      await removeFromWatchlist.mutateAsync(anime.id);
      return;
    }

    await addToWatchlist.mutateAsync({
      animeId: anime.id,
      animeName: anime.name,
      animePoster: anime.poster,
      status: 'plan_to_watch',
    });
  };

  useEffect(() => {
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, []);

  return (
    <GlassPanel
      hoverEffect
      className="group cursor-pointer overflow-hidden rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500"
      onClick={() => {
        if (disableClick) return;
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
    >
      <div className="relative aspect-[3/4]">
        {blurhashEnabled ? (
          <BlurhashImage
            src={posterCandidates[posterIndex] || '/placeholder.svg'}
            alt={anime.name}
            loading="lazy"
            decoding="async"
            blurhash={(anime as any).blurhash ?? undefined}
            imgClassName={`w-full h-full object-cover transition-all duration-700 filter brightness-[0.98] contrast-[1.05] saturate-[1.1] md:group-hover:contrast-[1.1] md:group-hover:saturate-[1.2] ${isHovering && previewUrl ? 'opacity-0' : 'opacity-100 group-hover:scale-110 group-hover:brightness-110'}`}
            onError={handlePosterError}
            style={{ imageRendering: 'high-quality' as any }}
          />
        ) : (
          <img
            src={posterCandidates[posterIndex] || '/placeholder.svg'}
            alt={anime.name}
            loading="lazy"
            decoding="async"
            className={`w-full h-full object-cover transition-all duration-700 filter brightness-[0.98] contrast-[1.05] saturate-[1.1] md:group-hover:contrast-[1.1] md:group-hover:saturate-[1.2] ${isHovering && previewUrl ? 'opacity-0' : 'opacity-100 group-hover:scale-110 group-hover:brightness-110'}`}
            onError={handlePosterError}
            style={{ imageRendering: 'high-quality' as any }}
          />
        )}

        {showPreview && (
          <video
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isHovering && previewUrl ? 'opacity-100' : 'opacity-0'}`}
            muted
            loop
            playsInline
            crossOrigin="anonymous"
            onError={() => setPreviewError(true)}
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent opacity-90 group-hover:opacity-100 transition-opacity" />

        {inferAnimeAdultFlag(anime) && (
          <div className="absolute top-3 left-3 z-20 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600/90 text-white font-black text-xs shadow-lg shadow-rose-600/40 border border-rose-400/50 backdrop-blur-md animate-pulse">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-100" />
            18+
          </div>
        )}

        {anime.type && !inferAnimeAdultFlag(anime) && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-primary/90 backdrop-blur-sm text-primary-foreground text-xs font-bold shadow-lg">
            {anime.type}
          </div>
        )}

        {anime.rating && (
          <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-background/90 backdrop-blur-sm text-xs font-bold shadow-lg border border-white/10">
            <Star className="w-3.5 h-3.5 fill-amber text-amber" />
            {anime.rating}
          </div>
        )}

        <button
          onClick={handleWatchlistClick}
          disabled={isWatchlistLoading || addToWatchlist.isPending || removeFromWatchlist.isPending}
          className={`absolute top-3 right-3 ${anime.rating ? 'top-12' : ''} w-9 h-9 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 shadow-lg ${watchlistItem ? 'bg-primary text-primary-foreground' : 'bg-background/90 backdrop-blur-sm text-foreground hover:bg-primary hover:text-primary-foreground border border-white/10'}`}
          title={watchlistItem ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          {(isWatchlistLoading || addToWatchlist.isPending || removeFromWatchlist.isPending) ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : watchlistItem ? (
            <Check className="w-4 h-4" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
        </button>

        {(!previewUrl || previewError || isLoadingPreview) && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            {isLoadingPreview ? (
              <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-foreground/95 flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform shadow-2xl">
                <Play className="w-6 h-6 fill-background text-background ml-0.5" />
              </div>
            )}
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h4 className="font-bold text-sm line-clamp-2 group-hover:text-primary transition-colors drop-shadow-lg">
            {anime.name}
          </h4>
          <div className="flex gap-2 mt-1.5 text-xs text-muted-foreground">
            <span className="px-2 py-0.5 rounded-md bg-background/50 backdrop-blur-sm">SUB {anime.episodes?.sub || 0}</span>
            {(anime.episodes?.dub || 0) > 0 && <span className="px-2 py-0.5 rounded-md bg-background/50 backdrop-blur-sm">DUB {anime.episodes?.dub || 0}</span>}
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}


