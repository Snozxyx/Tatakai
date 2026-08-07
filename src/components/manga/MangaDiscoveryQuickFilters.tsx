import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layers, BookOpen, Flame, Clock3, Sparkles, ArrowRight } from "lucide-react";

interface FilterConfig {
  key: string;
  title: string;
  description: string;
  to: string;
  icon: React.ElementType;
  poster: string;
  accent: string;
  glowColor: string;
  textColor: string;
  iconColor: string;
}

// All 5 filter/feed cards combined into one bento block
const ALL_CARDS: FilterConfig[] = [
  // First card = LARGE featured (Popular Daily)
  {
    key: "feed-popular-daily",
    title: "Popular Daily",
    description: "Daily popularity lane — top titles heating up right now",
    to: "/manga/discover?feed=popular&window=day",
    icon: Flame,
    poster: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx173020-vqe5J7U1cizO.png",
    accent: "from-rose-600/65 via-red-800/30 to-black/85",
    glowColor: "shadow-rose-500/30",
    textColor: "text-rose-300",
    iconColor: "text-rose-300",
  },
  // Small cards (col 2 + 3)
  {
    key: "manhwa",
    title: "Only Manhwa",
    description: "Korean-first catalog",
    to: "/manga/discover?type=manhwa",
    icon: Layers,
    poster: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx119257-Pi21aq3ey9GG.jpg",
    accent: "from-sky-600/60 via-blue-800/30 to-black/85",
    glowColor: "shadow-sky-500/25",
    textColor: "text-sky-300",
    iconColor: "text-sky-300",
  },
  {
    key: "comics",
    title: "Only Comics",
    description: "Western comic flow",
    to: "/manga/discover?type=comics",
    icon: BookOpen,
    poster: "https://cdn.atsu.moe/static/posters/PpYZrYu1LUs0GVYT.jpg",
    accent: "from-amber-500/60 via-orange-800/30 to-black/85",
    glowColor: "shadow-amber-500/25",
    textColor: "text-amber-300",
    iconColor: "text-amber-300",
  },
  {
    key: "feed-foryou-weekly",
    title: "For You",
    description: "Weekly personalized picks",
    to: "/manga/discover?feed=foryou&window=week",
    icon: Sparkles,
    poster: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx169904-6gvkXMNpq66N.jpg",
    accent: "from-violet-600/60 via-purple-800/30 to-black/85",
    glowColor: "shadow-violet-500/25",
    textColor: "text-violet-300",
    iconColor: "text-violet-300",
  },
  {
    key: "feed-recent-monthly",
    title: "Recent Monthly",
    description: "Recently read this month",
    to: "/manga/discover?feed=recent&window=month",
    icon: Clock3,
    poster: "https://cdn.atsu.moe/static/posters/smyw3jl9NabpSky6.jpg",
    accent: "from-emerald-600/60 via-teal-800/30 to-black/85",
    glowColor: "shadow-emerald-500/25",
    textColor: "text-emerald-300",
    iconColor: "text-emerald-300",
  },
];

function TiltGlassFilterCard({
  item,
  onClick,
  isLarge = false,
}: {
  item: FilterConfig;
  onClick: () => void;
  isLarge?: boolean;
}) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  function handleMouseMove(e: React.MouseEvent<HTMLButtonElement>) {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    setTilt({ x: dy * -10, y: dx * 10 });
  }

  function handleMouseLeave() {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  }

  const Icon = item.icon;

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${isHovered ? 1.025 : 1})`,
        transition: isHovered
          ? "transform 0.1s ease-out"
          : "transform 0.45s cubic-bezier(0.23, 1, 0.32, 1)",
      }}
      className={`relative w-full rounded-2xl overflow-hidden text-left
        border border-white/10 shadow-xl
        focus:outline-none focus:ring-2 focus:ring-white/30
        ${isLarge ? "row-span-2" : ""}`}
    >
      {/* Background Poster */}
      <img
        src={item.poster}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
      />

      {/* Gradient overlay */}
      <div className={`absolute inset-0 bg-gradient-to-t ${item.accent} opacity-90`} />

      {/* Tilt glass sheen */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(${130 + tilt.y * 3}deg, rgba(255,255,255,0.13) 0%, transparent 45%, rgba(255,255,255,0.04) 100%)`,
          transition: isHovered ? "none" : "background 0.45s ease",
        }}
      />

      {/* Frosted top strip */}
      <div
        className="absolute inset-x-0 top-0 h-1/3 pointer-events-none"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)",
        }}
      />

      {/* Icon badge top-left */}
      <div className="absolute top-3 left-3 z-10">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-black/40 border border-white/20 backdrop-blur-md shadow-lg">
          <Icon className={`w-4 h-4 ${item.iconColor} drop-shadow-lg`} />
        </div>
      </div>

      {/* Bottom frosted label */}
      <div className="absolute inset-x-0 bottom-0 z-10">
        <div
          className="p-4 flex items-end justify-between gap-2"
          style={{
            background:
              "linear-gradient(0deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.45) 55%, transparent 100%)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <div className="flex-1 min-w-0">
            <h3
              className={`font-extrabold leading-tight drop-shadow-md ${item.textColor} ${isLarge ? "text-xl md:text-2xl" : "text-sm md:text-base"}`}
            >
              {item.title}
            </h3>
            {isLarge && (
              <p className="text-xs text-white/50 font-medium mt-1 line-clamp-2">
                {item.description}
              </p>
            )}
          </div>
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm flex-shrink-0 transition-all duration-300 ${isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2"}`}
          >
            <ArrowRight className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
      </div>
    </button>
  );
}

export function MangaDiscoveryQuickFilters() {
  const navigate = useNavigate();

  return (
    <section className="relative mb-12">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
          <Flame className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-2xl lg:text-3xl font-bold font-display tracking-tight">Discovery</h2>
        <button
          type="button"
          onClick={() => navigate("/manga/discover")}
          className="self-start sm:self-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200 backdrop-blur-sm"
        >
          Full Explorer
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Bento Grid */}
      <div
        className="grid gap-3 md:gap-4"
        style={{
          gridTemplateColumns: "repeat(3, 1fr)",
          gridAutoRows: "clamp(150px, 18vw, 220px)",
        }}
      >
        {ALL_CARDS.map((item, index) => (
          <TiltGlassFilterCard
            key={item.key}
            item={item}
            isLarge={index === 0}
            onClick={() => navigate(item.to)}
          />
        ))}
      </div>
    </section>
  );
}