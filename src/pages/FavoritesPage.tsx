import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { AnimeCardWithPreview } from "@/components/anime/AnimeCardWithPreview";
import { Skeleton } from "@/components/ui/skeleton-custom";
import { usePersonalizedRecommendations, useGenrePreferences } from "@/hooks/useRecommendations";
import { useSmartFavorites, SmartFavorite } from "@/hooks/useSmartFavorites";
import { useMLRecommendations, useTasteProfile } from "@/hooks/useMLRecommendations";
import { useWatchlist, useBulkRemoveFromWatchlist, useAddToWatchlist } from "@/hooks/useWatchlist";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Heart, Sparkles, TrendingUp, BookOpen, CheckCircle, Clock, Pause, X, Filter, PlayCircle, Brain, Star, ArrowRight } from "lucide-react";
import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getProxiedImageUrl, AnimeCard } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

type TabType = 'for-you' | 'ai-recs' | 'all' | 'watching' | 'completed' | 'plan' | 'on-hold' | 'dropped';

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'for-you', label: 'For You', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'ai-recs', label: 'AI Recommendations', icon: <Brain className="w-4 h-4" /> },
  { id: 'all', label: 'All', icon: <BookOpen className="w-4 h-4" /> },
  { id: 'watching', label: 'Watching', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'completed', label: 'Completed', icon: <CheckCircle className="w-4 h-4" /> },
  { id: 'plan', label: 'Plan to Watch', icon: <Clock className="w-4 h-4" /> },
  { id: 'on-hold', label: 'On Hold', icon: <Pause className="w-4 h-4" /> },
  { id: 'dropped', label: 'Dropped', icon: <X className="w-4 h-4" /> },
];

const STATUS_MAP: Record<TabType, string | null> = {
  'for-you': null,
  'ai-recs': null,
  'all': null,
  'watching': 'watching',
  'completed': 'completed',
  'plan': 'plan_to_watch',
  'on-hold': 'on_hold',
  'dropped': 'dropped',
};

