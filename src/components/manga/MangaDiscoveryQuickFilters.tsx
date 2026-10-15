import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layers, BookOpen, Flame, Clock3, Sparkles, ArrowRight } from "lucide-react";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { useMobileAppearance } from '@/hooks/ui/useMobileAppearance';
import { dealCovers, type CoverPoolKey } from "./mangaCoverPools";

interface FilterConfig {
  key: string;
  title: string;
  description: string;
  to: string;
  icon: React.ElementType;
  poster: string;
  /** Cover pool matching this card's accent/glow family — dealt randomly per visit. */
  pool: CoverPoolKey;
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
    get title() { return uiI18n.t('app.popular_daily_1c40b5f1'); },
    get description() { return uiI18n.t('app.daily_popularity_lane_top_titles_heating_up_righ_84c3dbc9'); },
    to: "/manga/discover?feed=popular&window=day",
    icon: Flame,
    poster: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx173020-vqe5J7U1cizO.png",
    pool: "red",
    accent: "from-rose-600/65 via-red-800/30 to-black/85",
    glowColor: "shadow-rose-500/30",
    textColor: "text-rose-300",
    iconColor: "text-rose-300",
  },
  // Small cards (col 2 + 3)
  {
    key: "manhwa",
    get title() { return uiI18n.t('app.only_manhwa_27aa09e7'); },
    get description() { return uiI18n.t('app.korean_first_catalog_049c6229'); },
    to: "/manga/discover?type=manhwa",
    icon: Layers,
    poster: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx119257-Pi21aq3ey9GG.jpg",
    pool: "blue",
    accent: "from-sky-600/60 via-blue-800/30 to-black/85",
    glowColor: "shadow-sky-500/25",
    textColor: "text-sky-300",
    iconColor: "text-sky-300",
  },
  {
    key: "comics",
    get title() { return uiI18n.t('app.only_comics_1f9cfc1f'); },
    get description() { return uiI18n.t('app.western_comic_flow_07997b13'); },
    to: "/manga/discover?type=comics",
    icon: BookOpen,
    poster: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx100805-3DCHMdZ5blWl.jpg",
    pool: "warm",
    accent: "from-amber-500/60 via-orange-800/30 to-black/85",
    glowColor: "shadow-amber-500/25",
    textColor: "text-amber-300",
    iconColor: "text-amber-300",
  },
  {
    key: "feed-foryou-weekly",
    get title() { return uiI18n.t('app.for_you_21f25753'); },
    get description() { return uiI18n.t('app.weekly_personalized_picks_d54f2cd8'); },
    to: "/manga/discover?feed=foryou&window=week",
    icon: Sparkles,
    poster: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx169904-6gvkXMNpq66N.jpg",
    pool: "purple",
    accent: "from-violet-600/60 via-purple-800/30 to-black/85",
    glowColor: "shadow-violet-500/25",
    textColor: "text-violet-300",
    iconColor: "text-violet-300",
  },
  {
    key: "feed-recent-monthly",
    get title() { return uiI18n.t('app.recent_monthly_b99b30ff'); },
    get description() { return uiI18n.t('app.recently_read_this_month_2dfcbfec'); },
    to: "/manga/discover?feed=recent&window=month",
    icon: Clock3,
    poster: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx144946-cscic3n2SwdY.jpg",
    pool: "green",
    accent: "from-emerald-600/60 via-teal-800/30 to-black/85",
    glowColor: "shadow-emerald-500/25",
    textColor: "text-emerald-300",
    iconColor: "text-emerald-300",
  },
];

function TiltGlassFilterCard({
  item,
  poster,
  onClick,
  isLarge = false,
}: {
  item: FilterConfig;
  poster: string;
  onClick: () => void;
  isLarge?: boolean;
}) {
  useUiTranslation();
  const cardRef = useRef<HTMLButtonElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  function handleMouseMove(e: React.MouseEvent<HTMLButtonElement>) {
    if (!window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches
      || document.querySelector('.reduce-motion')) return;
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
      onMouseEnter={() => {
        if (window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches
          && !document.querySelector('.reduce-motion')) setIsHovered(true);
      }}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: isHovered || tilt.x || tilt.y
          ? `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${isHovered ? 1.025 : 1})`
          : undefined,
        transition: isHovered
          ? "transform 0.1s ease-out"
          : "transform 0.45s cubic-bezier(0.23, 1, 0.32, 1)",
      }}
      data-mobile-browse-card
      className={`relative w-full rounded-2xl overflow-hidden text-left border border-white/10 shadow-xl focus:outline-none focus:ring-2 focus:ring-white/30 ${isLarge ? "row-span-2" : ""}`}
    >
      {/* Background Poster — random cover from this card's color family */}
      <img
        src={poster}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
        decoding="async"
        onError={(e) => {
          const img = e.currentTarget;
          if (img.dataset.fallback === "1") return;
          img.dataset.fallback = "1";
          img.src = item.poster;
        }}
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
            data-browse-arrow
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
  useUiTranslation();
  const refreshed = useMobileAppearance();
  const navigate = useNavigate();
  // One random cover per card from its accent family, dealt once per visit
  // (no repeats within a family). Falls back to the curated poster.
  const dealtPosters = useMemo(() => dealCovers(ALL_CARDS.map((c) => c.pool)), []);

  return (
    <section data-mobile-browse-section className="relative mb-12">
      {/* Section header */}
      <HomeSectionHeading
        icon={<Flame className="w-5 h-5 text-primary" />}
        title={uiI18n.t('app.discovery_3b3290c7')}
        action={
          <button
            type="button"
            onClick={() => navigate("/manga/discover")}
            className="self-start sm:self-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200 backdrop-blur-sm shrink-0"
          >
            {uiI18n.t('app.full_explorer_29c6e82d')}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        }
      />

      {/* Bento Grid */}
      <div
        data-mobile-home-rail="discovery"
        className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4"
        style={{
          gridAutoRows: "clamp(150px, 18vw, 220px)",
        }}
      >
        {ALL_CARDS.map((item, index) => (
          <TiltGlassFilterCard
            key={item.key}
            item={item}
            poster={dealtPosters[index] ?? item.poster}
            isLarge={!refreshed && index === 0}
            onClick={() => navigate(item.to)}
          />
        ))}
      </div>
    </section>
  );
}
