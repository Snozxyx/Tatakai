import { useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { AnimeCard, getHighQualityPoster } from '@/lib/api';
import { useInfiniteHomeSections, type HomeSection, type SectionLayout } from '@/hooks/api/useInfiniteHomeSections';
import { useHomeData } from '@/hooks/api/useAnimeData';
import { Play, Star, Loader2, ChevronRight, Sparkles, LayoutGrid, Heart, Flame, Zap, ArrowRight, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimeCardWithPreview } from './AnimeCardWithPreview';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { HomeSectionHeading } from '@/components/home/HomeSectionHeading';
import { Peekable } from '@/components/media/MediaQuickPeek';
import { peekFromAnime } from '@/components/media/quickPeekStore';

const shouldEnablePreview = (anime: AnimeCard): boolean =>
  !/^(mal|anilist)-/i.test(String(anime?.id || '').trim());

// Hard cap so the DOM can't grow forever. Adjust to taste.
const MAX_SECTIONS = 30;

// ----------------------------------------------------------------------
// Mobile Card — no backdrop-blur, no transition-all
// ----------------------------------------------------------------------
const MobileAnimeCard = memo(function MobileAnimeCard({ anime }: { anime: AnimeCard }) {
  return (
    <Peekable
      media={peekFromAnime(
        anime,
        anime.id ? `/anime/${anime.id}` : `/search?q=${encodeURIComponent(anime.name || 'anime')}`,
      )}
    >
    <div
      className="relative overflow-hidden rounded-xl border border-white/5 bg-neutral-900 active:scale-[0.98] transition-transform duration-200"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 260px' }}
    >
      <div className="relative aspect-[2/3] w-full">
        <img
          src={getHighQualityPoster(anime.poster, anime.anilistId)}
          alt={anime.name}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          className="absolute inset-0 h-full w-full object-cover"
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h4 className="text-sm font-semibold leading-tight text-white line-clamp-2 mb-2">{anime.name}</h4>
          <div className="flex flex-wrap gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/90">
            {(anime.episodes?.sub || 0) > 0 && (
              <span className="rounded-sm bg-white/25 px-1.5 py-0.5">CC {anime.episodes?.sub}</span>
            )}
            {(anime.episodes?.dub || 0) > 0 && (
              <span className="rounded-sm bg-primary/60 px-1.5 py-0.5 text-primary-foreground">Mic {anime.episodes?.dub}</span>
            )}
          </div>
        </div>
      </div>
    </div>
    </Peekable>
  );
});

// ----------------------------------------------------------------------
// Skeleton
// ----------------------------------------------------------------------
function SectionSkeleton({ layout }: { layout: SectionLayout }) {
  return (
    <div className="mb-14 md:mb-20">
      <div className="flex items-center justify-between mb-6 px-1">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
          <div className="h-6 bg-white/5 animate-pulse rounded-md w-48" />
        </div>
        <div className="h-8 bg-white/5 animate-pulse rounded-full w-20" />
      </div>
      <div className={cn(
        "grid gap-4 md:gap-5",
        layout === 'grid' && "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6",
        layout === 'carousel' && "flex overflow-hidden",
        layout === 'featured' && "grid-cols-1 md:grid-cols-3",
        layout === 'compact' && "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8",
        layout === 'masonry' && "grid-cols-2 md:grid-cols-4 lg:grid-cols-6"
      )}>
        {[...Array(layout === 'compact' ? 8 : 6)].map((_, i) => (
          <div key={i} className={cn(
            "rounded-xl bg-white/5 animate-pulse",
            layout === 'carousel' ? "flex-shrink-0 w-36 md:w-52 aspect-[2/3]" : "aspect-[2/3]",
          )} />
        ))}
      </div>
    </div>
  );
}

const scrollContainerStyles =
  "flex gap-4 md:gap-5 overflow-x-auto pb-4 pt-2 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]";

// ----------------------------------------------------------------------
// Layouts — plain divs, no per-card motion
// ----------------------------------------------------------------------
type LayoutProps = { animes: AnimeCard[]; isMobile: boolean };

const Card = ({ anime, isMobile }: { anime: AnimeCard; isMobile: boolean }) =>
  isMobile
    ? <MobileAnimeCard anime={anime} />
    : <AnimeCardWithPreview anime={anime} showPreview={shouldEnablePreview(anime)} />;

const GridLayout = memo(function GridLayout({ animes, isMobile }: LayoutProps) {
  const items = animes.slice(0, isMobile ? 4 : 6);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-5">
      {items.map((anime) => <Card key={anime.id} anime={anime} isMobile={isMobile} />)}
    </div>
  );
});

