import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useHomeData } from "@/hooks/api/useAnimeData";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { useIsNativeApp, useIsDesktopApp } from "@/hooks/ui/useIsNativeApp";
import { setBrowsingRpc } from "@/lib/discordRpc";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { Capacitor } from '@capacitor/core';
import { cn } from "@/lib/utils";
import { HeroSection } from "@/components/anime/HeroSection";
import { CinematicHeroSkeleton, MobileHomeBackdrop } from '@/components/anime/CinematicHero';
import { useMobileAppearance } from '@/hooks/ui/useMobileAppearance';
import type { SpotlightAnime } from '@/lib/api';
import { TrendingGrid } from "@/components/anime/TrendingGrid";
import { LatestEpisodes } from "@/components/anime/LatestEpisodes";
import { TopAnimeSection } from "@/components/anime/TopAnimeSection";
import { GenreCloud } from "@/components/anime/GenreCloud";
import { AnimeGrid } from "@/components/anime/AnimeGrid";
import { ContinueWatching } from "@/components/anime/ContinueWatching";
import { LocalContinueWatching } from "@/components/anime/LocalContinueWatching";
import { ExtensionContinue } from '@/components/extensions/ExtensionContinue';
import { UpcomingAnimeSection } from "@/components/anime/UpcomingAnimeSection";
import { InfiniteHomeSections } from "@/components/anime/InfiniteHomeSections";
import { MobileInfiniteHomeSections } from "@/components/anime/MobileInfiniteHomeSections";
import { HeroSkeleton, CardSkeleton } from "@/components/ui/skeleton-custom";
import { AIRecommendationBanner } from "@/components/anime/AIRecommendationBanner";
import { CommunitySection } from "@/components/home/CommunitySection";
import { Reveal } from "@/components/ui/Reveal";
import {  ReleaseV6Banner } from "@/components/layout/MangaBanner";
import { IndexMangaShowcase } from "@/components/manga/IndexMangaShowcase";
import { LastReadMangaSection } from "@/components/manga/LastReadMangaSection";
import { LastReadNovelSection } from "@/components/novel/LastReadNovelSection";
import { Heart, RefreshCw, Sparkles } from "lucide-react";
import { DiscordSection } from "@/components/home/DiscordSection";
import { DownloadSection } from "@/components/home/DownloadSection";
import { AppDownloadBanner } from "@/components/layout/AppDownloadBanner";
import { startTransition, useEffect, useState, type ReactNode } from "react";
import { BecauseYouWatched } from "@/components/anime/BecauseYouWatched";
import { FollowedAnimeEpisodes } from "@/components/anime/FollowedAnimeEpisodes";
import { FollowedMangaUpdates } from "@/components/manga/FollowedMangaUpdates";
import { FollowedNovelUpdates } from "@/components/novel/FollowedNovelUpdates";
import { TorrentSessionBanner } from "@/components/home/TorrentSessionBanner";
import { ExtensionSlot } from "@/core/extensions/ExtensionSlot";
import { Button } from "@/components/ui/button";

/**
 * Home sections wrapped for a smooth scroll-in. The margin reset mirrors the
 * container's `[&>section]:!mb-0` so nesting a section inside the reveal <div>
 * doesn't reintroduce the component's own bottom margin (spacing stays owned by
 * the container's `space-y`).
 */
const RevealSection = ({ children, delay }: { children: ReactNode; delay?: number }) => (
  <Reveal delay={delay} className="home-reveal-section [&>section]:!mb-0 [&>div]:!mb-0">
    {children}
  </Reveal>
);

