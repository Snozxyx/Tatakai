import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { AnimeCardWithPreview } from "@/components/anime/AnimeCardWithPreview";
import { useQuery } from "@tanstack/react-query";
import { fetchHome, AnimeCard, fetchJikanSeasonNow, fetchJikanSeasonUpcoming, jikanToAnimeCard, getProxiedImageUrl } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardSkeleton } from "@/components/ui/skeleton-custom";
import { ArrowLeft, TrendingUp, Star, Clock, Flame, Heart, PlayCircle, Library, Calendar, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type TabType = 'trending' | 'popular' | 'favorites' | 'airing' | 'completed' | 'season-now' | 'upcoming';

const TABS: { id: TabType; icon: any; label: string; isJikan?: boolean }[] = [
  { id: "popular", icon: Flame, label: "Popular" },
  { id: "favorites", icon: Heart, label: "Favorite" },
  { id: "airing", icon: Star, label: "Airing" },
  { id: "completed", icon: Clock, label: "Completing" },
  { id: "season-now", icon: Calendar, label: "The Season", isJikan: true },
  { id: "upcoming", icon: Sparkles, label: "Upcoming", isJikan: true },
];

function CollectionsHero({ anime, title }: { anime: AnimeCard; title: string }) {
  const navigate = useNavigate();

  // Handle MAL anime IDs (they start with "mal-")
  const handleClick = () => {
    if (anime.id.startsWith('mal-')) {
      // For MAL anime, open in new tab to MAL page or search
      window.open(`https://myanimelist.net/anime/${anime.id.replace('mal-', '')}`, '_blank');
    } else {
      navigate(`/anime/${anime.id}`);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative w-full aspect-[16/9] md:aspect-[21/9] rounded-xl md:rounded-[2rem] overflow-hidden mb-8 md:mb-12 group border border-white/10"
    >
      <div className="absolute inset-0">
        <img
          src={getProxiedImageUrl(anime.poster)}
          className="w-full h-full object-cover scale-105 group-hover:scale-100 transition-transform duration-1000 brightness-75"
          alt={anime.name}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-80" />
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4 md:p-8 lg:p-12 flex flex-col justify-end max-w-3xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="px-2 md:px-3 py-1 rounded-full bg-orange-500/20 backdrop-blur-md border border-orange-500/30 text-orange-400 text-[10px] md:text-xs font-bold uppercase tracking-widest flex items-center gap-1 md:gap-2">
            <Star className="w-3 h-3 fill-current" />
            Top Featured in {title}
          </div>
        </div>

        <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-black font-display mb-4 md:mb-6 tracking-tight text-white drop-shadow-2xl leading-tight">
          {anime.name}
        </h2>

        <div className="flex items-center gap-4">
          <button
            onClick={handleClick}
            className="flex items-center gap-2 px-4 md:px-8 py-2 md:py-3 bg-white text-black rounded-xl md:rounded-2xl text-sm md:text-base font-bold hover:scale-105 transition-all shadow-xl"
          >
            <PlayCircle className="w-5 h-5" />
            {anime.id.startsWith('mal-') ? 'View on MAL' : 'Watch Now'}
          </button>
          <button
            onClick={handleClick}
            className="hidden sm:block px-4 md:px-8 py-2 md:py-3 bg-white/10 backdrop-blur-md text-white rounded-xl md:rounded-2xl text-sm md:text-base font-bold hover:bg-white/20 transition-all border border-white/10"
          >
            Details
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function CollectionsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("popular");

  // Fetch home data for internal collections
  const { data: homeData, isLoading: loadingHome } = useQuery({
    queryKey: ['home'],
    queryFn: fetchHome,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch Jikan season data
  const { data: seasonNowData, isLoading: loadingSeasonNow } = useQuery({
    queryKey: ['jikan-season-now'],
    queryFn: () => fetchJikanSeasonNow(1),
    staleTime: 10 * 60 * 1000,
    enabled: activeTab === 'season-now',
  });

  const { data: upcomingData, isLoading: loadingUpcoming } = useQuery({
    queryKey: ['jikan-upcoming'],
    queryFn: () => fetchJikanSeasonUpcoming(1),
    staleTime: 10 * 60 * 1000,
    enabled: activeTab === 'upcoming',
  });

  const isLoading = loadingHome ||
    (activeTab === 'season-now' && loadingSeasonNow) ||
    (activeTab === 'upcoming' && loadingUpcoming);

  const currentCollection = useMemo(() => {
    // Jikan tabs
    if (activeTab === 'season-now' && seasonNowData?.data) {
      return seasonNowData.data.map(jikanToAnimeCard);
    }
    if (activeTab === 'upcoming' && upcomingData?.data) {
      return upcomingData.data.map(jikanToAnimeCard);
    }

    // Internal API tabs
    if (!homeData) return [];
    switch (activeTab) {
      case 'trending': return homeData.trendingAnimes || [];
      case 'popular': return homeData.mostPopularAnimes || [];
      case 'favorites': return homeData.mostFavoriteAnimes || [];
      case 'airing': return homeData.topAiringAnimes || [];
      case 'completed': return homeData.latestCompletedAnimes || [];
      default: return [];
    }
  }, [homeData, seasonNowData, upcomingData, activeTab]);

  const collectionTitle = useMemo(() => {
    switch (activeTab) {
      case 'popular': return "Most Popular";
      case 'favorites': return "Fan Favorites";
      case 'airing': return "Top Airing";
      case 'completed': return "Just Completing";
      case 'season-now': return "The Season";
      case 'upcoming': return "Upcoming Hype";
      default: return "Collections";
    }
  }, [activeTab]);

  const collectionToCard = (a: any): AnimeCard => ({
    id: a.id || '',
    name: a.name || '',
    poster: a.poster || '',
    type: a.type || 'TV',
    episodes: a.episodes || { sub: 0, dub: 0 },
    rating: a.rating
  });

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-4 md:pl-32 pr-4 md:pr-6 py-4 md:py-6 max-w-[1800px] mx-auto pb-24 md:pb-6">
        {/* Header */}
        <div className="mb-8 md:mb-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 md:p-4 rounded-[1.25rem] bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-xl shadow-purple-500/30">
                <Library className="w-6 h-6 md:w-8 md:h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl lg:text-5xl font-black tracking-tighter">Collections</h1>
                <p className="text-muted-foreground text-sm md:text-base font-medium">
                  Explore curated masterpiece libraries
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 px-4 md:px-5 py-2 md:py-2.5 rounded-xl bg-card/40 backdrop-blur-xl border border-white/5 text-muted-foreground hover:text-white transition-all w-fit"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-bold">Go Back</span>
            </button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="w-full">
          <TabsList className="flex gap-2 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 h-auto bg-transparent mb-8 md:mb-12 md:flex-wrap">
            {TABS.map(tab => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="gap-1 md:gap-2 px-3 md:px-6 py-2 md:py-3 rounded-xl md:rounded-2xl text-xs md:text-sm data-[state=active]:bg-white data-[state=active]:text-black border border-white/5 data-[state=active]:border-white shadow-none transition-all whitespace-nowrap flex-shrink-0"
              >
                <tab.icon className="w-3 h-3 md:w-4 md:h-4" />
                <span className="font-bold">{tab.label}</span>
                {tab.isJikan && (
                  <span className="hidden md:inline text-[10px] opacity-60 ml-1">MAL</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <AnimatePresence mode="wait">
            <TabsContent key={activeTab} value={activeTab} className="mt-0 ring-0 focus-visible:ring-0 outline-none">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.4 }}
              >
                {isLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                    {Array.from({ length: 18 }).map((_, i) => (
                      <CardSkeleton key={i} />
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Hero for top collection item */}
                    {currentCollection[0] && (
                      <CollectionsHero
                        anime={collectionToCard(currentCollection[0])}
                        title={collectionTitle}
                      />
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-10 md:gap-x-6 md:gap-y-12">
                      {currentCollection.slice(1).map((item, index) => {
                        const anime = collectionToCard(item);
                        return (
                          <motion.div
                            key={anime.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.02 }}
                          >
                            <AnimeCardWithPreview anime={anime} />
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* Empty state */}
                    {currentCollection.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-24 text-center">
                        <Library className="w-16 h-16 text-muted-foreground/20 mb-4" />
                        <h3 className="text-xl font-bold mb-2">No Anime Found</h3>
                        <p className="text-muted-foreground">
                          Try selecting a different collection tab
                        </p>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            </TabsContent>
          </AnimatePresence>
        </Tabs>
      </main>

      <MobileNav />
    </div>
  );
}