const CarouselLayout = memo(function CarouselLayout({ animes, isMobile }: LayoutProps) {
  const items = animes.slice(0, isMobile ? 8 : 12);
  return (
    <div className={scrollContainerStyles}>
      {items.map((anime) => (
        <div key={anime.id} className="flex-shrink-0 w-36 md:w-52 snap-start">
          <Card anime={anime} isMobile={isMobile} />
        </div>
      ))}
      <div className="w-1 flex-shrink-0" aria-hidden="true" />
    </div>
  );
});

const FeaturedLayout = memo(function FeaturedLayout({ animes, isMobile }: LayoutProps) {
  const navigate = useNavigate();
  if (animes.length === 0) return null;
  const featured = animes[0];
  const rest = animes.slice(1, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      <div className="md:col-span-1 lg:row-span-2 h-full min-h-[400px]">
        <Peekable media={peekFromAnime(featured, `/anime/${featured.id}`)}>
        <div
          onClick={() => navigate(`/anime/${featured.id}`)}
          className="group relative h-full w-full rounded-2xl overflow-hidden cursor-pointer border border-white/10 bg-neutral-900"
        >
          <img
            src={getHighQualityPoster(featured.poster, featured.anilistId)}
            alt={featured.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 brightness-[0.8]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="w-16 h-16 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-white">
              <Play className="w-6 h-6 ml-1 fill-white" />
            </div>
          </div>
          <div className="absolute bottom-0 inset-x-0 p-6 md:p-8">
            <span className="inline-block px-2.5 py-1 mb-4 rounded-md bg-primary/30 border border-primary/30 text-primary-foreground text-[10px] font-black uppercase tracking-widest">
              Featured Pick
            </span>
            <h3 className="font-display font-bold text-2xl md:text-3xl text-white mb-3 leading-tight line-clamp-3">{featured.name}</h3>
            <div className="flex items-center gap-3 text-xs font-semibold text-white/70">
              {featured.type && <span className="flex items-center gap-1.5"><LayoutGrid className="w-3.5 h-3.5" />{featured.type}</span>}
              {featured.rating && (
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Star className="w-3.5 h-3.5 fill-current" />{featured.rating}
                </span>
              )}
            </div>
          </div>
        </div>
        </Peekable>
      </div>
      <div className="md:col-span-1 lg:col-span-2 grid grid-cols-2 gap-4 md:gap-5">
        {rest.map((anime) => <Card key={anime.id} anime={anime} isMobile={isMobile} />)}
      </div>
    </div>
  );
});

const CompactLayout = memo(function CompactLayout({ animes, isMobile }: LayoutProps) {
  const items = animes.slice(0, isMobile ? 6 : 8);
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 md:gap-4">
      {items.map((anime) => <Card key={anime.id} anime={anime} isMobile={isMobile} />)}
    </div>
  );
});

const MasonryLayout = memo(function MasonryLayout({ animes, isMobile }: LayoutProps) {
  if (animes.length < 6) return <GridLayout animes={animes} isMobile={isMobile} />;
  const items = animes.slice(0, isMobile ? 4 : 6);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-5">
      {items.map((anime, i) => (
        <div key={anime.id} className={cn((i === 0 || i === 3) && 'row-span-2 col-span-1 md:col-span-2 h-full')}>
          <Card anime={anime} isMobile={isMobile} />
        </div>
      ))}
    </div>
  );
});

function getLayoutComponent(layout: SectionLayout) {
  switch (layout) {
    case 'carousel': return CarouselLayout;
    case 'featured': return FeaturedLayout;
    case 'compact': return CompactLayout;
    case 'masonry': return MasonryLayout;
    default: return GridLayout;
  }
}

