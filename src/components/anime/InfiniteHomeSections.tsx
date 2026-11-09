import { HomeSectionGroup } from '@/components/customization/HomeCustomization';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
import { CardSkeleton } from '@/components/ui/skeleton-custom';
import { UnifiedMediaCard } from '@/components/UnifiedMediaCard';
import { Peekable } from '@/components/media/MediaQuickPeek';
import { peekFromAnime } from '@/components/media/quickPeekStore';
import { buildPreferredAnimeRouteId } from '@/lib/animeIdMapping';
import { inferAnimeAdultFlag } from '@/lib/contentSafety';
import { useCardDesign } from '@/components/customization/CardDesignContext';

// Hard cap so the DOM can't grow forever. Adjust to taste.
const MAX_SECTIONS = 30;

// ----------------------------------------------------------------------
// Mobile Card — no backdrop-blur, no transition-all
// ----------------------------------------------------------------------
const MobileAnimeCard = memo(function MobileAnimeCard({ anime }: { anime: AnimeCard }) {
  useUiTranslation();
  const routeId = buildPreferredAnimeRouteId({ ...anime }) || anime.id;
  return <UnifiedMediaCard item={{ ...anime, id: routeId, mediaType: 'anime', isAdult: inferAnimeAdultFlag(anime), href: routeId ? `/anime/${routeId}` : `/search?q=${encodeURIComponent(anime.name)}` }} />;
});

// ----------------------------------------------------------------------
// Skeleton
// ----------------------------------------------------------------------
function SectionSkeleton({ layout }: { layout: SectionLayout }) {
  useUiTranslation();
  return (
    <div className="mb-14 md:mb-20">
      <div className="flex items-center justify-between mb-6 px-1">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
          <div className="h-6 bg-white/5 animate-pulse rounded-md w-48" />
        </div>
        <div className="h-8 bg-white/5 animate-pulse rounded-full w-20" />
      </div>
      <div className="flex flex-nowrap gap-4 md:gap-5 overflow-hidden">
        {[...Array(layout === 'compact' ? 8 : 6)].map((_, i) => (
          <CardSkeleton key={i} className="media-card-rail-item" />
        ))}
      </div>
    </div>
  );
}

const scrollContainerStyles =
  "flex flex-nowrap gap-4 md:gap-5 overflow-x-auto pb-4 pt-2 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]";

// ----------------------------------------------------------------------
// Layouts — plain divs, no per-card motion
// ----------------------------------------------------------------------
type LayoutProps = { animes: AnimeCard[]; isMobile: boolean };

const Card = ({ anime, isMobile }: { anime: AnimeCard; isMobile: boolean }) =>
  isMobile
    ? <MobileAnimeCard anime={anime} />
    : <AnimeCardWithPreview anime={anime} showPreview={true} />;

const CarouselLayout = memo(function CarouselLayout({ animes, isMobile }: LayoutProps) {
  useUiTranslation();
  const { design } = useCardDesign();
  const items = animes.slice(0, isMobile ? 8 : 12);
  return (
    <div className={scrollContainerStyles} data-card-collection="shelf" data-fixed-card-row>
      {items.map((anime) => (
        <div key={anime.id} className="media-card-rail-item snap-start" style={{ width: design?.style?.width ?? (isMobile ? 144 : 192) }}>
          <Card anime={anime} isMobile={isMobile} />
        </div>
      ))}
      <div className="w-1 flex-shrink-0" aria-hidden="true" />
    </div>
  );
});

// ----------------------------------------------------------------------
// Section — memoized, CSS entrance, content-visibility
// ----------------------------------------------------------------------
export const HomeSectionBlock = memo(function HomeSectionBlock({ section }: { section: HomeSection }) {
  useUiTranslation();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
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
              {uiI18n.t('app.view_all_efd83559')}
              <ChevronRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-0.5" />
            </Button>
          ) : undefined
        }
      />
      <CarouselLayout animes={section.animes} isMobile={isMobile} />
    </section>
  );
});

// Suggestion banner — radial gradients instead of blur filters
const SuggestionBanner = memo(function SuggestionBanner() {
  useUiTranslation();
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
            <h3 className="text-2xl md:text-3xl font-display font-bold text-white tracking-tight">{uiI18n.t('app.help_shape_the_future_283f9d40')}</h3>
            <p className="text-white/60 text-sm md:text-base leading-relaxed">
              {uiI18n.t('app.got_a_feature_in_mind_missing_a_specific_anime_d_eaf60653')}
            </p>
          </div>
          <Button
            onClick={() => navigate('/suggestions')}
            className="w-full md:w-auto px-8 h-14 rounded-full font-bold bg-white text-black hover:bg-gray-200 transition-transform hover:scale-105 active:scale-95"
          >
            {uiI18n.t('app.send_suggestion_8206c460')} <ArrowRight className="ml-2 w-4 h-4" />
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
  useUiTranslation();
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
      sections.push({ id: 'mobile-fallback-popular', get title() { return uiI18n.t('app.popular_picks_4e813ccc'); }, genre: '', layout: 'grid', animes: homeFallbackData.mostPopularAnimes.slice(0, 8) });
    }
    if (homeFallbackData.latestEpisodeAnimes?.length) {
      sections.push({ id: 'mobile-fallback-latest', get title() { return uiI18n.t('app.latest_episodes_428b6c7b'); }, genre: '', layout: 'carousel', animes: homeFallbackData.latestEpisodeAnimes.slice(0, 10) });
    }
    return sections;
  }, [homeFallbackData, isMobile, uiI18n.language]);

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
            <h2 className="text-2xl sm:text-3xl font-display font-semibold tracking-tight text-white">{uiI18n.t('app.discover_the_multiverse_e645d7b4')}</h2>
            <p className="text-sm text-white/50 font-medium">{uiI18n.t('app.endless_curations_tailored_for_your_journey_1a30c311')}</p>
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
            <p className="text-lg font-semibold text-white mb-1">{uiI18n.t('app.connection_interrupted_853de809')}</p>
            <p className="text-sm text-white/50 mb-6 max-w-md mx-auto">{uiI18n.t('app.we_couldn_t_pull_the_latest_curations_check_your_0ba899ce')}</p>
            <Button
              onClick={() => { bootstrapAttemptRef.current = 0; void fetchNextPage(); }}
              className="rounded-full bg-red-500/20 text-red-200 hover:bg-red-500/30 border border-red-500/20 font-semibold px-8"
            >
              {uiI18n.t('app.retry_connection_27717695')}
            </Button>
          </GlassPanel>
        </div>
      )}

      <HomeSectionGroup groupId="genre-feed" sections={visibleSections.map((section, index) => ({ id: `feed-${section.genre || section.id}`, label: section.title, collection: true, layoutLocked: 'shelf' as const, node: (
        <div key={section.id}>
          <HomeSectionBlock section={section} />
          {(index + 1) % 3 === 0 && <SuggestionBanner />}
        </div>
      ) }))} />

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
            {uiI18n.t('app.load_more_9ecde875')}
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
              {reachedCap ? uiI18n.t('app.that_s_plenty_for_one_session_c11452c1') : uiI18n.t('app.end_of_the_line_829f8081')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
