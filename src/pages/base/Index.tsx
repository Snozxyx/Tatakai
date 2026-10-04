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
import { TrendingGrid } from "@/components/anime/TrendingGrid";
import { LatestEpisodes } from "@/components/anime/LatestEpisodes";
import { TopAnimeSection } from "@/components/anime/TopAnimeSection";
import { GenreCloud } from "@/components/anime/GenreCloud";
import { AnimeGrid } from "@/components/anime/AnimeGrid";
import { ContinueWatching } from "@/components/anime/ContinueWatching";
import { LocalContinueWatching } from "@/components/anime/LocalContinueWatching";
import { UpcomingAnimeSection } from "@/components/anime/UpcomingAnimeSection";
import { InfiniteHomeSections } from "@/components/anime/InfiniteHomeSections";
import { MobileInfiniteHomeSections } from "@/components/anime/MobileInfiniteHomeSections";
import { HeroSkeleton, CardSkeleton } from "@/components/ui/skeleton-custom";
import { AIRecommendationBanner } from "@/components/anime/AIRecommendationBanner";
import { CommunitySection } from "@/components/home/CommunitySection";
import { Reveal } from "@/components/ui/Reveal";
import { ReviewPopup } from "@/components/ui/ReviewPopup";
import {  ReleaseV6Banner } from "@/components/layout/MangaBanner";
import { IndexMangaShowcase } from "@/components/manga/IndexMangaShowcase";
import { LastReadMangaSection } from "@/components/manga/LastReadMangaSection";
import { Heart, Sparkles } from "lucide-react";
import { DiscordSection } from "@/components/home/DiscordSection";
import { DownloadSection } from "@/components/home/DownloadSection";
import { AppDownloadBanner } from "@/components/layout/AppDownloadBanner";
import { useEffect, useState, type ReactNode } from "react";
import { BecauseYouWatched } from "@/components/anime/BecauseYouWatched";
import { TorrentSessionBanner } from "@/components/home/TorrentSessionBanner";
import { ExtensionSlot } from "@/core/extensions/ExtensionSlot";

/**
 * Home sections wrapped for a smooth scroll-in. The margin reset mirrors the
 * container's `[&>section]:!mb-0` so nesting a section inside the reveal <div>
 * doesn't reintroduce the component's own bottom margin (spacing stays owned by
 * the container's `space-y`).
 */
const RevealSection = ({ children, delay }: { children: ReactNode; delay?: number }) => (
  <Reveal delay={delay} className="[&>section]:!mb-0 [&>div]:!mb-0">
    {children}
  </Reveal>
);

const Index = () => {
  const { data, isLoading, error } = useHomeData();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp(); // Only Electron/Tauri
  const isMobile = useIsMobile();
  const isMobileApp = Capacitor.isNativePlatform();
  const showInfiniteEarly = isMobile || isMobileApp;
  const [showDeferredSections, setShowDeferredSections] = useState(false);

  // Show sidebar on desktop (web or app), but not on mobile (web or app)
  const showSidebar = !isMobile;

  useEffect(() => {
    setBrowsingRpc('Anime');
  }, []);

  useEffect(() => {
    if (isLoading || !data) {
      setShowDeferredSections(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowDeferredSections(true);
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isLoading, data]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Failed to load</h1>
          <p className="text-muted-foreground">Please try again later</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {!isMobile && <Background />}
      {showSidebar && <Sidebar />}

      <main className={cn(
        "relative z-10 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
        isDesktopApp ? "pl-24" : "pl-6 md:pl-32" // Desktop app sidebar is fixed w-20, so content needs larger offset
      )}>
        <Header />
        <div className="hidden md:block h-4 lg:h-6" aria-hidden />

        {/* Extension mount point — top of home. */}
        <ExtensionSlot slotId="home-top" />

        {isLoading ? (
          <>
            <HeroSkeleton />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-24">
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          </>
        ) : data ? (
          <div className="space-y-14 md:space-y-20 [&>section]:!mb-0 [&>div]:!mb-0">
            {/* Hero — Spotlight */}
            {data.spotlightAnimes.length > 0 && (
              <HeroSection
                spotlight={data.spotlightAnimes[0]}
                spotlights={data.spotlightAnimes}
              />
            )}

            <ReleaseV6Banner />

            {/* ── Pick up where you left off ── */}
            <ContinueWatching />
            <LocalContinueWatching />
            <TorrentSessionBanner />
            <LastReadMangaSection />

            {/* ── Fresh & trending ── */}
            <RevealSection><LatestEpisodes animes={data.latestEpisodeAnimes} /></RevealSection>
            <RevealSection><TrendingGrid animes={data.trendingAnimes} /></RevealSection>

            {showDeferredSections ? (
              <>
                {/* ── Made for you ── */}
                <RevealSection><BecauseYouWatched /></RevealSection>
                <RevealSection><AIRecommendationBanner /></RevealSection>

                {/* ── Rankings & curated ── */}
                <RevealSection>
                  <TopAnimeSection
                    today={data.top10Animes.today}
                    week={data.top10Animes.week}
                    month={data.top10Animes.month}
                  />
                </RevealSection>
                <RevealSection><UpcomingAnimeSection /></RevealSection>
                <RevealSection>
                  <AnimeGrid
                    animes={data.mostPopularAnimes.slice(0, 6)}
                    title="Most Popular"
                    icon={<Heart className="w-5 h-5 text-destructive fill-destructive" />}
                  />
                </RevealSection>
                <RevealSection>
                  <AnimeGrid
                    animes={data.mostFavoriteAnimes.slice(0, 6)}
                    title="Most Favorite"
                    icon={<Sparkles className="w-5 h-5 text-amber" />}
                  />
                </RevealSection>

                {/* ── Explore across media ── */}
                <RevealSection><IndexMangaShowcase /></RevealSection>
                <RevealSection><GenreCloud genres={data.genres} /></RevealSection>

                {/* ── Community ── */}
                <RevealSection><CommunitySection /></RevealSection>

                {/* ── Get more out of Tatakai ── */}
                <RevealSection><DiscordSection /></RevealSection>

                {/* Infinite genre feed */}
                {showInfiniteEarly ? <MobileInfiniteHomeSections /> : <InfiniteHomeSections />}
              </>
            ) : (
              <div className="min-h-[60vh]" aria-hidden />
            )}
          </div>
        ) : null}

        {/* Extension mount point — bottom of home. */}
        <ExtensionSlot slotId="home-bottom" />
      </main>

      {showDeferredSections && data && <ReviewPopup />}
      {!isMobile && <MobileNav />}
      {!isMobile && !isMobileApp && <AppDownloadBanner />}
    </div>
  );
};

export default Index;