// ----------------------------------------------------------------------
// Section — memoized, CSS entrance, content-visibility
// ----------------------------------------------------------------------
const HomeSectionBlock = memo(function HomeSectionBlock({ section }: { section: HomeSection }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const LayoutComponent = getLayoutComponent(section.layout);
  const IconComponent = section.icon || Compass;
  const hasGenreRoute = String(section.genre || '').trim().length > 0;

  if (section.animes.length === 0) return null;

  return (
    <section className="home-section mb-14 md:mb-20" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 420px' }}>
      <HomeSectionHeading
        icon={<IconComponent className="w-5 h-5 text-primary" />}
        title={section.title}
        action={
          hasGenreRoute ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/genre/${section.genre}`)}
              className="group h-8 rounded-full px-4 text-xs font-semibold bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white shrink-0"
            >
              View All
              <ChevronRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-0.5" />
            </Button>
          ) : undefined
        }
      />
      <LayoutComponent animes={section.animes} isMobile={isMobile} />
    </section>
  );
});

// Suggestion banner — radial gradients instead of blur filters
const SuggestionBanner = memo(function SuggestionBanner() {
  const navigate = useNavigate();
  return (
    <div className="home-section my-16 md:my-24">
      <div
        className="relative overflow-hidden rounded-[2.5rem] border border-white/[0.05] p-8 md:p-12"
        style={{
          background:
            'radial-gradient(600px 400px at 0% 0%, hsl(var(--primary) / 0.18), transparent 70%),' +
            'radial-gradient(600px 400px at 100% 100%, rgba(168,85,247,0.18), transparent 70%), #0d0d0d',
        }}
      >
        <div className="relative flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-center md:text-left space-y-2 max-w-lg">
            <h3 className="text-2xl md:text-3xl font-display font-bold text-white tracking-tight">Help shape the future</h3>
            <p className="text-white/60 text-sm md:text-base leading-relaxed">
              Got a feature in mind? Missing a specific anime? Drop us a suggestion and watch the platform evolve.
            </p>
          </div>
          <Button
            onClick={() => navigate('/suggestions')}
            className="w-full md:w-auto px-8 h-14 rounded-full font-bold bg-white text-black hover:bg-gray-200 transition-transform hover:scale-105 active:scale-95"
          >
            Send Suggestion <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
});

// ----------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------
export function InfiniteHomeSections() {
  const isMobile = useIsMobile();
  const { data: homeFallbackData } = useHomeData();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useInfiniteHomeSections();

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const bootstrapAttemptRef = useRef(0);
  const hasQueryError = !!error;

  const allSections = useMemo(
    () => (data?.pages.flatMap(page => page.sections) || []).slice(0, MAX_SECTIONS),
    [data],
  );
  const reachedCap = allSections.length >= MAX_SECTIONS;
  const canLoadMore = hasNextPage && !reachedCap;

  // Keep latest values in a ref so the observer never has to be recreated
  const stateRef = useRef({ canLoadMore, isFetchingNextPage, fetchNextPage });
  stateRef.current = { canLoadMore, isFetchingNextPage, fetchNextPage };

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const s = stateRef.current;
        if (entry.isIntersecting && s.canLoadMore && !s.isFetchingNextPage) s.fetchNextPage();
      },
      { rootMargin: isMobile ? '300px' : '500px', threshold: 0 },
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [isMobile]);

  const mobileFallbackSections = useMemo<HomeSection[]>(() => {
    if (!isMobile || !homeFallbackData) return [];
    const sections: HomeSection[] = [];
    if (homeFallbackData.mostPopularAnimes?.length) {
      sections.push({ id: 'mobile-fallback-popular', title: 'Popular Picks', genre: '', layout: 'grid', animes: homeFallbackData.mostPopularAnimes.slice(0, 8) });
    }
    if (homeFallbackData.latestEpisodeAnimes?.length) {
      sections.push({ id: 'mobile-fallback-latest', title: 'Latest Episodes', genre: '', layout: 'carousel', animes: homeFallbackData.latestEpisodeAnimes.slice(0, 10) });
    }
    return sections;
  }, [homeFallbackData, isMobile]);

  const visibleSections = allSections.length > 0 ? allSections : mobileFallbackSections;

  useEffect(() => {
    if (hasQueryError || isLoading || isFetchingNextPage || !hasNextPage || allSections.length > 0) return;
    const maxBootstrapAttempts = isMobile ? 4 : 2;
    if (bootstrapAttemptRef.current >= maxBootstrapAttempts) return;
    bootstrapAttemptRef.current += 1;
    void fetchNextPage();
  }, [allSections.length, fetchNextPage, hasNextPage, hasQueryError, isFetchingNextPage, isLoading, isMobile]);

  return (
    <div className="mt-16 md:mt-24">
      {/* Intro banner — radial gradient instead of blur */}
      <section
        className="relative mb-14 md:mb-20 overflow-hidden rounded-[2rem] border border-white/[0.04]"
        style={{ background: 'radial-gradient(640px 320px at 50% -20%, hsl(var(--primary) / 0.16), transparent 70%), rgba(10,10,10,0.6)' }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-3/4 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="relative px-8 py-10 sm:px-12 sm:py-14 flex items-center gap-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <Sparkles className="h-5 w-5 text-primary" strokeWidth={1.5} />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-display font-semibold tracking-tight text-white">Discover the Multiverse</h2>
            <p className="text-sm text-white/50 font-medium">Endless curations tailored for your journey.</p>
          </div>
        </div>
      </section>

      {isLoading && (
        <div className="space-y-8">
          <SectionSkeleton layout="carousel" />
          <SectionSkeleton layout="featured" />
          <SectionSkeleton layout="grid" />
        </div>
      )}

      {hasQueryError && (
        <div className="mb-14">
          <GlassPanel className="p-8 text-center border-red-500/20 bg-red-500/5 rounded-[2rem]">
            <p className="text-lg font-semibold text-white mb-1">Connection Interrupted</p>
            <p className="text-sm text-white/50 mb-6 max-w-md mx-auto">We couldn't pull the latest curations. Check your network and try again.</p>
            <Button
              onClick={() => { bootstrapAttemptRef.current = 0; void fetchNextPage(); }}
              className="rounded-full bg-red-500/20 text-red-200 hover:bg-red-500/30 border border-red-500/20 font-semibold px-8"
            >
              Retry Connection
            </Button>
          </GlassPanel>
        </div>
      )}

      {visibleSections.map((section, index) => (
        <div key={section.id}>
          <HomeSectionBlock section={section} />
          {(index + 1) % 3 === 0 && <SuggestionBanner />}
        </div>
      ))}

      <div ref={loadMoreRef} className="py-10 flex items-center justify-center min-h-[100px]">
        {isFetchingNextPage ? (
          <div className="flex items-center gap-3 bg-white/5 px-5 py-2.5 rounded-full border border-white/10">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-white/70 font-medium text-xs uppercase tracking-wider">Curating...</span>
          </div>
        ) : canLoadMore && !isLoading ? (
          <Button
            onClick={() => fetchNextPage()}
            variant="outline"
            className="rounded-full border-white/10 bg-transparent px-6 text-xs font-semibold uppercase tracking-wider hover:bg-white/5 text-white/50 hover:text-white"
          >
            Load More
          </Button>
        ) : null}
      </div>

      {!canLoadMore && visibleSections.length > 0 && (
        <div className="pb-24 pt-10 flex justify-center">
          <div className="flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/[0.03] border border-white/[0.08]">
            <div className="flex -space-x-1.5">
              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center border border-[#0a0a0a]"><Flame className="w-2.5 h-2.5 text-primary" /></div>
              <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center border border-[#0a0a0a]"><Zap className="w-2.5 h-2.5 text-purple-400" /></div>
              <div className="w-5 h-5 rounded-full bg-pink-500/20 flex items-center justify-center border border-[#0a0a0a]"><Heart className="w-2.5 h-2.5 text-pink-400" /></div>
            </div>
            <span className="text-xs font-medium text-white/50 tracking-wide">
              {reachedCap ? "That's plenty for one session" : 'End of the line'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}