import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { AnimeCardWithPreview } from "@/components/anime/AnimeCardWithPreview";
import { Skeleton } from "@/components/ui/skeleton-custom";
import { useTrendingAnime, formatViewCount } from "@/hooks/useViews";
import { fetchHome, TrendingAnime as ApiTrendingAnime, AnimeCard } from "@/lib/api";
import { Flame, TrendingUp, Clock, Sparkles } from "lucide-react";
import { Sparkline } from '@/components/ui/Sparkline';
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { cn } from "@/lib/utils";

type TimeFrame = 'today' | 'week' | 'month' | 'all';

// Convert API trending anime to AnimeCard format for our component
function trendingToCard(trending: ApiTrendingAnime): AnimeCard {
  return {
    id: trending.id,
    name: trending.name,
    poster: trending.poster,
    type: 'TV',
    episodes: { sub: 0, dub: 0 },
    rating: undefined,
  };
}

function TrendingHero({ anime, rank, views }: { anime: AnimeCard; rank: number; views?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative w-full aspect-[16/9] md:aspect-[21/9] rounded-2xl md:rounded-3xl overflow-hidden mb-8 md:mb-12 group border border-white/10"
    >
      <div className="absolute inset-0">
        <img
          src={anime.poster}
          className="w-full h-full object-cover scale-105 group-hover:scale-100 transition-transform duration-1000"
          alt={anime.name}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
      </div>

      <div className="absolute inset-0 p-4 md:p-8 flex flex-col justify-end max-w-2xl">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-3 mb-4"
        >
          <div className="px-4 py-1.5 rounded-full bg-orange-500 text-white text-sm font-bold shadow-lg shadow-orange-500/40">
            # {rank} Trending
          </div>
          {views && (
            <div className="px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-white/80 text-sm font-medium border border-white/10">
              <span className="text-orange-400 font-bold mr-1">{formatViewCount(views)}</span> viewing now
            </div>
          )}
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="text-2xl sm:text-4xl md:text-5xl lg:text-7xl font-black font-display mb-3 md:mb-4 tracking-tight leading-tight"
        >
          {anime.name}
        </motion.h2>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex items-center gap-4"
        >
          <Link
            to={`/anime/${anime.id}`}
            className="px-4 md:px-8 py-2 md:py-3 bg-white text-black rounded-xl md:rounded-2xl text-sm md:text-base font-bold hover:scale-105 transition-transform"
          >
            Watch Now
          </Link>
          <Link
            to={`/anime/${anime.id}`}
            className="px-4 md:px-8 py-2 md:py-3 bg-white/10 backdrop-blur-md text-white rounded-xl md:rounded-2xl text-sm md:text-base font-bold hover:bg-white/20 transition-all border border-white/10"
          >
            Details
          </Link>
        </motion.div>
      </div>

      {/* Decorative Glow */}
      <div className="absolute -bottom-10 -right-10 w-64 h-64 bg-primary/20 blur-[100px] rounded-full" />
    </motion.div>
  );
}

