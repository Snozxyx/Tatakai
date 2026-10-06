import { memo, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { useInfiniteHomeSections } from '@/hooks/api/useInfiniteHomeSections';
import { useHomeData } from '@/hooks/api/useAnimeData';
import { getHighQualityPoster } from '@/lib/api';
import { buildPreferredAnimeRouteId } from '@/lib/animeIdMapping';
import { HomeSectionHeading } from '@/components/home/HomeSectionHeading';
import { useLongPress } from '@/hooks/ui/useLongPress';
import { openMediaQuickPeek } from '@/components/media/quickPeekStore';

// Cap so the DOM can't grow forever on phones — 12 sections × 8 cards max.
const MAX_MOBILE_SECTIONS = 12;
const CARDS_PER_SECTION = 8;

const MobileCard = memo(function MobileCard({ anime }: { anime: any }) {
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
  const routeTo = routeId
    ? `/anime/${routeId}`
    : `/search?q=${encodeURIComponent(anime.name || 'anime')}`;

  // Long-press quick peek — same widget as the desktop cards.
  const longPress = useLongPress({
    onLongPress: () => {
      openMediaQuickPeek({
        kind: 'anime',
        id: String(anime.id ?? routeId ?? anime.name),
        name: anime.name,
        poster: anime.poster,
        anilistId: anime.anilistId ?? anime?.anilistID ?? anime?.anilist_id ?? null,
        type: anime.type,
        year: anime.year,
        rating: anime.rating,
        episodesSub: anime.episodes?.sub,
        episodesDub: anime.episodes?.dub,
        routeTo,
      });
    },
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
      className="w-full text-left active:scale-[0.98] transition-transform duration-150"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 240px' }}
      {...longPress}
    >
      {/* Plain card on mobile — no backdrop-blur / GlassPanel (GPU-heavy). */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
        <div className="relative aspect-[2/3]">
          <img
            src={getHighQualityPoster(anime.poster || '', anime.anilistId)}
            alt={anime.name || 'Anime'}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            fetchPriority="low"
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-2.5">
            <h4 className="line-clamp-2 text-[13px] font-bold leading-tight text-white">{anime.name}</h4>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/70">
              <span className="rounded-md bg-black/50 border border-white/10 px-1.5 py-0.5">SUB {anime.episodes?.sub || 0}</span>
              {(anime.episodes?.dub || 0) > 0 && (
                <span className="rounded-md bg-black/50 border border-white/10 px-1.5 py-0.5">DUB {anime.episodes?.dub || 0}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
});

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
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(
    () => (data?.pages.flatMap((page) => page.sections) || []).slice(0, MAX_MOBILE_SECTIONS),
    [data],
  );
  const reachedCap = (data?.pages.flatMap((p) => p.sections).length ?? 0) >= MAX_MOBILE_SECTIONS;

  const fallbackSection = useMemo(() => {
    const fallbackAnimes = [
      ...(homeData?.mostPopularAnimes || []).slice(0, 6),
      ...(homeData?.latestEpisodeAnimes || []).slice(0, 6),
    ];

    if (fallbackAnimes.length === 0) return null;

    const deduped = Array.from(
      new Map(fallbackAnimes.map((anime) => [String(anime.id || anime.name), anime])).values()
    ).slice(0, 8);

    return {
      id: 'mobile-fallback-discover',
      title: 'Discover Picks',
      animes: deduped,
    };
  }, [homeData?.latestEpisodeAnimes, homeData?.mostPopularAnimes]);

  const visibleSections = sections.length > 0 ? sections : fallbackSection ? [fallbackSection] : [];
  const canLoadMore = hasNextPage && !reachedCap;

  useEffect(() => {
    if (isLoading || isFetchingNextPage) return;
    if (!hasNextPage) return;
    if (sections.length > 0) return;
    if (bootstrapAttemptsRef.current >= 3) return;

    bootstrapAttemptsRef.current += 1;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, sections.length]);

  // Stable observer — values via ref so it never re-subscribes per render.
  // Modest 400px prefetch keeps scrolling smooth without overlapping requests.
  const stateRef = useRef({ canLoadMore, isFetchingNextPage, fetchNextPage });
  stateRef.current = { canLoadMore, isFetchingNextPage, fetchNextPage };

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const s = stateRef.current;
        if (entry?.isIntersecting && s.canLoadMore && !s.isFetchingNextPage) {
          void s.fetchNextPage();
        }
      },
      { rootMargin: '400px 0px', threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [visibleSections.length]);

  return (
    <section className="mt-10 md:mt-12 pb-28" style={{ contentVisibility: 'auto' }}>
      <div className="mb-5 px-1">
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
          <div className="rounded-xl border border-primary/30 bg-primary/15 p-2.5">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-black tracking-tight text-white truncate">Discover More</h2>
            <p className="text-xs text-muted-foreground truncate">Infinite picks, tuned for mobile</p>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-3 px-1">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="aspect-[2/3] animate-pulse rounded-2xl border border-white/[0.08] bg-white/[0.04]" />
          ))}
        </div>
      )}

      {error && (
        <div className="px-1">
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
        <div key={section.id} className="mb-8" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 500px' }}>
          <HomeSectionHeading
            icon={<Compass className="w-5 h-5 text-primary" />}
            title={<span className="line-clamp-1 pr-2">{section.title}</span>}
          />
          <div className="grid grid-cols-2 gap-3 px-1">
            {(section.animes || []).slice(0, CARDS_PER_SECTION).map((anime: any) => (
              <MobileCard key={anime.id || anime.name} anime={anime} />
            ))}
          </div>
        </div>
      ))}

      {!isLoading && visibleSections.length === 0 && !error && (
        <div className="px-1">
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

      <div ref={loadMoreRef} className="px-1">
        {isFetchingNextPage ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading more
          </div>
        ) : canLoadMore ? (
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
