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
import { Play, Plus, Check, Loader2, Star, RefreshCw } from "lucide-react";
import { MediaCardFrame } from "@/components/MediaCardFrame";
import { BlurhashImage } from "@/components/ui/blurhash-image";
import { AnimeCard as AnimeCardType, getHighQualityPoster } from "@/lib/api";
import { FeatureFlag, useFeatureFlag } from '@/core/feature-flags';
import { inferAnimeAdultFlag } from "@/lib/contentSafety";
import { splitRating } from "@/lib/mediaRating";
import { AdultBadge } from "@/components/MediaCardBadges";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo, useRef, memo } from "react";
import { useHoverPreview } from "@/hooks/useHoverPreview";
import { buildPreferredAnimeRouteId } from "@/lib/animeIdMapping";
import { useAuth } from "@/contexts/AuthContext";
import { useWatchlistItem, useAddToWatchlist, useRemoveFromWatchlist } from "@/hooks/user/useWatchlist";
import { useLongPress } from "@/hooks/ui/useLongPress";
import { openMediaQuickPeek } from "@/components/media/quickPeekStore";

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
    (String(anime.malId || '') === anime.id ? null : resolveAniListId(anime.id)) ??
    null;

  const isAdult = inferAnimeAdultFlag(anime);
  
  const { score, label } = splitRating(anime.rating);
  const routeTo = routeAnimeId
    ? `/anime/${routeAnimeId}`
    : `/search?q=${encodeURIComponent(anime.name)}`;

  const preview = useHoverPreview({
    anilistId: previewAniListId,
    malId: anime.malId,
    title: anime.name,
    enabled: showPreview,
  });

  const { data: watchlistItem, isLoading: isWatchlistLoading } = useWatchlistItem(anime.id);
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const saving = useRef(false);
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => { setSaveFailed(false); }, [anime.id]);

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
    if (saving.current || isWatchlistLoading || addToWatchlist.isPending || removeFromWatchlist.isPending) return;

    if (!user) {
      navigate('/auth');
      return;
    }

    saving.current = true;
    setSaveFailed(false);
    try {
      if (watchlistItem) await removeFromWatchlist.mutateAsync(anime.id);
      else await addToWatchlist.mutateAsync({
      animeId: anime.id,
      animeName: anime.name,
      animePoster: anime.poster,
      status: 'plan_to_watch',
    });
    } catch {
      // Mutation hooks retain their existing toast; the control offers a retry.
      setSaveFailed(true);
    } finally { saving.current = false; }
  };

  const isBusy = isWatchlistLoading || addToWatchlist.isPending || removeFromWatchlist.isPending;

  // Long-press quick peek with the card's own fields (detail enriches inside).
  const longPress = useLongPress({
    onLongPress: () => {
      if (disableClick) return;
      openMediaQuickPeek({
        kind: "anime",
        id: anime.id,
        name: anime.name,
        poster: anime.poster,
        anilistId: previewAniListId,
        type: anime.type,
        year: anime.year,
        rating: anime.rating,
        episodesSub: anime.episodes?.sub,
        episodesDub: anime.episodes?.dub,
        routeTo,
      });
    },
    disabled: disableClick,
  });

  const posterClass = `media-card-image absolute inset-0 w-full h-full object-cover ${preview.isActive ? 'opacity-0' : 'opacity-100'}`;
  return <MediaCardFrame title={anime.name} href={disableClick ? null : routeTo}
    onMouseEnter={preview.onEnter} onMouseLeave={preview.onLeave} {...longPress}
    poster={<>
      {blurhashEnabled ? <BlurhashImage src={posterCandidates[posterIndex] || '/placeholder.svg'} alt="" loading="lazy" decoding="async"
        blurhash={(anime as any).blurhash ?? undefined} className="absolute inset-0 w-full h-full" imgClassName={posterClass} onError={handlePosterError} />
        : <img src={posterCandidates[posterIndex] || '/placeholder.svg'} alt="" aria-hidden loading="lazy" decoding="async" fetchPriority="low" className={posterClass} onError={handlePosterError} />}
      {showPreview && <video ref={preview.videoRef} preload="none"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-150 ${preview.isActive ? 'opacity-100' : 'opacity-0'}`}
        muted loop playsInline crossOrigin="anonymous" onError={preview.onError} />}
      {preview.showFallback && <div aria-hidden className="media-card-preview pointer-events-none absolute inset-0 z-20 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <span className={`flex items-center justify-center bg-black/75 text-white ${preview.unavailable ? 'rounded-lg px-3 py-2 text-xs' : 'h-11 w-11 rounded-full'}`}>
          {preview.unavailable ? 'Preview unavailable' : preview.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="ml-0.5 h-5 w-5" />}
        </span>
      </div>}
    </>}
    badges={<>
      {isAdult && <AdultBadge className="absolute left-2 top-2 z-20" />}
      {score && <span className="media-card-score absolute right-2 top-2 z-20 rounded-lg bg-black/75 px-2 py-1 text-xs font-semibold text-white"><Star aria-hidden className="inline h-3 w-3 fill-amber text-amber mr-1" />{score}</span>}
    </>}
    actions={<button type="button" onClick={handleWatchlistClick} onPointerDown={event => event.stopPropagation()} disabled={isBusy} aria-busy={isBusy} aria-pressed={Boolean(watchlistItem)}
      className={`media-card-action absolute right-1 top-10 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 transition-[opacity,background-color] duration-150 ${watchlistItem ? 'bg-primary text-primary-foreground' : 'bg-black/70 text-white hover:bg-black/90'}`}
      title={saveFailed ? 'Couldn’t update watchlist. Try again.' : undefined}
      aria-label={saveFailed ? `Retry updating ${anime.name} in watchlist` : watchlistItem ? `Remove ${anime.name} from watchlist` : `Add ${anime.name} to watchlist`}>
      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : saveFailed ? <RefreshCw className="h-4 w-4" /> : watchlistItem ? <Check className="ui-save-check h-4 w-4" /> : <Plus className="h-4 w-4" />}
    </button>}
    metadata={<div className="flex flex-wrap items-center gap-x-1.5">
      <span>{anime.type || 'Anime'}</span>{anime.year && <span>· {anime.year}</span>}
      {!!anime.episodes?.sub && <span>· {anime.episodes.sub} sub</span>}
      {!!anime.episodes?.dub && <span>· {anime.episodes.dub} dub</span>}
      {label && <span>· {label}</span>}
    </div>} />;
}

export const AnimeCardWithPreview = memo(AnimeCardWithPreviewInner);
