import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { useInfiniteHomeSections } from '@/hooks/useInfiniteHomeSections';
import { useHomeData } from '@/hooks/useAnimeData';
import { getHighQualityPoster } from '@/lib/api';
import { buildPreferredAnimeRouteId } from '@/lib/animeIdMapping';

function MobileCard({ anime }: { anime: any }) {
  const navigate = useNavigate();

  const routeId = buildPreferredAnimeRouteId({
    id: anime.id,
    name: anime.name,
    malId: anime.malId,
    malID: anime?.malID,
    mal_id: anime?.mal_id,
    anilistId: anime.anilistId,
    anilistID: anime?.anilistID,
    anilist_id: anime?.anilist_id,
  });

  return (
    <button
      type="button"
      onClick={() => {
        if (routeId) {
          navigate(`/anime/${routeId}`);
          return;
        }
        navigate(`/search?q=${encodeURIComponent(anime.name || 'anime')}`);
      }}
      className="w-full text-left"
    >
      <GlassPanel className="overflow-hidden border-white/10 bg-white/5">
        <div className="relative aspect-[3/4]">
          <img
            src={getHighQualityPoster(anime.poster || '', anime.anilistId)}
            alt={anime.name || 'Anime'}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={(event) => {
              const image = event.currentTarget;
              if (image.dataset.fallbackStage === 'placeholder') return;
              if (image.dataset.fallbackStage !== 'direct' && anime.poster) {
                image.dataset.fallbackStage = 'direct';
                image.src = anime.poster;
                return;
              }
              image.dataset.fallbackStage = 'placeholder';
              image.src = '/placeholder.svg';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <h4 className="line-clamp-2 text-sm font-bold text-white">{anime.name}</h4>
            <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="rounded-md bg-background/60 px-2 py-0.5">SUB {anime.episodes?.sub || 0}</span>
              {(anime.episodes?.dub || 0) > 0 && (
                <span className="rounded-md bg-background/60 px-2 py-0.5">DUB {anime.episodes?.dub || 0}</span>
              )}
            </div>
          </div>
        </div>
      </GlassPanel>
    </button>
  );
}

export function MobileInfiniteHomeSections() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteHomeSections();
  const { data: homeData } = useHomeData();
  const bootstrapAttemptsRef = useRef(0);

  const sections = data?.pages.flatMap((page) => page.sections) || [];

  const fallbackSection = useMemo(() => {
    const fallbackAnimes = [
      ...(homeData?.mostPopularAnimes || []).slice(0, 8),
      ...(homeData?.latestEpisodeAnimes || []).slice(0, 8),
    ];

    if (fallbackAnimes.length === 0) return null;

    const deduped = Array.from(
      new Map(fallbackAnimes.map((anime) => [String(anime.id || anime.name), anime])).values()
    ).slice(0, 12);

    return {
      id: 'mobile-fallback-discover',
      title: 'Discover Picks',
      animes: deduped,
    };
  }, [homeData?.latestEpisodeAnimes, homeData?.mostPopularAnimes]);

  const visibleSections = sections.length > 0 ? sections : fallbackSection ? [fallbackSection] : [];

  useEffect(() => {
    if (isLoading || isFetchingNextPage) return;
    if (!hasNextPage) return;
    if (sections.length > 0) return;
    if (bootstrapAttemptsRef.current >= 4) return;

    bootstrapAttemptsRef.current += 1;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, sections.length]);

  return (
    <section className="mt-12 pb-28">
      <div className="mb-6 px-2">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-primary/30 bg-primary/15 p-3">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-3xl font-black tracking-tight text-white">Discover More</h2>
            <p className="text-sm text-muted-foreground">Mobile stream of infinite anime picks</p>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-3 px-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="aspect-[3/4] animate-pulse rounded-2xl border border-white/10 bg-white/5" />
          ))}
        </div>
      )}

      {error && (
        <div className="px-2">
          <GlassPanel className="border-red-500/30 bg-red-500/10 p-5 text-center">
            <p className="mb-3 text-sm font-semibold text-white">Discover feed failed to load</p>
            <Button
              onClick={() => {
                bootstrapAttemptsRef.current = 0;
                void fetchNextPage();
              }}
              variant="outline"
              className="rounded-xl border-red-400/40 bg-red-500/10 text-xs font-bold uppercase tracking-widest"
            >
              Retry
            </Button>
          </GlassPanel>
        </div>
      )}

      {visibleSections.map((section: any) => (
        <div key={section.id} className="mb-10">
          <div className="mb-4 flex items-center justify-between px-2">
            <h3 className="line-clamp-1 pr-2 text-xl font-black tracking-tight text-white">{section.title}</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 px-2">
            {(section.animes || []).slice(0, 12).map((anime: any) => (
              <MobileCard key={anime.id || anime.name} anime={anime} />
            ))}
          </div>
        </div>
      ))}

      {!isLoading && visibleSections.length === 0 && !error && (
        <div className="px-2">
          <GlassPanel className="p-5 text-center">
            <p className="mb-3 text-sm text-muted-foreground">No discover cards available yet</p>
            <Button
              onClick={() => void fetchNextPage()}
              variant="outline"
              className="rounded-xl text-xs font-bold uppercase tracking-widest"
            >
              Load Discover Feed
            </Button>
          </GlassPanel>
        </div>
      )}

      <div className="px-2">
        {isFetchingNextPage ? (
          <div className="flex items-center justify-center py-5 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading more
          </div>
        ) : hasNextPage ? (
          <Button
            onClick={() => void fetchNextPage()}
            variant="outline"
            className="w-full rounded-2xl border-white/15 bg-white/5 text-xs font-black uppercase tracking-widest"
          >
            Load More
          </Button>
        ) : null}
      </div>
    </section>
  );
}