export default function TrendingPage() {
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('week');

  // Use improved trending RPC with timeframe
  const { data: internalTrending, isLoading: loadingInternal } = useTrendingAnime(50, timeFrame);

  // Fallback to API trending
  const { data: homepageData, isLoading: loadingHomepage } = useQuery({
    queryKey: ['homepage'],
    queryFn: fetchHome,
    staleTime: 300000,
  });

  const isLoading = loadingInternal || loadingHomepage;

  // If we have internal trending data, use it; otherwise fall back to API
  const hasInternalData = internalTrending && internalTrending.length > 0;

  // Get anime cards from API homepage data
  const apiTrending = homepageData?.trendingAnimes || [];

  const timeFrameButtons: { id: TimeFrame; label: string; icon: React.ReactNode }[] = [
    { id: 'today', label: 'Today', icon: <Clock className="w-4 h-4" /> },
    { id: 'week', label: 'This Week', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'month', label: 'This Month', icon: <Flame className="w-4 h-4" /> },
    { id: 'all', label: 'All Time', icon: <Sparkles className="w-4 h-4" /> },
  ];

  const isNative = useIsNativeApp();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      {/* Dynamic Background Pattern */}
      <div className="fixed inset-0 pointer-events-none opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] animate-float-slow"></div>
      </div>

      <main className={cn(
        "relative z-10 pr-4 md:pr-6 py-4 md:py-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
        isNative ? "pl-4" : "pl-4 md:pl-32"
      )}>
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-orange-500 via-red-500 to-rose-500 shadow-lg shadow-orange-500/30 animate-pulse-slow">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Trending Anime</h1>
              <p className="text-muted-foreground text-sm">
                See what everyone's watching right now
              </p>
            </div>
          </div>

          {/* Time Frame Selector */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
            {timeFrameButtons.map(btn => (
              <button
                key={btn.id}
                onClick={() => setTimeFrame(btn.id)}
                className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${timeFrame === btn.id
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                  : 'bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground border border-border/30'
                  }`}
              >
                {btn.icon}
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Bar */}
        {hasInternalData && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-orange-500/20 via-red-500/20 to-pink-500/20 border border-orange-500/30 backdrop-blur-md shadow-inner">
            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-orange-400" />
                <span className="text-muted-foreground font-medium">Tracking</span>
                <span className="font-bold text-foreground">{internalTrending.length}</span>
                <span className="text-muted-foreground">anime</span>
              </div>
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-500" />
                <span className="text-muted-foreground font-medium">Top anime has</span>
                <span className="font-black text-rose-500 text-base">
                  {formatViewCount(internalTrending[0]?.views_week || 0)}
                </span>
                <span className="text-muted-foreground">weekly views</span>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4"
            >
              {Array.from({ length: 18 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ staggerChildren: 0.05 }}
              className="space-y-12"
            >
              {/* Hero for #1 */}
              {hasInternalData ? (
                <TrendingHero
                  anime={trendingToCard({ id: internalTrending[0].anime_id, name: internalTrending[0].anime_id, poster: '', rank: 1 })}
                  rank={1}
                  views={internalTrending[0]?.views_week}
                />
              ) : apiTrending[0] && (
                <TrendingHero
                  anime={trendingToCard(apiTrending[0])}
                  rank={1}
                />
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-10 md:gap-x-6 md:gap-y-12">
                {(hasInternalData ? internalTrending.slice(1) : apiTrending.slice(1)).map((t: any, index: number) => {
                  const anime = hasInternalData ? trendingToCard({ id: t.anime_id, name: t.anime_id, poster: '', rank: index + 2 }) : trendingToCard(t);
                  const rank = index + 2;

                  return (
                    <motion.div
                      key={anime.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="relative group"
                    >
                      {/* Premium Rank Badge */}
                      <div className="absolute -top-4 -left-4 z-20 flex flex-col items-center">
                        <div className="relative">
                          <div className="absolute inset-0 bg-primary blur-md opacity-40 group-hover:opacity-100 transition-opacity" />
                          <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 via-rose-500 to-pink-600 flex items-center justify-center text-white text-xl font-black shadow-xl ring-4 ring-background transform group-hover:-rotate-12 transition-transform duration-500">
                            {rank}
                          </div>
                        </div>
                      </div>

                      <div className="group-hover:translate-y-[-8px] transition-transform duration-500">
                        <AnimeCardWithPreview anime={anime} />

                        {hasInternalData && (
                          <div className="mt-4 px-2 space-y-2 hidden md:block">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pulse</span>
                              <span className="text-[10px] font-bold text-orange-400">{formatViewCount(t.views_week || 0)}</span>
                            </div>
                            <div className="h-[30px] w-full opacity-60 group-hover:opacity-100 transition-opacity">
                              <Sparkline series={t.sparkline as any} />
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main >

      <MobileNav />
    </div >
  );
}
