import { useHomeData } from "@/hooks/api/useAnimeData";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { useIsNativeApp, useIsDesktopApp } from "@/hooks/ui/useIsNativeApp";
import { updateDiscordRpc } from "@/lib/discordRpc";
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
import { PlaylistSection } from "@/components/anime/PlaylistSection";
import { UpcomingAnimeSection } from "@/components/anime/UpcomingAnimeSection";
import { InfiniteHomeSections } from "@/components/anime/InfiniteHomeSections";
import { MobileInfiniteHomeSections } from "@/components/anime/MobileInfiniteHomeSections";
import { TrendingForumSection } from "@/components/anime/TrendingForumSection";
import { WatchRoomSection } from "@/components/home/WatchRoomSection";
import { HeroSkeleton, CardSkeleton } from "@/components/ui/skeleton-custom";
import { AIRecommendationBanner } from "@/components/anime/AIRecommendationBanner";
import { TierlistSection } from "@/components/home/TierlistSection";
import { ReviewPopup } from "@/components/ui/ReviewPopup";
import { LanguagesSection } from "@/components/anime/LanguagesSection";
import { ReleaseV5Banner } from "@/components/layout/MangaBanner";
import { IndexMangaShowcase } from "@/components/manga/IndexMangaShowcase";
import { LastReadMangaSection } from "@/components/manga/LastReadMangaSection";
import { Heart, Sparkles } from "lucide-react";
import { DiscordSection } from "@/components/home/DiscordSection";
import { DownloadSection } from "@/components/home/DownloadSection";
import { AppDownloadBanner } from "@/components/layout/AppDownloadBanner";
import { useEffect, useState } from "react";
import { BecauseYouWatched } from "@/components/anime/BecauseYouWatched";
import { TorrentSessionBanner } from "@/components/home/TorrentSessionBanner";

const Index = () => {
  const { data, isLoading, error } = useHomeData();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp(); // Only Electron/Tauri
  const isMobile = useIsMobile();
  const isMobileApp = Capacitor.isNativePlatform();
  const showInfiniteEarly = isMobile || isMobileApp;
  const [showDeferredSections, setShowDeferredSections] = useState(false);
  
  // Show sidebar on desktop (web or app), but not on mobile (web or app)
  const showSidebar = !isMobile && !isMobileApp;

  useEffect(() => {
    updateDiscordRpc('Browsing Anime', 'Main Menu');
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
      {!showSidebar && <Background />}
      {showSidebar && <Sidebar />}

      <main className={cn(
        "relative z-10 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
        isDesktopApp ? "pl-24" : "pl-6 md:pl-32" // Desktop app sidebar is fixed w-20, so content needs larger offset
      )}>
        <Header />
        <div className="hidden md:block h-4 lg:h-6" aria-hidden />

        {/* Quick-action buttons: mood picker + random anime */}
        {/* <div className="flex items-center gap-3 mb-4 flex-wrap mt-4">
          <AnimeRoulette trendingAnimes={data?.trendingAnimes} />
        </div> */}

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
          <>
            {/* Hero - Spotlight Anime */}
            {data.spotlightAnimes.length > 0 && (
              <HeroSection
                spotlight={data.spotlightAnimes[0]}
                spotlights={data.spotlightAnimes}
              />
            )}

            <ReleaseV5Banner />





            {/* Continue Watching - Database backed for logged in users */}
            <ContinueWatching />

            {/* Continue Watching - LocalStorage for guests */}
            <LocalContinueWatching />
            
            {/* Torrent Sessions - Desktop only */}
            <TorrentSessionBanner />

            <LastReadMangaSection />

            {/* My Playlists */}
            <PlaylistSection />

            {/* Latest Episodes */}
            <LatestEpisodes animes={data.latestEpisodeAnimes} />
            {/* Trending Grid */}
            <TrendingGrid animes={data.trendingAnimes} />

            {showDeferredSections ? (
              <>
                {/* Because You Watched — Personalised recommendations */}
                <BecauseYouWatched className="mb-12" />

                {/* Last manga/manhwa/comics progress */}
                <IndexMangaShowcase />

                <AIRecommendationBanner />

                {/* Languages Section */}
                <LanguagesSection />

                <TierlistSection />

                {/* Upcoming Anime - From Jikan API */}
                <UpcomingAnimeSection />

                {/* Top 10 Anime */}
                <TopAnimeSection
                  today={data.top10Animes.today}
                  week={data.top10Animes.week}
                  month={data.top10Animes.month}
                />

                {/* Join Discord */}
                <div className="mb-12">
                  <DiscordSection />
                </div>

                {/* Download Desktop App */}
                <div className="mb-24">
                  <DownloadSection />
                </div>

                {/* Most Popular */}
                <AnimeGrid
                  animes={data.mostPopularAnimes.slice(0, 6)}
                  title="Most Popular"
                  icon={<Heart className="w-5 h-5 text-destructive fill-destructive" />}
                />

                {/* Genre Cloud */}
                <GenreCloud genres={data.genres} />

                {/* Trending Forum Discussions */}
                <TrendingForumSection />

                {/* Watch Together Rooms */}
                <WatchRoomSection />

                {/* Most Favorite */}
                <AnimeGrid
                  animes={data.mostFavoriteAnimes.slice(0, 6)}
                  title="Most Favorite"
                  icon={<Sparkles className="w-5 h-5 text-amber" />}
                />

                {/* Infinite Scrolling Genre Sections */}
                {showInfiniteEarly && <MobileInfiniteHomeSections />}
                {!showInfiniteEarly && <InfiniteHomeSections />}

                <ReviewPopup />
              </>
            ) : (
              <div className="mt-12 space-y-6" aria-hidden>
                <div className="h-28 rounded-2xl bg-white/5 animate-pulse" />
                <div className="h-52 rounded-2xl bg-white/5 animate-pulse" />
              </div>
            )}
          </>
        ) : null}
      </main>

      {!showSidebar && <MobileNav />}
      <AppDownloadBanner />
    </div>
  );
};

export default Index;