function FavoritesHero({ anime }: { anime: any }) {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative w-full aspect-[16/9] md:aspect-[21/9] lg:aspect-[21/7] rounded-xl md:rounded-[2rem] overflow-hidden mb-8 md:mb-12 group border border-white/10"
    >
      <div className="absolute inset-0">
        <img
          src={getProxiedImageUrl(anime.anime_poster || anime.poster || '')}
          className="w-full h-full object-cover scale-105 group-hover:scale-100 transition-transform duration-1000 brightness-75 contrast-110"
          alt={anime.anime_name || anime.name}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-80" />
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4 md:p-6 lg:p-12 flex flex-col justify-end max-w-3xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="px-2 md:px-3 py-1 rounded-full bg-pink-500/20 backdrop-blur-md border border-pink-500/30 text-pink-400 text-[10px] md:text-xs font-bold uppercase tracking-widest">
            Currently Watching
          </div>
          {anime.status && (
            <div className="px-3 py-1 rounded-full bg-white/5 backdrop-blur-md border border-white/10 text-white/60 text-xs font-medium uppercase">
              {anime.status.replace('_', ' ')}
            </div>
          )}
        </div>

        <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-black font-display mb-4 md:mb-6 tracking-tight text-white drop-shadow-2xl leading-tight">
          {anime.anime_name || anime.name}
        </h2>

        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/anime/${anime.anime_id || anime.id}`)}
            className="flex items-center gap-2 px-4 md:px-8 py-2 md:py-3 bg-white text-black rounded-xl md:rounded-2xl text-sm md:text-base font-bold hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10"
          >
            <PlayCircle className="w-5 h-5" />
            Resume Watching
          </button>
          <button
            onClick={() => navigate(`/anime/${anime.anime_id || anime.id}`)}
            className="hidden sm:block px-4 md:px-8 py-2 md:py-3 bg-white/10 backdrop-blur-md text-white rounded-xl md:rounded-2xl text-sm md:text-base font-bold hover:bg-white/20 transition-all border border-white/10"
          >
            Details
          </button>
        </div>
      </div>

      {/* Visual Accent */}
      <div className="absolute top-1/2 right-12 -translate-y-1/2 hidden lg:block opacity-20 pointer-events-none group-hover:scale-110 group-hover:opacity-30 transition-all duration-1000">
        <Heart className="w-64 h-64 text-pink-500 fill-current blur-3xl" />
      </div>
    </motion.div>
  );
}

export default function FavoritesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('for-you');
  const [sortBy, setSortBy] = useState<'recent' | 'alpha' | 'favorites'>('recent');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: recommendations, isLoading: loadingRecs } = usePersonalizedRecommendations(24);
  const { data: mlRecommendations, isLoading: loadingML } = useMLRecommendations(30);
  const { data: tasteProfile, isLoading: loadingProfile } = useTasteProfile();
  const { data: genrePrefs } = useGenrePreferences();
  const { data: watchlist, isLoading: loadingWatchlist } = useWatchlist();
  const { data: smartFavorites, isLoading: loadingSmart } = useSmartFavorites(6);
  const bulkRemove = useBulkRemoveFromWatchlist();
  const addToWatchlist = useAddToWatchlist();

  // Highlight the most recent watching anime
  const heroAnime = useMemo(() => {
    if (!watchlist || watchlist.length === 0) return null;
    const watching = watchlist.filter(item => item.status === 'watching');
    return watching.length > 0 ? watching[0] : watchlist[0];
  }, [watchlist]);

  // Filter watchlist by status
  const filteredWatchlist = useMemo(() => {
    if (!watchlist) return [];
    let list = [...watchlist];
    if (activeTab !== 'all' && STATUS_MAP[activeTab]) {
      list = list.filter(item => item.status === STATUS_MAP[activeTab]);
    }

    if (sortBy === 'alpha') {
      list.sort((a, b) => a.anime_name.localeCompare(b.anime_name));
    } else if (sortBy === 'recent') {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list;
  }, [watchlist, activeTab, sortBy]);

  const showRecommendations = activeTab === 'for-you';
  const showMLRecs = activeTab === 'ai-recs';
  const isLoading = showRecommendations ? loadingRecs : (showMLRecs ? loadingML || loadingProfile : loadingWatchlist);

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
        <Background />
        <Sidebar />
        <main className="relative z-10 pl-4 md:pl-32 pr-4 md:pr-6 py-4 md:py-6 max-w-[1800px] mx-auto pb-24 md:pb-6">
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Heart className="w-20 h-20 text-pink-500/20 mb-8 mx-auto" />
              <h1 className="text-3xl font-black mb-4">Your Favorites</h1>
              <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
                Sign in to see personalized recommendations and manage your watchlist
              </p>
              <button
                onClick={() => navigate('/auth')}
                className="px-8 py-3 rounded-2xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/20"
              >
                Sign In
              </button>
            </motion.div>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-4 md:pl-32 pr-4 md:pr-6 py-4 md:py-6 max-w-[1800px] mx-auto pb-24 md:pb-6">
        {/* Header */}
        <div className="mb-8 md:mb-12">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-[1.25rem] bg-gradient-to-br from-pink-500 via-rose-500 to-red-500 shadow-xl shadow-pink-500/30">
                <Heart className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl md:text-5xl font-black tracking-tighter">Favorites</h1>
                <p className="text-muted-foreground font-medium">
                  {showRecommendations
                    ? 'Curated just for you'
                    : `${filteredWatchlist.length} anime saved to your collection`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-card/40 backdrop-blur-xl text-sm px-4 py-2.5 rounded-xl border border-white/5 focus:ring-2 focus:ring-primary/50 transition-all"
              >
                <option value="recent">Recently Added</option>
                <option value="alpha">A-Z Name</option>
              </select>

              <button
                onClick={() => setSelectMode(v => !v)}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${selectMode
                  ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105'
                  : 'bg-card/40 backdrop-blur-xl text-muted-foreground hover:text-white border border-white/5'
                  }`}
              >
                {selectMode ? 'Done' : 'Manage List'}
              </button>

              {selectMode && selectedIds.length > 0 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={async () => {
                    if (!confirm(`Remove ${selectedIds.length} items?`)) return;
                    await bulkRemove.mutateAsync(selectedIds);
                    setSelectedIds([]);
                    setSelectMode(false);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-destructive text-white text-sm font-bold shadow-lg shadow-destructive/20 hover:scale-105 transition-all"
                >
                  Remove ({selectedIds.length})
                </motion.button>
              )}
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-none mask-fade-right">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition-all whitespace-nowrap backdrop-blur-md border ${activeTab === tab.id
                  ? 'bg-white text-black border-white shadow-xl scale-105'
                  : 'bg-card/30 text-muted-foreground hover:text-white border-white/5 hover:bg-card/50'
                  }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recommendations Section */}
        {recommendations && recommendations.length > 0 && activeTab !== 'for-you' && (
          <div className="mb-8 md:mb-12">
            <div className="flex items-center gap-2 mb-6">
              <Sparkles className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-bold">Recommended for You</h2>
              <span className="text-xs text-muted-foreground ml-2">(Based on your preferences)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
              {recommendations.slice(0, 6).map((item: any, index: number) => (
                <motion.div
                  key={item.anime.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="relative group"
                >
                  <AnimeCardWithPreview anime={item.anime} />
                  {item.reason && (
                    <div className="mt-2 px-1 line-clamp-1">
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{item.reason}</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Content with Hero */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
          >
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
                ))}
              </div>
            ) : (
              <>
                {/* Hero Section for primary tab */}
                {activeTab === 'for-you' && heroAnime && (
                  <FavoritesHero anime={heroAnime} />
                )}

                {/* Smart Favorites Section */}
                {showRecommendations && smartFavorites && smartFavorites.length > 0 && (
                  <div className="mb-12">
                    <div className="flex items-center gap-2 mb-6">
                      <Sparkles className="w-5 h-5 text-yellow-400" />
                      <h2 className="text-xl font-bold">Suggested Favorites</h2>
                      <span className="text-xs text-muted-foreground ml-2">(Based on your watch history)</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                      {smartFavorites.map((item) => (
                        <div key={item.animeId} className="relative group">
                          <div className="aspect-[2/3] rounded-xl overflow-hidden mb-2 relative">
                            <img src={getProxiedImageUrl(item.animePoster || '')} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button
                                onClick={() => addToWatchlist.mutate({ animeId: item.animeId, animeName: item.animeName, animePoster: item.animePoster || undefined, status: 'watching' })}
                                className="p-2 rounded-full bg-primary text-white hover:scale-110 transition-transform"
                                title="Add to Favorites"
                              >
                                <Heart className="w-4 h-4 fill-current" />
                              </button>
                            </div>
                            <div className="absolute bottom-0 inset-x-0 p-1 bg-black/60 backdrop-blur-sm text-[10px] text-center text-white/90">
                              {item.reason}
                            </div>
                          </div>
                          <h3 className="text-xs font-bold truncate">{item.animeName}</h3>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Genre Filter Pills */}
                {showRecommendations && genrePrefs && genrePrefs.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-10 p-2 rounded-3xl bg-white/5 border border-white/5 backdrop-blur-sm">
                    <div className="flex items-center gap-2 px-4 py-2 text-pink-400">
                      <Filter className="w-4 h-4" />
                      <span className="text-xs font-black uppercase tracking-widest">Filter</span>
                    </div>
                    {genrePrefs.slice(0, 10).map(pref => (
                      <button
                        key={pref.genre}
                        onClick={() => navigate(`/genre/${encodeURIComponent(pref.genre)}`)}
                        className="px-4 py-2 rounded-2xl text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/5 transition-all hover:scale-105 active:scale-95"
                      >
                        {pref.genre} <span className="opacity-40 ml-1">{pref.count}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Taste Profile Display for AI Recs */}
                {showMLRecs && tasteProfile && (
                  <div className="space-y-8 mb-12">
                    {/* Striking AI Banner */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="relative overflow-hidden group cursor-pointer"
                      onClick={() => navigate('/recommendations')}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 opacity-20 group-hover:opacity-30 transition-opacity" />
                      <div className="absolute inset-0 backdrop-blur-3xl" />

                      <div className="relative p-8 md:p-12 rounded-[2.5rem] border border-white/10 flex flex-col md:flex-row items-center justify-between gap-8 overflow-hidden">
                        {/* Animated Background Elements */}
                        <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/20 rounded-full blur-[100px] animate-pulse" />
                        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-pink-500/10 rounded-full blur-[100px] animate-pulse delay-700" />

                        <div className="flex-1 space-y-4 text-center md:text-left z-10">
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 backdrop-blur-md">
                            <Sparkles className="w-4 h-4 text-yellow-400" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/80">Premium AI Feature</span>
                          </div>
                          <h2 className="text-3xl md:text-5xl font-black tracking-tighter text-white">
                            DEEP DIVE INTO YOUR<br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/40">ANIME TASTE PROFILE</span>
                          </h2>
                          <p className="text-muted-foreground font-medium max-w-md">
                            Our advanced machine learning engine has analyzed your viewing habits. Discover exactly why we think you'll love these titles.
                          </p>
                          <div className="flex items-center gap-4 justify-center md:justify-start pt-2">
                            <button onClick={() => navigate('/recommendations')} className="rounded-full px-8 py-6 bg-white text-black font-bold hover:bg-white/90 gap-2">
                              Explore Full Analysis
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="relative z-10 shrink-0">
                          <div className="relative w-40 h-40 md:w-56 md:h-56">
                            <div className="absolute inset-0 bg-gradient-to-tr from-primary to-pink-500 rounded-full blur-2xl opacity-20 animate-spin-slow" />
                            <div className="relative w-full h-full bg-card/40 backdrop-blur-2xl rounded-full border border-white/10 flex items-center justify-center">
                              <Brain className="w-20 h-20 md:w-32 md:h-32 text-white/20" />
                              <motion.div
                                animate={{ scale: [1, 1.1, 1] }}
                                transition={{ duration: 4, repeat: Infinity }}
                                className="absolute"
                              >
                                <Sparkles className="w-12 h-12 md:w-20 md:h-20 text-primary drop-shadow-glow" />
                              </motion.div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>

                    <div className="p-6 rounded-[2rem] bg-card/30 backdrop-blur-xl border border-white/5 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-1000">
                        <Brain className="w-48 h-48 text-primary" />
                      </div>

                      <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="p-3 bg-primary/20 rounded-xl">
                            <Brain className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <h2 className="text-xl font-bold">Your Taste Profile</h2>
                            <p className="text-sm text-muted-foreground">ML analysis of your preferences</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                          <div>
                            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Top Preferred Genres</h3>
                            <div className="flex flex-wrap gap-2">
                              {tasteProfile.preferredGenres.slice(0, 5).map((g, i) => (
                                <div key={i} className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-sm font-bold flex items-center gap-2">
                                  <span>{g.genre}</span>
                                  <span className="text-[10px] text-primary">{Math.round(g.weight * 100)}%</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Watch Style</h3>
                            <div className="space-y-3">
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-medium">Diversity Score</span>
                                <span className="font-bold text-primary">{Math.round(tasteProfile.diversityScore * 100)}%</span>
                              </div>
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full"
                                  style={{ width: `${tasteProfile.diversityScore * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col justify-center">
                            <button onClick={() => navigate('/recommendations')} className="group/btn relative inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-bold rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20">
                              View Full Analysis
                              <Sparkles className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-10 md:gap-x-6 md:gap-y-12">
                  {(showMLRecs ? (mlRecommendations || []) : (showRecommendations ? (recommendations || []) : filteredWatchlist)).map((item: any, index: number) => {
                    const anim = showMLRecs || showRecommendations ? (item.anime || item) : {
                      id: item.anime_id,
                      name: item.anime_name,
                      poster: item.anime_poster,
                      type: 'TV',
                      episodes: { sub: 0, dub: 0 }
                    };

                    return (
                      <motion.div
                        key={showMLRecs ? item.anime?.id : (showRecommendations ? item.anime.id : item.id)}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.02 }}
                        className="relative group lg:hover:z-50"
                      >
                        {selectMode && !showRecommendations && !showMLRecs && (
                          <div className="absolute top-4 left-4 z-40">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(anim.id)}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedIds(s => [...s, anim.id]);
                                else setSelectedIds(s => s.filter(id => id !== anim.id));
                              }}
                              className="w-6 h-6 rounded-lg border-2 border-white/10 bg-black/40 text-primary focus:ring-primary shadow-2xl"
                            />
                          </div>
                        )}

                        <div className={cn("transition-transform duration-500", selectMode && selectedIds.includes(anim.id) && "scale-95")}>
                          <AnimeCardWithPreview anime={anim} />

                          {/* Status label if on watchlist tabs */}
                          {!showRecommendations && !showMLRecs && item.status && (
                            <div className="mt-4 px-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground opacity-60">Status</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                                  {item.status.replace('_', ' ')}
                                </span>
                              </div>
                            </div>
                          )}

                          {(showRecommendations || showMLRecs) && item.reason && (
                            <div className="mt-3 px-2 line-clamp-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-[10px] font-bold text-pink-400 uppercase tracking-widest">{item.reason}</span>
                            </div>
                          )}

                          {showMLRecs && item.score && (
                            <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 z-20">
                              <div className="flex items-center gap-1">
                                <Star className="w-3 h-3 text-yellow-400 fill-current" />
                                <span className="text-[10px] font-black text-white">{item.score}%</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Empty State */}
                {(!isLoading && (showRecommendations ? !recommendations?.length : !filteredWatchlist.length)) && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-24"
                  >
                    <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                      <BookOpen className="w-10 h-10 text-muted-foreground opacity-20" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">No Anime Found</h3>
                    <p className="text-muted-foreground max-w-xs mx-auto">
                      Explore more titles to populate this collection with your favorites.
                    </p>
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <MobileNav />
    </div>
  );
}

function cn(...args: any[]) {
  return args.filter(Boolean).join(' ');
}
