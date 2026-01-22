import { Trophy } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { TopAnime, getProxiedImageUrl } from "@/lib/api";
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

  return (
    <section className="mb-24">
      <div className="flex items-center justify-between mb-8 px-2">
        <h3 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber" />
          Top 10 Anime
        </h3>
        <div className="flex gap-2">
          {periods.map((period) => (
            <button
              key={period.key}
              onClick={() => setActivePeriod(period.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                activePeriod === period.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {getAnimes().slice(0, 10).map((anime, idx) => (
          <GlassPanel
            key={anime.id}
            hoverEffect
            className="group cursor-pointer overflow-hidden"
            onClick={() => navigate(`/anime/${anime.id}`)}
          >
            <div className="relative aspect-[3/4]">
              <img
                src={getProxiedImageUrl(anime.poster)}
                alt={anime.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
              
              {/* Rank Badge */}
              <div className={`absolute top-3 left-3 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                idx < 3 
                  ? "bg-gradient-to-br from-amber to-orange text-background" 
                  : "bg-muted text-foreground"
              }`}>
                {anime.rank}
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h4 className="font-bold text-sm line-clamp-2 group-hover:text-primary transition-colors">
                  {anime.name}
                </h4>
                <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                  <span>EP {anime.episodes.sub}</span>
                </div>
              </div>
            </div>
          </GlassPanel>
        ))}
      </div>
    </section>
  );
}
