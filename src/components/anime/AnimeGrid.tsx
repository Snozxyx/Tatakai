import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { Star, Tv } from "lucide-react";
import { memo, useMemo } from "react";
import { MediaCardFrame } from "@/components/MediaCardFrame";
import { splitRating } from "@/lib/mediaRating";
import { AdultBadge } from "@/components/MediaCardBadges";
import { inferAnimeAdultFlag } from "@/lib/contentSafety";
import { AnimeCard, getHighQualityPoster } from "@/lib/api";
import { AnimeCardWithPreview } from "./AnimeCardWithPreview";
import { resolveTatakaiAnimeViewId, TatakaiAnimeViews } from '@/components/media/TatakaiAnimeViews';
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
  enablePreview = true,
  gridSize = "normal"
}: AnimeGridProps) {
  useUiTranslation();
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

  const uniqueAnimes = useMemo(() => {
    const seen = new Set<string>();
    return animes.filter(anime => {
      const mediaType = String((anime as any).mediaType || "anime").toLowerCase();
      const key = `${mediaType}:${String(anime.id || "").trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [animes]);

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

      <div data-mobile-poster-grid className={`grid ${gridClasses[gridSize]}`}>
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

          if (enablePreview && !isMobile && String((anime as any).mediaType || 'anime').toLowerCase() !== 'manga') {
            return <AnimeCardWithPreview key={cardKey} anime={anime} showPreview={true} />;
          }

          const cardRouteTo = (() => {
            const mediaType = (anime as any).mediaType || 'anime';
            const baseRoute = mediaType === 'manga' ? '/manga' : '/anime';
            return routeAnimeId
              ? `${baseRoute}/${routeAnimeId}`
              : `/search?q=${encodeURIComponent(anime.name)}`;
          })();

          const { score, label } = splitRating(anime.rating);
          const animeViewId = String((anime as any).mediaType || 'anime').toLowerCase() === 'anime'
            ? resolveTatakaiAnimeViewId(anime.id, anime.anilistId)
            : undefined;
          const posterClass = 'media-card-image h-full w-full object-cover';
          return <Peekable key={cardKey} media={(anime as any).mediaType === 'manga' ? peekFromManga(anime as any, cardRouteTo) : peekFromAnime(anime, cardRouteTo)}>
            <MediaCardFrame title={anime.name} href={cardRouteTo}
              poster={blurhashEnabled
                ? <BlurhashImage src={getHighQualityPoster(anime.poster, anime.anilistId)} alt="" loading="lazy" decoding="async" onError={handlePosterError} blurhash={(anime as any).blurhash ?? undefined} className="h-full w-full" imgClassName={posterClass} />
                : <img src={getHighQualityPoster(anime.poster, anime.anilistId)} alt="" aria-hidden loading="lazy" decoding="async" onError={handlePosterError} className={posterClass} />}
              badges={<>
                {inferAnimeAdultFlag(anime) && <AdultBadge className="absolute left-2 top-2 z-20" />}
                {score && <span className="media-card-score absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-lg bg-black/75 px-2 py-1 text-xs font-semibold text-white"><Star aria-hidden className="h-3 w-3 fill-amber text-amber" />{score}</span>}
              </>}
              metadata={<div className="flex flex-wrap gap-x-1.5"><span>{anime.type || uiI18n.t('app.anime_f1b32a19')}</span>
                {anime.year && <span>· {anime.year}</span>}{!!anime.episodes?.sub && <span>· {anime.episodes.sub} {uiI18n.t('app.sub_5d85613a')}</span>}{!!anime.episodes?.dub && <span>· {anime.episodes.dub} {uiI18n.t('app.dub_1ca4b285')}</span>}{label && <span>· {label}</span>}
                {animeViewId && <TatakaiAnimeViews animeId={animeViewId} />}
              </div>} />
          </Peekable>;
        })}
      </div>
    </section>
  );
})
