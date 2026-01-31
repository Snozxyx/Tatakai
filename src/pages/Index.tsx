import { useHomeData } from "@/hooks/useAnimeData";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
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
import { TrendingForumSection } from "@/components/anime/TrendingForumSection";
import { WatchRoomSection } from "@/components/home/WatchRoomSection";
import { HeroSkeleton, CardSkeleton } from "@/components/ui/skeleton-custom";
import { AIRecommendationBanner } from "@/components/anime/AIRecommendationBanner";
import { TierlistSection } from "@/components/home/TierlistSection";
import { ReviewPopup } from "@/components/ui/ReviewPopup";
import { LanguagesSection } from "@/components/anime/LanguagesSection";
import { Heart, Sparkles } from "lucide-react";

import { useEffect } from "react";

const Index = () => {
  const { data, isLoading, error } = useHomeData();
  const isNative = useIsNativeApp();

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electron) {
      (window as any).electron.updateRPC({
        details: 'Browsing Anime',
        state: 'Main Menu'
      });
    }
  }, []);

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
      {!isNative && <Background />}
      {!isNative && <Sidebar />}

      <main className={cn(
        "relative z-10 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
        isNative ? "p-6" : "pl-6 md:pl-32"
      )}>
        <Header />

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


            <TierlistSection />

            {/* Continue Watching - Database backed for logged in users */}
            <ContinueWatching />

            {/* Continue Watching - LocalStorage for guests */}
            <LocalContinueWatching />

            {/* My Playlists */}
            <PlaylistSection />

            {/* Latest Episodes */}
            <LatestEpisodes animes={data.latestEpisodeAnimes} />
            <AIRecommendationBanner />



            {/* Languages Section */}
            <LanguagesSection />

            {/* Trending Grid */}
            <TrendingGrid animes={data.trendingAnimes} />

            {/* Upcoming Anime - From Jikan API */}
            <UpcomingAnimeSection />

            {/* Top 10 Anime */}
            <TopAnimeSection
              today={data.top10Animes.today}
              week={data.top10Animes.week}
              month={data.top10Animes.month}
            />

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
            <InfiniteHomeSections />

            <ReviewPopup />
          </>
        ) : null}
      </main>

      {!isNative && <MobileNav />}
    </div>
  );
};

export default Index;
