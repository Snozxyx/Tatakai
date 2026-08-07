import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { AnimeCard, getProxiedImageUrl, getHighQualityPoster } from '@/lib/api';
import { useInfiniteHomeSections, type HomeSection, type SectionLayout } from '@/hooks/api/useInfiniteHomeSections';
import { useHomeData } from '@/hooks/api/useAnimeData';
import { Play, Star, Loader2, ChevronRight, Sparkles, LayoutGrid, Heart, Flame, Zap, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimeCardWithPreview } from './AnimeCardWithPreview';
import { useIsMobile } from '@/hooks/ui/use-mobile';

const shouldEnablePreview = (anime: AnimeCard): boolean => {
  return !/^(mal|anilist)-/i.test(String(anime?.id || '').trim());
};

function MobileAnimeCard({ anime }: { anime: AnimeCard }) {
  return (
    <div className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-lg transition-colors hover:border-primary/30 active:scale-[0.98]">
      <div className="relative aspect-[3/4]">
        <img
          src={getHighQualityPoster(anime.poster, anime.anilistId)}
          alt={anime.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
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
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent opacity-90" />
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h4 className="text-sm font-bold leading-tight text-white line-clamp-2 drop-shadow-md">
            {anime.name}
          </h4>
          <div className="mt-1.5 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-white/80">
            <span className="rounded-md bg-white/20 backdrop-blur-md px-2 py-0.5 border border-white/10">SUB {anime.episodes?.sub || 0}</span>
            {(anime.episodes?.dub || 0) > 0 && (
              <span className="rounded-md bg-primary/40 backdrop-blur-md px-2 py-0.5 border border-primary/30 text-primary-foreground">DUB {anime.episodes?.dub || 0}</span>
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
      <div className="flex items-center justify-between mb-6 px-2">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-white/10" />
          <div className="h-7 bg-white/10 rounded-lg w-40" />
        </div>
        <div className="h-6 bg-white/10 rounded-md w-16" />
      </div>

      <div className={cn(
        "grid gap-4 md:gap-6",
        layout === 'grid' && "grid-cols-2 md:grid-cols-4 lg:grid-cols-6",
        layout === 'carousel' && "flex overflow-hidden",
        layout === 'featured' && "grid-cols-1 md:grid-cols-3 lg:grid-cols-3",
        layout === 'compact' && "grid-cols-3 md:grid-cols-6 lg:grid-cols-8",
        layout === 'masonry' && "grid-cols-2 md:grid-cols-4 lg:grid-cols-6"
      )}>
        {[...Array(layout === 'compact' ? 8 : 6)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "rounded-2xl bg-white/5 border border-white/10",
              layout === 'carousel' ? "flex-shrink-0 w-40 md:w-56 aspect-[3/4]" : "aspect-[3/4]",
              layout === 'featured' && i === 0 && "md:col-span-1 lg:col-span-1 md:row-span-2 min-h-[400px]",
              layout === 'masonry' && (i === 0 || i === 3) && "md:col-span-2 row-span-2 h-full"
            )}
          />
        ))}
      </div>
    </div>
  );
}

// Reusable scroll container styling for carousels
const scrollContainerStyles = "flex gap-4 md:gap-6 overflow-x-auto pb-6 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]";

// Grid layout - standard 6 column grid
function GridLayout({ animes, isMobile }: { animes: AnimeCard[]; isMobile: boolean }) {
  const duration = 0.4;
  const items = animes.slice(0, isMobile ? 4 : 6);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-8 md:gap-x-6 md:gap-y-10">
      {items.map((anime, i) => (
        <motion.div
          key={anime.id}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration, ease: "easeOut" }}
        >
          {isMobile ? <MobileAnimeCard anime={anime} /> : <AnimeCardWithPreview anime={anime} showPreview={shouldEnablePreview(anime)} />}
        </motion.div>
      ))}
    </div>
  );
}

