/**
 * The home/collection anime card, with the hover video preview
 * (docs/Plans.md §2 — "Cards (improve polish and consistency)").
 *
 * Navigation is a real anchor overlaying the poster rather than an `onClick` on
 * the panel, which is a `div`: the old version could not be reached by keyboard,
 * announced nothing to a screen reader, and could not be ctrl/middle-clicked
 * into a new tab. Badges and the rating split come from the shared card layer so
 * this and `UnifiedMediaCard` stay in step, and the preview itself is
 * `useHoverPreview` — the same hook the v6 `PosterCard` uses.
 */
import { Play, Plus, Check, Loader2 } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { BlurhashImage } from "@/components/ui/blurhash-image";
import { AnimeCard as AnimeCardType, getHighQualityPoster } from "@/lib/api";
import { FeatureFlag, useFeatureFlag } from '@/core/feature-flags';
import { inferAnimeAdultFlag } from "@/lib/contentSafety";
import { splitRating } from "@/lib/mediaRating";
import { AdultBadge, MetaBadge, ScoreBadge } from "@/components/MediaCardBadges";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo, memo } from "react";
import { useHoverPreview } from "@/hooks/useHoverPreview";
import { buildPreferredAnimeRouteId } from "@/lib/animeIdMapping";
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

function AnimeCardWithPreviewInner({ anime, showPreview = true, disableClick = false }: AnimeCardWithPreviewProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const blurhashEnabled = useFeatureFlag(FeatureFlag.BLURHASH_IMAGES);

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

  const isAdult = inferAnimeAdultFlag(anime);
  
  const { score, label } = splitRating(anime.rating);
  const routeTo = routeAnimeId
    ? `/anime/${routeAnimeId}`
    : `/search?q=${encodeURIComponent(anime.name)}`;

  const preview = useHoverPreview({
    anilistId: previewAniListId,
    title: anime.name,
    enabled: showPreview,
  });

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

  const handlePosterError = () => {
    setPosterIndex((current) => {
      if (current >= posterCandidates.length - 1) return current;
      return current + 1;
    });
  };

  const handleWatchlistClick = async (e: React.MouseEvent) => {
    e.preventDefault(); 
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

  const isBusy = isWatchlistLoading || addToWatchlist.isPending || removeFromWatchlist.isPending;

  // Optimized class: absolute inset-0 guarantees it stretches to the container's bounds
  const posterClass = `absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-[0.33,1,0.68,1] ${
    preview.isActive ? 'opacity-0 scale-105' : 'opacity-100 group-hover:scale-110'
  }`;

  return (
    <GlassPanel
      hoverEffect={false}
      // Fixed layout: w-full h-full aspect-[2/3] p-0
      // Optimized: removed transition-all, removed heavy shadows on hover
      className="tk-pressable group relative overflow-hidden rounded-xl border border-white/5 bg-neutral-900 transition-[border-color] duration-300 hover:border-white/20 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background w-full h-full aspect-[2/3] p-0"
      onMouseEnter={preview.onEnter}
      onMouseLeave={preview.onLeave}
    >
      {/* Layer 1: Media Container - Absolutely positioned to guarantee edge-to-edge coverage */}
      <div className="absolute inset-0 z-0 bg-neutral-900/50">
        {blurhashEnabled ? (
          <BlurhashImage
            src={posterCandidates[posterIndex] || '/placeholder.svg'}
            alt={anime.name}
            loading="lazy"
            decoding="async"
            blurhash={(anime as any).blurhash ?? undefined}
            className="absolute inset-0 w-full h-full"
            imgClassName={posterClass}
            onError={handlePosterError}
            style={{ imageRendering: 'high-quality' as any }}
          />
        ) : (
          <img
            src={posterCandidates[posterIndex] || '/placeholder.svg'}
            alt={anime.name}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className={posterClass}
            onError={handlePosterError}
            style={{ imageRendering: 'high-quality' as any }}
          />
        )}

        {/* Optimized: Only mount the video element if the user actually hovers */}
        {showPreview && (preview.isActive || preview.isLoading) && (
          <video
            ref={preview.videoRef}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ease-out ${preview.isActive ? 'opacity-100' : 'opacity-0'}`}
            muted
            loop
            playsInline
            crossOrigin="anonymous"
            onError={preview.onError}
          />
        )}
      </div>

      {/* Layer 2: Gradient Overlay (Solid to transparent, no blurs) */}
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-90 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none" />

      {/* Layer 3: Top Left Badges - Replaced backdrop-blur with fast solid fills */}
      {isAdult && <AdultBadge className="absolute top-2.5 left-2.5 z-20 shadow-sm" />}
      {anime.type && !isAdult && (
        <div className="absolute top-2.5 left-2.5 z-20 px-2 py-0.5 rounded-sm bg-black/60 border border-white/10 text-white text-[10px] font-bold tracking-wider uppercase shadow-sm">
          {anime.type}
        </div>
      )}

      {/* Layer 4: Top Right Score - Fast solid fill */}
      {score && (
        <ScoreBadge
          score={score}
          className="absolute top-2.5 right-2.5 z-20 rounded-sm border border-white/10 bg-black/60 px-2 py-1 text-xs font-bold text-white shadow-sm"
        />
      )}

      {/* Layer 5: Watchlist Button - Specific transitions instead of transition-all */}
      <button
        onClick={handleWatchlistClick}
        disabled={isBusy}
        className={`absolute right-2.5 z-40 ${
          score ? 'top-11' : 'top-2.5'
        } flex h-8 w-8 items-center justify-center rounded-full transition-[opacity,transform,background-color,border-color] duration-300 ease-out opacity-0 -translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0 ${
          watchlistItem
            ? 'bg-primary border border-primary text-primary-foreground shadow-lg shadow-primary/20'
            : 'bg-black/60 text-white border border-white/20 hover:bg-white hover:text-black shadow-sm'
        }`}
        title={watchlistItem ? 'Remove from watchlist' : 'Add to watchlist'}
        aria-label={watchlistItem ? `Remove ${anime.name} from watchlist` : `Add ${anime.name} to watchlist`}
      >
        {isBusy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : watchlistItem ? (
          <Check className="w-4 h-4" />
        ) : (
          <Plus className="w-4 h-4" />
        )}
      </button>

      {/* Layer 6: Center Play Indicator - Removed heavy blur, replaced with semi-transparent solid */}
      {preview.showFallback && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          {preview.isLoading ? (
            <Loader2 className="w-10 h-10 animate-spin text-white drop-shadow-md" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 border border-white/20 text-white transition-transform duration-300 transform scale-90 group-hover:scale-100 shadow-2xl">
              <Play className="h-6 w-6 fill-white ml-1" />
            </div>
          )}
        </div>
      )}

      {/* Layer 7: Bottom Text & Meta Info - Fast solid fills */}
      <div className="absolute bottom-0 inset-x-0 z-20 flex flex-col justify-end p-3.5 pt-12 pointer-events-none">
        <h3 className="text-sm font-semibold leading-tight text-white transition-colors duration-200 group-hover:text-white line-clamp-2 mb-2 drop-shadow-md antialiased">
          {anime.name}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {(anime.episodes?.dub || 0) > 0 && (
            <MetaBadge className="bg-primary/60 text-primary-foreground border border-primary/30 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm shadow-sm">
              Mic {anime.episodes?.dub}
            </MetaBadge>
          )}
          {label && (
            <MetaBadge className="bg-black/60 text-white/90 border border-white/10 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm shadow-sm">
              {label}
            </MetaBadge>
          )}
        </div>
      </div>

      {/* Layer 8: Semantic Link Overlay */}
      {!disableClick && (
        <Link
          to={routeTo}
          aria-label={anime.name}
          className="absolute inset-0 z-30 focus-visible:outline-none"
        />
      )}
    </GlassPanel>
  );
}

// Memoized to prevent re-renders of off-screen cards during feed updates
export const AnimeCardWithPreview = memo(AnimeCardWithPreviewInner);