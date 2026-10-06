import { Play, Star, Tv, BookOpen, Film } from "lucide-react";
import { memo } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { AnimeCard, getHighQualityPoster } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { AnimeCardWithPreview } from "./AnimeCardWithPreview";
import { useTheme } from "@/hooks/ui/useTheme";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { buildPreferredAnimeRouteId } from "@/lib/animeIdMapping";
import { BlurhashImage } from "@/components/ui/blurhash-image";
import { FeatureFlag, useFeatureFlag } from '@/core/feature-flags';
import { Peekable } from "@/components/media/MediaQuickPeek";
import { peekFromAnime, peekFromManga } from "@/components/media/quickPeekStore";

interface AnimeGridProps {
  animes: AnimeCard[];
  title?: string;
  icon?: React.ReactNode;
  enablePreview?: boolean;
  gridSize?: "compact" | "normal" | "large";
}

export const AnimeGrid = memo(function AnimeGrid({
  animes,
  title,
  icon,
  enablePreview = false,
  gridSize = "normal"
}: AnimeGridProps) {
  const navigate = useNavigate();
  const { isUltraLite } = useTheme();
  const isMobile = useIsMobile();
  // BlurHash canvas decode per card is main-thread CPU — skip it on phones.
  const blurhashEnabled = useFeatureFlag(FeatureFlag.BLURHASH_IMAGES) && !isMobile;
  // Mobile + ultra-lite: skip hover transforms entirely (compositor jank).

  // Grid size classes
  const gridClasses = {
    compact: "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-2",
    normal: "grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4",
    large: "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
  };

  const cardSizeClasses = {
    compact: "aspect-[3/4]",
    normal: "aspect-[2/3]",
    large: "aspect-[3/4]"
  };

  const uniqueAnimes = animes.filter((anime, index, list) => {
    const mediaType = String((anime as any).mediaType || "anime").toLowerCase();
    const key = `${mediaType}:${String(anime.id || "").trim().toLowerCase()}`;
    return index === list.findIndex((candidate) => {
      const candidateType = String((candidate as any).mediaType || "anime").toLowerCase();
      const candidateKey = `${candidateType}:${String(candidate.id || "").trim().toLowerCase()}`;
      return candidateKey === key;
    });
  });

  const getMediaIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'manga': return <BookOpen className="w-3 h-3" />;
      case 'movie': return <Film className="w-3 h-3" />;
      default: return <Tv className="w-3 h-3" />;
    }
  };

  // A dead cover URL (common on AniList relation entries) otherwise sprawls its
  // `alt` text across the card instead of covering it — swap to the placeholder.
  const handlePosterError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.dataset.fallback === '1') return;
    img.dataset.fallback = '1';
    img.src = '/placeholder.svg';
  };

  return (
    <section className="mb-14 md:mb-24" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 500px' }}>
      {title && (
        <div className="flex items-center justify-between mb-5 md:mb-8 px-1 md:px-2">
          <h3 className="font-display text-xl md:text-2xl font-semibold tracking-tight flex items-center gap-2.5">
            {icon || <Tv className="w-5 h-5 text-primary" />}
            <span className="line-clamp-1">{title}</span>
          </h3>
        </div>
      )}

      <div className={`grid ${gridClasses[gridSize]}`}>
        {uniqueAnimes.map((anime, index) => {
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

          const cardKey = `${String((anime as any).mediaType || "anime")}:${String(anime.id || "unknown")}:${index}`;
          const animateCard = !isUltraLite && !isMobile;

          if (enablePreview && !isMobile) {
            return <AnimeCardWithPreview key={cardKey} anime={anime} showPreview={true} />;
          }

          const goToCard = () => {
            const mediaType = (anime as any).mediaType || 'anime';
            const baseRoute = mediaType === 'manga' ? '/manga' : '/anime';

            if (routeAnimeId) {
              navigate(`${baseRoute}/${routeAnimeId}`);
              return;
            }
            navigate(`/search?q=${encodeURIComponent(anime.name)}`);
          };
          const cardRouteTo = (() => {
            const mediaType = (anime as any).mediaType || 'anime';
            const baseRoute = mediaType === 'manga' ? '/manga' : '/anime';
            return routeAnimeId
              ? `${baseRoute}/${routeAnimeId}`
              : `/search?q=${encodeURIComponent(anime.name)}`;
          })();

          // Phones: a plain card instead of GlassPanel. GlassPanel applies
          // `backdrop-blur-2xl`, so a grid of these forces one invisible (the
          // opaque poster covers it) backdrop-filter blur per card every scroll
          // frame — the main source of mobile jank. Mirrors the plain-card path
          // the rest of the home grids already use.
          const CardWrapper = isMobile ? 'div' : GlassPanel;
          const wrapperProps = isMobile
            ? {
                role: 'button' as const,
                tabIndex: 0,
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goToCard();
                  }
                },
                className:
                  'group relative cursor-pointer overflow-hidden rounded-[var(--radius)] border border-white/5 bg-white/[0.03] active:scale-[0.98]',
              }
            : {
                hoverEffect: animateCard,
                className:
                  'group cursor-pointer overflow-hidden active:scale-[0.98] md:transition-all md:duration-300 md:hover:z-10 md:hover:scale-[1.02]',
              };

          return (
            <Peekable
              key={cardKey}
              media={
                (anime as any).mediaType === 'manga'
                  ? peekFromManga(anime as any, cardRouteTo)
                  : peekFromAnime(anime, cardRouteTo)
              }
            >
            <CardWrapper onClick={goToCard} {...(wrapperProps as any)}>
              <div className={`relative ${cardSizeClasses[gridSize]}`} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 260px' }}>
                {blurhashEnabled ? (
                  <BlurhashImage
                    src={getHighQualityPoster(anime.poster, anime.anilistId)}
                    alt={anime.name}
                    loading="lazy"
                    decoding="async"
                    onError={handlePosterError}
                    blurhash={(anime as any).blurhash ?? undefined}
                    imgClassName={`w-full h-full object-cover ${animateCard ? 'transition-all duration-700 group-hover:scale-105 group-hover:brightness-110' : ''}`}
                  />
                ) : (
                  <img
                    src={getHighQualityPoster(anime.poster, anime.anilistId)}
                    alt={anime.name}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    onError={handlePosterError}
                    className={`w-full h-full object-cover ${animateCard ? 'transition-all duration-700 group-hover:scale-105 group-hover:brightness-110' : ''}`}
                  />
                )}

                {/* Overlay gradients */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                {animateCard && <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/10" />}

                {/* Badges */}
                {anime.type && (
                  <div className="absolute top-2.5 left-2.5 md:top-3 md:left-3 px-2 py-1 rounded-md bg-primary/90 text-primary-foreground text-xs font-bold flex items-center gap-1 shadow-lg">
                    {getMediaIcon(anime.type)}
                    <span className="uppercase tracking-wider">{anime.type}</span>
                  </div>
                )}

                {anime.rating && (
                  <div className="absolute top-2.5 right-2.5 md:top-3 md:right-3 flex items-center gap-1 px-2 py-1 rounded-md bg-black/50 border border-white/10 text-xs font-bold text-white">
                    <Star className="w-3 h-3 fill-amber text-amber" />
                    {anime.rating}
                  </div>
                )}

                {/* Play button — desktop hover only (no backdrop-blur on touch) */}
                {animateCard && (
                <div className="absolute inset-0 hidden items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 md:flex">
                  <div className="w-14 h-14 rounded-full bg-white/20 border border-white/20 flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform duration-300">
                    <Play className="w-6 h-6 fill-white text-white ml-0.5" />
                  </div>
                </div>
                )}

                {/* Content */}
                <div className="absolute bottom-0 left-0 right-0 p-3 pt-8">
                  <h4 className="font-bold text-sm leading-tight line-clamp-2 drop-shadow-md md:group-hover:text-primary md:transition-colors md:duration-300">
                    {anime.name}
                  </h4>

                  <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                    {(anime.episodes?.sub ?? 0) > 0 && (
                      <span className="flex items-center gap-1 bg-black/50 px-1.5 py-0.5 rounded-md border border-white/10">
                        SUB {anime.episodes.sub}
                      </span>
                    )}
                    {(anime.episodes?.dub ?? 0) > 0 && (
                      <span className="flex items-center gap-1 bg-black/50 px-1.5 py-0.5 rounded-md border border-white/10">
                        DUB {anime.episodes.dub}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardWrapper>
            </Peekable>
          );
        })}
      </div>
    </section>
  );
})