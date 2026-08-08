/**
 * MangaTrendingSection — plug-in section that renders a horizontal
 * scrollable row of manga cards, with tab support for
 * Manga / Manhwa / Latest Updates.
 *
 * Used in TrendingPage, RecommendationsPage, and CollectionsPage.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { BookOpen, TrendingUp, Clock, ChevronRight, Star, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton-custom";
import {
  getTrendingManga,
  getTrendingManhwa,
  getLatestMangaUpdates,
  type MangaCard,
} from "@/core/content/manga-client";

type MangaTab = "manga" | "manhwa" | "latest";

interface MangaTrendingSectionProps {
  title?: string;
  /** Only show specific tab on load */
  defaultTab?: MangaTab;
  /** Max cards to render */
  limit?: number;
  /** Whether to show tab switcher */
  showTabs?: boolean;
}

function MangaSmallCard({ manga, index }: { manga: MangaCard; index: number }) {
  const href = manga.anilistId
    ? `/manga/anilist:${manga.anilistId}`
    : manga.malId
      ? `/manga/mal:${manga.malId}`
      : `/manga/${manga.id}`;

  const statusColor: Record<string, string> = {
    releasing: "text-emerald-400",
    finished: "text-sky-400",
    not_yet_released: "text-amber-400",
    cancelled: "text-red-400",
    hiatus: "text-orange-400",
  };

  const statusLabel: Record<string, string> = {
    releasing: "Ongoing",
    finished: "Completed",
    not_yet_released: "Upcoming",
    cancelled: "Cancelled",
    hiatus: "Hiatus",
  };

  const statusKey = manga.status.toLowerCase().replace(/\s+/g, "_");

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.4) }}
      whileHover={{ y: -6, scale: 1.02 }}
      className="flex-shrink-0 w-[140px] sm:w-[160px] group cursor-pointer"
    >
      <Link to={href} className="block">
        {/* Card image */}
        <div className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-white/10 group-hover:border-primary/50 transition-all duration-300 mb-2.5 shadow-lg group-hover:shadow-xl group-hover:shadow-primary/15">
          {manga.poster ? (
            <img
              src={manga.poster}
              alt={manga.title}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="w-full h-full bg-muted/50 flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-muted-foreground/40" />
            </div>
          )}

          {/* Rank number — subtle top-left */}
          <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-black/70 backdrop-blur-sm flex items-center justify-center">
            <span className="text-[9px] font-black text-white/80">{index + 1}</span>
          </div>

          {/* Score badge */}
          {manga.score !== null && manga.score > 0 && (
            <div className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-[10px] font-bold text-amber-400">
              <Star className="w-2.5 h-2.5 fill-current" />
              {(manga.score / 10).toFixed(1)}
            </div>
          )}

          {/* Format badge */}
          {manga.format && manga.format !== "manga" && (
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-primary/80 backdrop-blur-sm text-[9px] font-bold text-primary-foreground capitalize">
              {manga.format}
            </div>
          )}

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-start justify-end p-2.5 gap-0.5">
            {manga.chapters && (
              <p className="text-[10px] text-white/80 font-medium">{manga.chapters} ch.</p>
            )}
            <p className={`text-[10px] font-bold ${statusColor[statusKey] ?? "text-gray-400"}`}>
              {statusLabel[statusKey] ?? manga.status}
            </p>
          </div>
        </div>

        {/* Title and genres */}
        <p className="text-xs font-semibold leading-tight line-clamp-2 text-foreground/90 group-hover:text-foreground transition-colors px-0.5">
          {manga.title}
        </p>
        {manga.genres.length > 0 && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate px-0.5">
            {manga.genres.slice(0, 2).join(" · ")}
          </p>
        )}
      </Link>
    </motion.div>
  );
}

function MangaCardSkeleton() {
  return (
    <div className="flex-shrink-0 w-[140px] sm:w-[160px] space-y-2">
      <Skeleton className="aspect-[3/4] rounded-2xl" />
      <Skeleton className="h-3 w-full rounded-full" />
      <Skeleton className="h-2.5 w-3/4 rounded-full" />
    </div>
  );
}

const TABS: { id: MangaTab; label: string; icon: React.ReactNode; color: string }[] = [
  { id: "manga", label: "Manga", icon: <TrendingUp className="w-3.5 h-3.5" />, color: "from-violet-600/80 to-purple-700/80 shadow-violet-500/20" },
  { id: "manhwa", label: "Manhwa", icon: <BookOpen className="w-3.5 h-3.5" />, color: "from-sky-600/80 to-blue-700/80 shadow-sky-500/20" },
  { id: "latest", label: "New Chapters", icon: <Clock className="w-3.5 h-3.5" />, color: "from-emerald-600/80 to-teal-700/80 shadow-emerald-500/20" },
];

export function MangaTrendingSection({
  title = "Trending Manga & Manhwa",
  defaultTab = "manga",
  limit = 18,
  showTabs = true,
}: MangaTrendingSectionProps) {
  const [activeTab, setActiveTab] = useState<MangaTab>(defaultTab);

  const { data: mangaData = [], isLoading: loadingManga } = useQuery({
    queryKey: ["trending-manga", limit],
    queryFn: () => getTrendingManga(limit),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const { data: manhwaData = [], isLoading: loadingManhwa } = useQuery({
    queryKey: ["trending-manhwa", limit],
    queryFn: () => getTrendingManhwa(limit),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: showTabs,
  });

  const { data: latestData = [], isLoading: loadingLatest } = useQuery({
    queryKey: ["latest-manga-updates", limit],
    queryFn: () => getLatestMangaUpdates(limit),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled: showTabs,
  });

  const activeItems: MangaCard[] =
    activeTab === "manga" ? mangaData :
    activeTab === "manhwa" ? manhwaData :
    latestData;

  const isLoading =
    activeTab === "manga" ? loadingManga :
    activeTab === "manhwa" ? loadingManhwa :
    loadingLatest;

  const activeTabConfig = TABS.find((t) => t.id === activeTab) || TABS[0];

  return (
    <section className="mb-12">
      {/* Section header */}
      <div className="flex items-center justify-between mb-5 px-0.5">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${activeTabConfig.color} border border-white/10 flex items-center justify-center flex-shrink-0 shadow-lg transition-all duration-300`}>
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-bold leading-tight">{title}</h2>
            <p className="text-xs text-muted-foreground">
              {activeTab === "manga" ? "Top-rated trending manga" : activeTab === "manhwa" ? "Korean webtoon charts" : "Recently updated chapters"}
            </p>
          </div>
        </div>
        <Link
          to="/manga"
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors group"
        >
          View All
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {/* Tab switcher */}
      {showTabs && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id
                  ? `bg-gradient-to-r ${tab.color} text-white shadow-md`
                  : "bg-white/5 text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 hover:bg-white/8"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable card row */}
      <div className="overflow-x-auto pb-3 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="flex gap-3 md:gap-4"
          >
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <MangaCardSkeleton key={`manga-skeleton-${i}`} />
                ))
              : activeItems.slice(0, limit).map((manga, i) => (
                  <MangaSmallCard key={`${manga.id}-${i}`} manga={manga} index={i} />
                ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
