import { useHomeData } from "@/hooks/useAnimeData";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
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
import { DiscordSection } from "@/components/home/DiscordSection";
import { AppDownloadSection } from "@/components/home/AppDownloadSection";
import { HeroSkeleton, CardSkeleton } from "@/components/ui/skeleton-custom";
import { DynamicSuggestionBanner } from "@/components/suggestions/DynamicSuggestionBanner";
import { Heart, Sparkles } from "lucide-react";

const Index = () => {
  const { data, isLoading, error } = useHomeData();

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
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6">
        {/* Dynamic Suggestion Banner for Home Page */}
        <DynamicSuggestionBanner 
          context="home"
          maxPerSession={3}
          className="absolute top-4 right-4 md:top-6 md:right-6"
        />
        
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

            {/* Continue Watching - Database backed for logged in users */}
            <ContinueWatching />

            {/* Continue Watching - LocalStorage for guests */}
            <LocalContinueWatching />

            {/* My Playlists */}
            <PlaylistSection />

            {/* Latest Episodes */}
            <LatestEpisodes animes={data.latestEpisodeAnimes} />

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

            {/* Join Discord */}
            <div className="mb-24">
              <DiscordSection />
            </div>

            {/* Most Favorite */}
            <AnimeGrid
              animes={data.mostFavoriteAnimes.slice(0, 6)}
              title="Most Favorite"
              icon={<Sparkles className="w-5 h-5 text-amber" />}
            />

            {/* Download App - Always show for web */}
            <div className="mb-24">
              <AppDownloadSection />
            </div>

            {/* Infinite Scrolling Genre Sections */}
            <InfiniteHomeSections />
          </>
        ) : null}
      </main>

      <MobileNav />
    </div>
  );
};

export default Index;
