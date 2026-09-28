import { Trophy } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { TopAnime, getHighQualityPoster } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

interface TopAnimeSectionProps {
  today: TopAnime[];
  week: TopAnime[];
  month: TopAnime[];
}

type Period = "today" | "week" | "month";

export function TopAnimeSection({ today, week, month }: TopAnimeSectionProps) {
  const navigate = useNavigate();
  const [activePeriod, setActivePeriod] = useState<Period>("today");

  const periods: { key: Period; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
  ];

  const getAnimes = () => {
    switch (activePeriod) {
      case "today": return today;
      case "week": return week;
      case "month": return month;
    }
  };

  const getRankStyles = (index: number) => {
    if (index === 0) return "bg-gradient-to-br from-yellow-300 to-amber-500 text-black shadow-lg shadow-amber-500/40 w-9 h-9 text-base";
    if (index === 1) return "bg-gradient-to-br from-gray-200 to-gray-400 text-black shadow-lg shadow-gray-400/30 w-9 h-9 text-base";
    if (index === 2) return "bg-gradient-to-br from-orange-300 to-orange-500 text-black shadow-lg shadow-orange-500/30 w-9 h-9 text-base";
    return "bg-black/50 backdrop-blur-sm border border-white/10 text-white/90 w-7 h-7 text-xs";
  };

  return (
    <section className="mb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 px-2">
        <h3 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber/10 text-amber">
            <Trophy className="w-5 h-5" />
          </div>
          <span>Top <span className="text-amber">10</span> Anime</span>
        </h3>
        
        <div className="flex gap-1 p-1 rounded-full bg-white/5 border border-white/10">
          {periods.map((period) => (
            <button
              key={period.key}
              onClick={() => setActivePeriod(period.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
                activePeriod === period.key
                  ? "bg-white/15 backdrop-blur-md text-white shadow-sm"
                  : "text-muted-foreground hover:text-white hover:bg-white/5"
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 md:gap-5">
        {getAnimes().slice(0, 10).map((anime, idx) => (
          <GlassPanel
            key={anime.id}
            hoverEffect
            className="group cursor-pointer overflow-hidden"
            onClick={() => navigate(`/anime/${anime.id}`)}
          >
            <div className="relative aspect-[2/3]">
              <img
                src={getHighQualityPoster(anime.poster, anime.anilistId)}
                alt={anime.name}
                className="w-full h-full object-cover transition-all duration-700 ease-out group-hover:scale-105 group-hover:brightness-110"
                loading="lazy"
              />
              
              {/* Overlays */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/10" />
              
              {/* Rank Badge */}
              <div className={`absolute top-3 left-3 rounded-md flex items-center justify-center font-black shadow-black/50 ${getRankStyles(idx)}`}>
                {anime.rank ?? idx + 1}
              </div>

              {/* Content */}
              <div className="absolute bottom-0 left-0 right-0 p-4 pt-10">
                <h4 className="font-bold text-sm leading-tight line-clamp-2 drop-shadow-md group-hover:text-amber transition-colors duration-300">
                  {anime.name}
                </h4>
                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-flex items-center bg-white/10 backdrop-blur-sm border border-white/5 px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider text-white/80">
                    EP {anime.episodes.sub}
                  </span>
                </div>
              </div>
            </div>
          </GlassPanel>
        ))}
      </div>
    </section>
  );
}