const Index = () => {
  useUiTranslation();
  const { data, isLoading, error, refetch, isFetching } = useHomeData();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp(); // Only Electron/Tauri
  const isMobile = useIsMobile();
  const refreshed = useMobileAppearance();
  const [activeSpotlight, setActiveSpotlight] = useState<SpotlightAnime | null>(null);
  const isMobileApp = Capacitor.isNativePlatform();
  const showInfiniteEarly = isMobile || isMobileApp;
  const [deferredCount, setDeferredCount] = useState(0);
  const homeReady = !isLoading && Boolean(data);
  const showDeferredSections = deferredCount >= 11;

  // Show sidebar on desktop (web or app), but not on mobile (web or app)
  const showSidebar = !isMobile;

  useEffect(() => {
    setBrowsingRpc('Anime');
  }, []);

  // Schedule the next section only after the previous React commit. A timeout
  // fallback keeps Safari and a busy page progressing without a single burst.
  useEffect(() => {
    if (!homeReady) { setDeferredCount(0); return; }
    if (deferredCount >= 11) return;
    let cancelled = false;
    const advance = () => {
      if (!cancelled) startTransition(() => setDeferredCount(count => count + 1));
    };
    if (typeof window.requestIdleCallback === 'function') {
      const idle = window.requestIdleCallback(advance, { timeout: 500 });
      return () => { cancelled = true; window.cancelIdleCallback(idle); };
    }
    const timer = window.setTimeout(advance, 80);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [homeReady, deferredCount]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{uiI18n.t('app.failed_to_load_af14db26')}</h1>
          <p className="text-muted-foreground mb-6">{uiI18n.t('app.something_went_wrong_loading_your_home_feed_e34817d4')}</p>
          <Button onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} />
            {isFetching ? uiI18n.t('app.retrying_2310131b') : uiI18n.t('app.try_again_042c862e')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-x-clip">
      {refreshed && <MobileHomeBackdrop anime={data?.spotlightAnimes.find(anime => anime.id === activeSpotlight?.id) || data?.spotlightAnimes[0]} />}
      {!isMobile && <Background />}
      {showSidebar && <Sidebar />}

      <main data-mobile-home className={cn(
        "app-page relative z-10 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
        isDesktopApp ? "pl-24" : "pl-6 md:pl-32" // Desktop app sidebar is fixed w-20, so content needs larger offset
      )}>
        <Header />
        <div className="hidden md:block h-4 lg:h-6" aria-hidden />

        {/* Extension mount point — top of home. */}


        {isLoading ? (
          <>
            {refreshed ? <CinematicHeroSkeleton /> : <HeroSkeleton />}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-24">
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          </>
        ) : data ? (
          <div data-home-sections className="space-y-14 md:space-y-20 [&>section]:!mb-0 [&>div]:!mb-0">
            {/* Hero — Spotlight */}
            {data.spotlightAnimes.length > 0 && (
              <HeroSection
                spotlight={data.spotlightAnimes[0]}
                spotlights={data.spotlightAnimes}
                onActiveSpotlightChange={setActiveSpotlight}
              />
            )}

            {/* <ReleaseV6Banner /> */}

            {/* ── Pick up where you left off ── */}
            <ContinueWatching />
            <LocalContinueWatching />
                    <ExtensionSlot slotId="home-top" />
        <ExtensionContinue kind="watch" />
            <TorrentSessionBanner />
            <LastReadMangaSection />
            <LastReadNovelSection />

            {/* ── New from what you follow — exact EP/CH deep-links ── */}
            <RevealSection><FollowedAnimeEpisodes /></RevealSection>
            <RevealSection><FollowedMangaUpdates /></RevealSection>
            <RevealSection><FollowedNovelUpdates /></RevealSection>

            {/* ── Fresh & trending ── */}
            <RevealSection><LatestEpisodes animes={data.latestEpisodeAnimes} /></RevealSection>
            <RevealSection><TrendingGrid animes={data.trendingAnimes} /></RevealSection>

            {/* ── Made for you ── */}
            {deferredCount >= 1 && (<RevealSection><BecauseYouWatched /></RevealSection>)}
            {deferredCount >= 2 && (<RevealSection><AIRecommendationBanner /></RevealSection>)}

            {/* ── Rankings & curated ── */}
            {deferredCount >= 3 && (<RevealSection>
              <TopAnimeSection
                today={data.top10Animes.today}
                week={data.top10Animes.week}
                month={data.top10Animes.month}
              />
            </RevealSection>)}
            {deferredCount >= 4 && (<RevealSection><UpcomingAnimeSection /></RevealSection>)}
            {deferredCount >= 5 && (<RevealSection>
              <AnimeGrid
                animes={data.mostPopularAnimes.slice(0, 6)}
                title={uiI18n.t('app.most_popular_385b4b23')}
                icon={<Heart className="w-5 h-5 text-destructive fill-destructive" />}
              />
            </RevealSection>)}
            {deferredCount >= 6 && (<RevealSection>
              <AnimeGrid
                animes={data.mostFavoriteAnimes.slice(0, 6)}
                title={uiI18n.t('app.most_favorite_cbe5ea81')}
                icon={<Sparkles className="w-5 h-5 text-amber" />}
              />
            </RevealSection>)}

            {/* ── Explore across media ── */}
            {deferredCount >= 7 && (<RevealSection><IndexMangaShowcase /></RevealSection>)}
            {deferredCount >= 8 && (<RevealSection><GenreCloud genres={data.genres} /></RevealSection>)}

            {/* ── Community ── */}
            {deferredCount >= 9 && (<RevealSection><CommunitySection /></RevealSection>)}

            {/* ── Get more out of Tatakai ── */}
            {deferredCount >= 10 && (<RevealSection><DiscordSection /></RevealSection>)}

            {/* Infinite genre feed */}
            {deferredCount >= 11 && (showInfiniteEarly ? <MobileInfiniteHomeSections /> : <InfiniteHomeSections />)}
            {!showDeferredSections && <div className="min-h-[60vh]" aria-hidden />}
          </div>
        ) : null}

        {/* Extension mount point — bottom of home. */}
        <ExtensionSlot slotId="home-bottom" />
      </main>

      {/* MobileNav hides itself above `md` and on auth/error routes. */}
      <MobileNav />
      {!isMobile && !isMobileApp && <AppDownloadBanner />}
    </div>
  );
};

export default Index;

