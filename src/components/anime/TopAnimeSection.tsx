import { memo, useState } from "react";
import { Trophy } from "lucide-react";
import { TopAnime, getHighQualityPoster } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface TopAnimeSectionProps {
  today: TopAnime[];
  week: TopAnime[];
  month: TopAnime[];
}

type Period = "today" | "week" | "month";

export const TopAnimeSection = memo(function TopAnimeSection({ today, week, month }: TopAnimeSectionProps) {
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
    <section className="mb-14 md:mb-24" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 600px' }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 md:mb-8 px-1 md:px-2">
        <h3 className="font-display text-xl md:text-2xl font-semibold tracking-tight flex items-center gap-2.5">
          <div className="p-1.5 rounded-xl bg-amber/10 text-amber border border-amber/20">
            <Trophy className="w-5 h-5" />
          </div>
          <span>Top <span className="text-amber">10</span> Anime</span>
        </h3>

        <div className="flex w-full sm:w-auto gap-1 p-1 rounded-full bg-white/5 border border-white/10 max-w-full overflow-x-auto no-scrollbar scrollbar-hide [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y] overscroll-x-contain">
          {periods.map((period) => (
            <button
              key={period.key}
              onClick={() => setActivePeriod(period.key)}
              className={cn(
                'shrink-0 min-h-[36px] px-3 md:px-4 py-1.5 rounded-full text-xs md:text-sm font-semibold transition-colors active:scale-95',
                activePeriod === period.key
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-muted-foreground hover:text-white hover:bg-white/5"
              )}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid — plain cards on mobile (no backdrop-blur / hover scale) for 60fps scroll */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-5">
        {getAnimes().slice(0, 10).map((anime, idx) => (
          <button
            key={anime.id}
            type="button"
            onClick={() => navigate(`/anime/${anime.id}`)}
            className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] text-left transition-transform duration-200 active:scale-[0.98] md:hover:border-white/[0.14]"
            style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 280px' }}
          >
            <div className="relative aspect-[2/3]">
              <img
                src={getHighQualityPoster(anime.poster, anime.anilistId)}
                alt={anime.name}
                className="w-full h-full object-cover md:transition-transform md:duration-500 md:group-hover:scale-105"
                loading="lazy"
                decoding="async"
                fetchPriority="low"
              />

              {/* Overlays */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

              {/* Rank Badge */}
              <div className={`absolute top-2.5 left-2.5 md:top-3 md:left-3 rounded-lg flex items-center justify-center font-black ${getRankStyles(idx)}`}>
                {anime.rank ?? idx + 1}
              </div>

              {/* Content */}
              <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4 pt-10">
                <h4 className="font-bold text-[13px] md:text-sm leading-tight line-clamp-2 drop-shadow-md md:group-hover:text-amber md:transition-colors">
                  {anime.name}
                </h4>
                <div className="mt-1.5 md:mt-2 flex items-center gap-2">
                  <span className="inline-flex items-center bg-black/50 border border-white/10 px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider text-white/80">
                    EP {anime.episodes.sub}
                  </span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
});
