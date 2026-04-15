import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { AnimeCard, getProxiedImageUrl, getHighQualityPoster } from '@/lib/api';
import { useInfiniteHomeSections, type HomeSection, type SectionLayout } from '@/hooks/useInfiniteHomeSections';
import { useHomeData } from '@/hooks/useAnimeData';
import { Play, Star, Loader2, ChevronRight, Sparkles, LayoutGrid, Heart, Flame, Zap, ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimeCardWithPreview } from './AnimeCardWithPreview';
import { useIsMobile } from '@/hooks/use-mobile';

const shouldEnablePreview = (anime: AnimeCard): boolean => {
  return !/^(mal|anilist)-/i.test(String(anime?.id || '').trim());
};

function MobileAnimeCard({ anime }: { anime: AnimeCard }) {
  return (
    <div className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-lg">
      <div className="relative aspect-[3/4]">
        <img
          src={getHighQualityPoster(anime.poster, anime.anilistId)}
          alt={anime.name}
          loading="eager"
          className="h-full w-full object-cover"
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
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h4 className="text-sm font-bold leading-tight text-white line-clamp-2">
            {anime.name}
          </h4>
          <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="rounded-md bg-background/60 px-2 py-0.5">SUB {anime.episodes?.sub || 0}</span>
            {(anime.episodes?.dub || 0) > 0 && (
              <span className="rounded-md bg-background/60 px-2 py-0.5">DUB {anime.episodes?.dub || 0}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionSkeleton({ layout }: { layout: SectionLayout }) {
  return (
    <div className="mb-16 animate-pulse">
      <div className="flex items-center justify-between mb-8 px-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/5" />
          <div className="h-8 bg-white/5 rounded-lg w-48" />
        </div>
        <div className="h-6 bg-white/5 rounded-md w-20" />
      </div>

      <div className={cn(
        "grid gap-4",
        layout === 'grid' && "grid-cols-2 md:grid-cols-4 lg:grid-cols-6",
        layout === 'carousel' && "flex overflow-hidden",
        layout === 'featured' && "grid-cols-1 md:grid-cols-3",
        layout === 'compact' && "grid-cols-3 md:grid-cols-6 lg:grid-cols-8",
        layout === 'masonry' && "grid-cols-2 md:grid-cols-4 lg:grid-cols-6"
      )}>
        {[...Array(layout === 'compact' ? 8 : 6)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "rounded-2xl bg-white/5 border border-white/5",
              layout === 'carousel' ? "flex-shrink-0 w-44 aspect-[3/4]" : "aspect-[3/4]",
              layout === 'featured' && i === 0 && "md:col-span-1 lg:row-span-2 min-h-[400px]",
              layout === 'masonry' && (i === 0 || i === 3) && "md:col-span-2 row-span-2 h-full"
            )}
          />
        ))}
      </div>
    </div>
  );
}



// Grid layout - standard 6 column grid
function GridLayout({ animes, isMobile }: { animes: AnimeCard[]; isMobile: boolean }) {
  const delayStep = isMobile ? 0.03 : 0.05;
  const duration = isMobile ? 0.25 : 0.35;
  const items = animes.slice(0, isMobile ? 4 : 6);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-8 md:gap-x-6 md:gap-y-10">
      {items.map((anime, i) => (
        <motion.div
          key={anime.id}
          initial={isMobile ? false : { opacity: 0, scale: 0.9 }}
          animate={isMobile ? {} : { opacity: 1, scale: 1 }}
          transition={{ delay: i * delayStep, duration }}
        >
          {isMobile ? <MobileAnimeCard anime={anime} /> : <AnimeCardWithPreview anime={anime} showPreview={shouldEnablePreview(anime)} />}
        </motion.div>
      ))}
    </div>
  );
}

// Carousel layout - horizontal scrolling
function CarouselLayout({ animes, isMobile }: { animes: AnimeCard[]; isMobile: boolean }) {
  const delayStep = isMobile ? 0.02 : 0.05;
  const duration = isMobile ? 0.25 : 0.35;
  const items = animes.slice(0, isMobile ? 7 : 10);
  return (
    <div className="flex gap-4 md:gap-6 overflow-x-auto pb-6 snap-x snap-mandatory scrollbar-none mask-fade-right">
      {items.map((anime, i) => (
        <motion.div
          key={anime.id}
          initial={isMobile ? false : { opacity: 0, x: 30 }}
          animate={isMobile ? {} : { opacity: 1, x: 0 }}
          transition={{ delay: i * delayStep, duration }}
          className="flex-shrink-0 w-40 md:w-56 snap-start"
        >
          {isMobile ? <MobileAnimeCard anime={anime} /> : <AnimeCardWithPreview anime={anime} showPreview={shouldEnablePreview(anime)} />}
        </motion.div>
      ))}
    </div>
  );
}

