import { useNavigate } from "react-router-dom";
import { Layers, BookOpen, Building2, Flame, Clock3, Shuffle, Sparkles } from "lucide-react";

const QUICK_FILTERS = [
  {
    key: "manhwa",
    title: "Only Manhwa",
    description: "Korean-first catalog lane",
    to: "/manga/discover?type=manhwa",
    icon: Layers,
  },
  {
    key: "comics",
    title: "Only Comics",
    description: "OEL and western comic flow",
    to: "/manga/discover?type=comics",
    icon: BookOpen,
  },
  {
    key: "atsu",
    title: "Atsu Provider",
    description: "Provider-specific homepage feed",
    to: "/manga/discover?provider=atsu",
    icon: Building2,
  },
  {
    key: "mangafire",
    title: "MangaFire Provider",
    description: "Provider basis exploration",
    to: "/manga/discover?provider=mangafire",
    icon: Building2,
  },
  {
    key: "mangaball",
    title: "MangaBall Provider",
    description: "Alternative provider homepage lane",
    to: "/manga/discover?provider=mangaball",
    icon: Building2,
  },
];

const FEED_SHORTCUTS = [
  {
    key: "feed-popular-daily",
    title: "Popular Daily",
    description: "Daily popularity lane",
    to: "/manga/discover?feed=popular&window=day",
    icon: Flame,
  },
  {
    key: "feed-foryou-weekly",
    title: "For You Weekly",
    description: "Weekly personalized lane",
    to: "/manga/discover?feed=foryou&window=week",
    icon: Sparkles,
  },
  {
    key: "feed-recent-monthly",
    title: "Recent Monthly",
    description: "Recent reads this month",
    to: "/manga/discover?feed=recent&window=month",
    icon: Clock3,
  },
  {
    key: "feed-origin-kr",
    title: "Origin KR",
    description: "Korean origin lane",
    to: "/manga/discover?feed=origin&origin=kr&provider=mangaball",
    icon: Building2,
  },
  {
    key: "feed-random",
    title: "Random Picks",
    description: "Shuffle from AllManga",
    to: "/manga/discover?feed=random&provider=allmanga",
    icon: Shuffle,
  },
];

export function MangaDiscoveryQuickFilters() {
  const navigate = useNavigate();

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4 px-2">
        <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight">Discovery Lanes</h2>
        <button
          type="button"
          onClick={() => navigate("/manga/discover")}
          className="text-xs uppercase tracking-wider text-primary hover:underline"
        >
          Open full explorer
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {QUICK_FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => navigate(item.to)}
            className="group rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left hover:bg-white/[0.08] transition-colors"
          >
            <item.icon className="w-4 h-4 text-primary mb-3" />
            <h3 className="text-sm font-black text-foreground">{item.title}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
          </button>
        ))}
      </div>

      <div className="mt-6 mb-4 px-2">
        <h3 className="font-display text-lg md:text-xl font-bold tracking-tight">Feed Lanes</h3>
        <p className="text-xs text-muted-foreground mt-1">Jump directly into provider-native feed modes.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {FEED_SHORTCUTS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => navigate(item.to)}
            className="group rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left hover:bg-white/[0.08] transition-colors"
          >
            <item.icon className="w-4 h-4 text-primary mb-3" />
            <h3 className="text-sm font-black text-foreground">{item.title}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