// Carousel layout - horizontal scrolling
function CarouselLayout({ animes, isMobile }: { animes: AnimeCard[]; isMobile: boolean }) {
  const duration = 0.4;
  const items = animes.slice(0, isMobile ? 8 : 12);
  
  return (
    <div className={scrollContainerStyles}>
      {items.map((anime, i) => (
        <motion.div
          key={anime.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.03, duration, ease: "easeOut" }}
          className="flex-shrink-0 w-40 md:w-56 snap-start"
        >
          {isMobile ? <MobileAnimeCard anime={anime} /> : <AnimeCardWithPreview anime={anime} showPreview={shouldEnablePreview(anime)} />}
        </motion.div>
      ))}
      <div className="w-2 flex-shrink-0" aria-hidden="true" />
    </div>
  );
}

// Featured layout - 1 large + 4 small
function FeaturedLayout({ animes, isMobile }: { animes: AnimeCard[]; isMobile: boolean }) {
  const navigate = useNavigate();
  if (animes.length === 0) return null;
  const duration = 0.5;

  const featured = animes[0];
  const rest = animes.slice(1, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Featured card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration, ease: "easeOut" }}
        className="md:col-span-1 lg:row-span-2 h-full"
      >
        <div
          onClick={() => navigate(`/anime/${featured.id}`)}
          className="relative h-full min-h-[450px] md:min-h-[500px] rounded-[2rem] overflow-hidden cursor-pointer group border border-white/10 shadow-2xl"
        >
          <img
            src={getHighQualityPoster(featured.poster, featured.anilistId)}
            alt={featured.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 filter brightness-[0.85] saturate-[1.1]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 scale-90 group-hover:scale-100">
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-2xl">
              <Play className="w-6 h-6 fill-white text-white ml-1" />
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-3 py-1 rounded-full bg-primary/80 backdrop-blur-md border border-primary/30 text-primary-foreground text-[10px] font-black uppercase tracking-widest shadow-lg">
                Featured Masterpiece
              </span>
            </div>
            <h3 className="font-display font-black text-2xl md:text-3xl text-white mb-3 leading-tight drop-shadow-xl">{featured.name}</h3>
            <div className="flex items-center gap-4 text-xs font-bold text-white/80">
              {featured.type && <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/10 backdrop-blur-sm"><LayoutGrid className="w-3.5 h-3.5" />{featured.type}</span>}
              {featured.rating && (
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/10 backdrop-blur-sm text-amber-400">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  {featured.rating}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Smaller cards */}
      <div className="md:col-span-1 lg:col-span-2 grid grid-cols-2 gap-x-4 gap-y-6 md:gap-x-6 md:gap-y-8">
        {rest.map((anime, i) => (
          <motion.div
            key={anime.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05, duration: 0.4, ease: "easeOut" }}
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
  const items = animes.slice(0, isMobile ? 6 : 8);
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-x-3 gap-y-6 md:gap-x-4 md:gap-y-8">
      {items.map((anime, i) => (
        <motion.div
          key={anime.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03, duration: 0.3 }}
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
  const items = animes.slice(0, isMobile ? 4 : 6);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6 h-auto">
      {items.map((anime, i) => {
        const isLarge = i === 0 || i === 3;
        return (
          <motion.div
            key={anime.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
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

function getLayoutComponent(layout: SectionLayout) {
  switch (layout) {
    case 'carousel': return CarouselLayout;
    case 'featured': return FeaturedLayout;
    case 'compact': return CompactLayout;
    case 'masonry': return MasonryLayout;
    default: return GridLayout;
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
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: isMobile ? "-40px" : "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mb-16 md:mb-20"
    >
      <div className="flex items-center justify-between mb-6 px-2">
        {/* Updated Title Wrapper */}
        <h3 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2 text-foreground">
          {IconComponent && <IconComponent className="w-6 h-6 text-primary" />}
          {section.title}
        </h3>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (hasGenreRoute) navigate(`/genre/${section.genre}`);
          }}
          disabled={!hasGenreRoute}
          className="gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 text-muted-foreground hover:text-white transition-all font-bold text-xs"
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
      rootMargin: isMobile ? '400px' : '800px',
      threshold: 0.1,
    });

    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
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
        layout: 'carousel',
        animes: homeFallbackData.latestEpisodeAnimes.slice(0, 10),
      });
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
    <div className="mt-20 md:mt-24">
      {/* Section Header */}
      <section className="group relative mb-16 overflow-hidden rounded-[28px] border border-white/[0.06] bg-white/[0.02] backdrop-blur-2xl">
  {/* Single soft ambient light — one source, not two competing blobs */}
  <div className="pointer-events-none absolute -top-32 left-1/3 h-72 w-[32rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />

  {/* Apple's signature top hairline highlight */}
  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

  <div className="relative flex flex-col gap-8 px-6 py-10 sm:px-10 sm:py-12 md:flex-row md:items-center md:justify-between">
    {/* Left */}
    <div className="flex items-center gap-5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white/[0.06] ring-1 ring-inset ring-white/10">
        <Sparkles className="h-[18px] w-[18px] text-primary" strokeWidth={1.75} />
      </div>

      <div className="space-y-1.5">
        <h2 className="text-[26px] sm:text-[32px] font-semibold leading-[1.1] tracking-[-0.022em] text-white antialiased">
          Discover More
        </h2>
        <p className="text-[15px] leading-snug tracking-[-0.01em] text-white/50">
          An endless library of anime masterpieces.
        </p>
      </div>
    </div>

    
  </div>
</section>

      {isLoading && (
        <div className="space-y-6">
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
              className="rounded-xl border-red-400/40 bg-red-500/10 px-6 py-2 text-xs font-black uppercase tracking-widest hover:bg-red-500/20 text-red-100"
            >
              Retry Discover Feed
            </Button>
          </GlassPanel>
        </div>
      )}

      {visibleSections.map((section, index) => (
        <div key={section.id}>
          <HomeSection section={section} />
          
          {(index + 1) % 3 === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: isMobile ? "-40px" : "-80px" }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="mb-16 md:mb-20 px-2"
            >
              <GlassPanel className="p-8 md:p-10 relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-purple-500/10 border-white/10 group rounded-[2rem]">
                <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity duration-700 pointer-events-none">
                  <Sparkles className="w-48 h-48 text-primary" />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                  <div className="text-center md:text-left">
                    <h3 className="text-2xl md:text-3xl font-black mb-2 text-white">Tatakai is better with you</h3>
                    <p className="text-muted-foreground max-w-md text-sm md:text-base leading-relaxed">Got a feature in mind? Want to see a specific anime? Our community shapes the future.</p>
                  </div>
                  <Button
                    onClick={() => navigate('/suggestions')}
                    className="w-full md:w-auto px-8 py-6 rounded-2xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95"
                  >
                    Send Suggestion
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </div>
              </GlassPanel>
            </motion.div>
          )}
        </div>
      ))}

      {/* Load more trigger with smooth fade */}
      <div ref={loadMoreRef} className="py-12 flex flex-col items-center justify-center gap-6 min-h-[150px]">
        {isFetchingNextPage ? (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="flex flex-col items-center gap-4"
          >
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
              <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
            <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] animate-pulse">
              Curating next collection
            </span>
          </motion.div>
        ) : hasNextPage && !isLoading ? (
          <Button
            onClick={() => fetchNextPage()}
            variant="outline"
            className="rounded-xl border-white/10 bg-white/5 px-6 py-2 text-xs font-black uppercase tracking-widest hover:bg-white/10"
          >
            Load More Sections
          </Button>
        ) : null}
      </div>

      {!hasNextPage && visibleSections.length > 0 && (
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="relative py-20 text-center group"
        >
          <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="relative inline-block px-10 py-3 bg-background border border-white/10 rounded-full overflow-hidden shadow-2xl">
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                <div className="w-7 h-7 rounded-full border-2 border-background bg-primary/20 flex items-center justify-center">
                  <Flame className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="w-7 h-7 rounded-full border-2 border-background bg-purple-500/20 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div className="w-7 h-7 rounded-full border-2 border-background bg-pink-500/20 flex items-center justify-center">
                  <Heart className="w-3.5 h-3.5 text-pink-400" />
                </div>
              </div>
              <p className="font-display font-medium text-sm tracking-tight text-muted-foreground">
                You've reached the very edge of the multiverse
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}