// Featured layout - 1 large + 4 small
function FeaturedLayout({ animes, isMobile }: { animes: AnimeCard[]; isMobile: boolean }) {
  const navigate = useNavigate();
  if (animes.length === 0) return null;
  const duration = isMobile ? 0.25 : 0.4;

  const featured = animes[0];
  const rest = animes.slice(1, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Featured card */}
      <motion.div
        initial={isMobile ? false : { opacity: 0, scale: 0.95 }}
        animate={isMobile ? {} : { opacity: 1, scale: 1 }}
        transition={{ duration }}
        className="md:col-span-1 lg:row-span-2 h-full"
      >
        <div
          onClick={() => navigate(`/anime/${featured.id}`)}
          className="relative h-full min-h-[450px] rounded-[2rem] overflow-hidden cursor-pointer group border border-white/5"
        >
          <img
            src={getHighQualityPoster(featured.poster, featured.anilistId)}
            alt={featured.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110 filter brightness-90 saturate-[1.1]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />

          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 scale-90 group-hover:scale-100">
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/30 shadow-2xl">
              <Play className="w-7 h-7 fill-white text-white ml-1" />
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="px-3 py-1 rounded-full bg-primary/20 backdrop-blur-md border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest">
                Featured Masterpiece
              </span>
            </div>
            <h3 className="font-display font-black text-2xl md:text-3xl text-white mb-2 leading-tight drop-shadow-2xl">{featured.name}</h3>
            <div className="flex items-center gap-4 text-sm text-white/60 font-medium">
              {featured.type && <span className="flex items-center gap-1.5"><LayoutGrid className="w-3.5 h-3.5" />{featured.type}</span>}
              {featured.rating && (
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  {featured.rating}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Smaller cards */}
      <div className="md:col-span-1 lg:col-span-2 grid grid-cols-2 gap-x-4 gap-y-10 md:gap-x-6 md:gap-y-12">
        {rest.map((anime, i) => (
          <motion.div
            key={anime.id}
            initial={isMobile ? false : { opacity: 0, y: 20 }}
            animate={isMobile ? {} : { opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * (isMobile ? 0.03 : 0.05), duration }}
          >
            {isMobile ? <MobileAnimeCard anime={anime} /> : <AnimeCardWithPreview anime={anime} showPreview={shouldEnablePreview(anime)} />}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// Compact layout - small cards in a tight grid
function CompactLayout({ animes, isMobile }: { animes: AnimeCard[]; isMobile: boolean }) {
  const delayStep = isMobile ? 0.02 : 0.03;
  const duration = isMobile ? 0.22 : 0.3;
  const items = animes.slice(0, isMobile ? 6 : 8);
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-x-3 gap-y-8 md:gap-x-4 md:gap-y-10">
      {items.map((anime, i) => (
        <motion.div
          key={anime.id}
          initial={isMobile ? false : { opacity: 0, y: 10 }}
          animate={isMobile ? {} : { opacity: 1, y: 0 }}
          transition={{ delay: i * delayStep, duration }}
        >
          {isMobile ? <MobileAnimeCard anime={anime} /> : <AnimeCardWithPreview anime={anime} showPreview={shouldEnablePreview(anime)} />}
        </motion.div>
      ))}
    </div>
  );
}

// Masonry-like layout - varied sizes
function MasonryLayout({ animes, isMobile }: { animes: AnimeCard[]; isMobile: boolean }) {
  if (animes.length < 6) return <GridLayout animes={animes} isMobile={isMobile} />;
  const delayStep = isMobile ? 0.03 : 0.05;
  const duration = isMobile ? 0.25 : 0.35;
  const items = animes.slice(0, isMobile ? 4 : 6);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-10 md:gap-x-6 md:gap-y-12 h-auto">
      {items.map((anime, i) => {
        const isLarge = i === 0 || i === 3;
        return (
          <motion.div
            key={anime.id}
            initial={isMobile ? false : { opacity: 0, y: 20 }}
            animate={isMobile ? {} : { opacity: 1, y: 0 }}
            transition={{ delay: i * delayStep, duration }}
            className={cn(
              isLarge && 'row-span-2 col-span-1 md:col-span-2'
            )}
          >
            {isMobile ? <MobileAnimeCard anime={anime} /> : <AnimeCardWithPreview anime={anime} showPreview={shouldEnablePreview(anime)} />}
          </motion.div>
        );
      })}
    </div>
  );
}

// Get layout component based on type
function getLayoutComponent(layout: SectionLayout) {
  switch (layout) {
    case 'carousel':
      return CarouselLayout;
    case 'featured':
      return FeaturedLayout;
    case 'compact':
      return CompactLayout;
    case 'masonry':
      return MasonryLayout;
    default:
      return GridLayout;
  }
}

// Single section component
function HomeSection({ section }: { section: HomeSection }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const LayoutComponent = getLayoutComponent(section.layout);
  const IconComponent = section.icon;
  const hasGenreRoute = String(section.genre || '').trim().length > 0;

  if (section.animes.length === 0) return null;

  return (
    <motion.section
      initial={isMobile ? false : { opacity: 0, y: 40 }}
      whileInView={isMobile ? {} : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: isMobile ? "-60px" : "-100px" }}
      className="mb-20"
    >
      <div className="flex items-center justify-between mb-8 px-2">
        <div className="flex items-center gap-4 group">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 group-hover:bg-primary/10 group-hover:border-primary/30 transition-all duration-500">
            {IconComponent && <IconComponent className="w-6 h-6 text-primary" />}
          </div>
          <h3 className="font-display text-2xl md:text-3xl font-black tracking-tight group-hover:translate-x-1 transition-transform">
            {section.title}
          </h3>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (hasGenreRoute) {
              navigate(`/genre/${section.genre}`);
            }
          }}
          disabled={!hasGenreRoute}
          className="gap-2 px-5 py-5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-muted-foreground hover:text-white transition-all font-bold"
        >
          View All
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <LayoutComponent animes={section.animes} isMobile={isMobile} />
    </motion.section>
  );
}

// Main infinite sections component
export function InfiniteHomeSections() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { data: homeFallbackData } = useHomeData();
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteHomeSections();

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const bootstrapAttemptRef = useRef(0);
  const hasQueryError = !!error;

  // Intersection Observer for infinite scroll
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const target = entries[0];
    if (target.isIntersecting && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: isMobile ? '400px' : '800px', // Preload sooner for smoother experience
      threshold: isMobile ? 0.2 : 0.1,
    });

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [handleObserver, isMobile]);

  const allSections = data?.pages.flatMap(page => page.sections) || [];
  const mobileFallbackSections = useMemo<HomeSection[]>(() => {
    if (!isMobile || !homeFallbackData) return [];

    const sections: HomeSection[] = [];

    if (Array.isArray(homeFallbackData.mostPopularAnimes) && homeFallbackData.mostPopularAnimes.length > 0) {
      sections.push({
        id: 'mobile-fallback-popular',
        title: 'Popular Picks',
        genre: '',
        layout: 'grid',
        animes: homeFallbackData.mostPopularAnimes.slice(0, 8),
      });
    }

    if (Array.isArray(homeFallbackData.latestEpisodeAnimes) && homeFallbackData.latestEpisodeAnimes.length > 0) {
      sections.push({
        id: 'mobile-fallback-latest',
        title: 'Latest Episodes',
        genre: '',
        layout: 'compact',
        animes: homeFallbackData.latestEpisodeAnimes.slice(0, 9),
      });
    }

    return sections;
  }, [homeFallbackData, isMobile]);
  const visibleSections = allSections.length > 0 ? allSections : mobileFallbackSections;

  useEffect(() => {
    if (hasQueryError) return;
    if (isLoading || isFetchingNextPage) return;
    if (!hasNextPage) return;
    if (allSections.length > 0) return;

    const maxBootstrapAttempts = isMobile ? 4 : 2;
    if (bootstrapAttemptRef.current >= maxBootstrapAttempts) return;
    bootstrapAttemptRef.current += 1;

    void fetchNextPage();
  }, [allSections.length, fetchNextPage, hasNextPage, hasQueryError, isFetchingNextPage, isLoading, isMobile]);

  return (
    <div className="mt-24">
      {/* Section Header */}
      <div className="relative mb-16 px-2 overflow-hidden py-4">
        <div className="absolute top-0 left-0 w-32 h-32 bg-primary/10 blur-[100px]" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-purple-500/10 blur-[100px]" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="p-5 rounded-[1.25rem] bg-primary/20 border border-primary/20 shadow-2xl shadow-primary/10">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-4xl md:text-5xl font-black tracking-tighter text-white">
                Discover More
              </h2>
              <p className="text-muted-foreground font-medium text-lg">
                Explore a never-ending library of anime masterpieces
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Loading skeleton for initial load */}
      {isLoading && (
        <div className="space-y-4">
          <SectionSkeleton layout="grid" />
          <SectionSkeleton layout="carousel" />
          <SectionSkeleton layout="featured" />
        </div>
      )}

      {hasQueryError && (
        <div className="mb-16 px-2">
          <GlassPanel className="p-8 text-center border-red-500/30 bg-red-500/10">
            <p className="text-lg font-bold text-foreground mb-2">Unable to load discover sections</p>
            <p className="text-sm text-muted-foreground mb-5">
              The request failed on this network. Tap retry to fetch a fresh batch.
            </p>
            <Button
              onClick={() => {
                bootstrapAttemptRef.current = 0;
                void fetchNextPage();
              }}
              variant="outline"
              className="rounded-2xl border-red-400/40 bg-red-500/10 px-6 py-2 text-xs font-black uppercase tracking-widest hover:bg-red-500/20"
            >
              Retry Discover Feed
            </Button>
          </GlassPanel>
        </div>
      )}

      {/* Rendered sections */}
      {visibleSections.map((section, index) => (
        <div key={section.id}>
          <HomeSection section={section} />
          {/* Insert dynamic banner every 3 sections */}
          {(index + 1) % 3 === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: isMobile ? "-40px" : "-80px" }}
              transition={{ duration: isMobile ? 0.25 : 0.4 }}
              className="mb-20 px-2"
            >
              <GlassPanel className="p-10 relative overflow-hidden bg-gradient-to-br from-primary/20 via-background to-purple-500/10 border-primary/20 group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Sparkles className="w-32 h-32 text-primary" />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                  <div className="text-center md:text-left">
                    <h3 className="text-2xl md:text-3xl font-black mb-3">Tatakai is better with your voice</h3>
                    <p className="text-muted-foreground max-w-lg">Got a feature in mind? Want to see a specific anime? Our community shapes the future of Tatakai.</p>
                  </div>
                  <Button
                    onClick={() => navigate('/suggestions')}
                    className="px-8 py-6 rounded-2xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl shadow-primary/20"
                  >
                    Send a Suggestion
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </div>
              </GlassPanel>
            </motion.div>
          )}
        </div>
      ))}

      {!hasQueryError && !isLoading && !isFetchingNextPage && visibleSections.length === 0 && (
        <div className="mb-16 px-2">
          <GlassPanel className="p-8 text-center border-white/10 bg-white/5">
            <p className="text-lg font-bold text-foreground mb-2">Discover feed is still loading</p>
            <p className="text-sm text-muted-foreground mb-5">
              Your connection or upstream providers delayed this batch. Tap retry to load more sections.
            </p>
            <Button
              onClick={() => {
                if (!isFetchingNextPage && hasNextPage) {
                  void fetchNextPage();
                }
              }}
              variant="outline"
              className="rounded-2xl border-white/15 bg-white/5 px-6 py-2 text-xs font-black uppercase tracking-widest hover:bg-white/10"
            >
              Retry Discover Feed
            </Button>
          </GlassPanel>
        </div>
      )}

      {/* Load more trigger */}
      <div ref={loadMoreRef} className="py-20 flex flex-col items-center justify-center gap-6">
        {isFetchingNextPage ? (
          <>
            <div className="relative h-12 w-12">
              <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
              <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 text-primary animate-pulse" />
            </div>
            <span className="text-muted-foreground font-black uppercase tracking-[0.2em] text-[10px] animate-pulse">
              Curating next collection
            </span>
          </>
        ) : hasNextPage ? (
          <Button
            onClick={() => fetchNextPage()}
            variant="outline"
            className="rounded-2xl border-white/15 bg-white/5 px-6 py-2 text-xs font-black uppercase tracking-widest hover:bg-white/10"
          >
            Load More Sections
          </Button>
        ) : null}
      </div>

      {/* End message */}
      {!hasNextPage && visibleSections.length > 0 && (
        <div className="relative py-24 text-center group">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white/5" />
          <div className="relative inline-block px-12 py-3 bg-card/40 backdrop-blur-xl border border-white/5 rounded-full overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full border-2 border-background bg-primary/20 flex items-center justify-center">
                  <Flame className="w-4 h-4 text-primary" />
                </div>
                <div className="w-8 h-8 rounded-full border-2 border-background bg-purple-500/10 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-purple-400" />
                </div>
                <div className="w-8 h-8 rounded-full border-2 border-background bg-pink-500/10 flex items-center justify-center">
                  <Heart className="w-4 h-4 text-pink-400" />
                </div>
              </div>
              <p className="font-display font-medium tracking-tight text-muted-foreground group-hover:text-foreground transition-colors">
                You've reached the very edge of the multiverse
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
