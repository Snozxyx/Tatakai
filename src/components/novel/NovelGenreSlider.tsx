import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { ArrowRight, Flame } from "lucide-react";
import { useMobileAppearance } from "@/hooks/ui/useMobileAppearance";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { searchNovels } from "@/core/content/novel-client";

const HENTAI_GENRE = "hentai";

interface GenreConfig {
  genre: string;
  label: string;
  poster: string;
  /** Accent family key (kept for palette grouping). `null` keeps the
      fixed poster (used by the 18+ card — adult art is never randomized). */
  pool: string | null;
  accent: string;
  glowColor: string;
  textColor: string;
  tag?: string;
  isAdult?: boolean;
}

// Same bento design as the manga genre lane, pointed at novel shelves.
// Posters are LIVE novel covers: each genre card shows the top novel in that
// genre (fetched once, cached 30min). The curated `poster` is only a loading
// fallback — never manga art.
const BASE_GENRES: GenreConfig[] = [
  {
    genre: "action",
    label: "Action",
    poster: "/placeholder.svg",
    pool: "warm",
    accent: "from-amber-600/60 via-orange-700/30 to-black/80",
    glowColor: "shadow-amber-500/30",
    textColor: "text-amber-300",
  },
  {
    genre: "fantasy",
    label: "Fantasy",
    poster: "/placeholder.svg",
    pool: "blue",
    accent: "from-cyan-600/60 via-blue-700/30 to-black/80",
    glowColor: "shadow-cyan-500/30",
    textColor: "text-cyan-300",
  },
  {
    genre: "romance",
    label: "Romance",
    poster: "/placeholder.svg",
    pool: "red",
    accent: "from-rose-500/60 via-pink-700/30 to-black/80",
    glowColor: "shadow-rose-500/30",
    textColor: "text-rose-300",
  },
  {
    genre: "isekai",
    label: "Isekai",
    poster: "/placeholder.svg",
    pool: "blue",
    accent: "from-sky-500/60 via-indigo-700/30 to-black/80",
    glowColor: "shadow-sky-400/30",
    textColor: "text-sky-300",
  },
  {
    genre: "mystery",
    label: "Mystery",
    poster: "/placeholder.svg",
    pool: "mono",
    accent: "from-stone-500/60 via-amber-900/30 to-black/80",
    glowColor: "shadow-stone-400/30",
    textColor: "text-stone-300",
  },
  {
    genre: "drama",
    label: "Drama",
    poster: "/placeholder.svg",
    pool: "purple",
    accent: "from-fuchsia-500/60 via-purple-700/30 to-black/80",
    glowColor: "shadow-fuchsia-500/30",
    textColor: "text-fuchsia-300",
  },
  {
    genre: "adventure",
    label: "Adventure",
    poster: "/placeholder.svg",
    pool: "green",
    accent: "from-emerald-500/60 via-teal-700/30 to-black/80",
    glowColor: "shadow-emerald-500/30",
    textColor: "text-emerald-300",
  },
  {
    genre: "horror",
    label: "Horror",
    poster: "/placeholder.svg",
    pool: "mono",
    accent: "from-stone-500/60 via-amber-900/30 to-black/80",
    glowColor: "shadow-stone-400/30",
    textColor: "text-stone-300",
  },
];

const HENTAI_CONFIG: GenreConfig = {
  genre: "hentai",
  label: "18+ Novels",
  poster: "/placeholder.svg",
  pool: null,
  accent: "from-rose-700/70 via-red-900/40 to-black/90",
  glowColor: "shadow-rose-600/50",
  textColor: "text-rose-300",
  tag: "18+",
  isAdult: true,
};

function TiltGlassCard({
  config,
  poster,
  onClick,
  isLarge = false,
}: {
  config: GenreConfig;
  poster: string;
  onClick: () => void;
  isLarge?: boolean;
}) {
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
          ? `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${isHovered ? 1.025 : 1})`
          : undefined,
        transition: isHovered
          ? "transform 0.1s ease-out"
          : "transform 0.45s cubic-bezier(0.23, 1, 0.32, 1)",
      }}
      data-mobile-browse-card
      className={`relative w-full rounded-2xl overflow-hidden text-left
        border border-white/10 shadow-xl
        focus:outline-none focus:ring-2 focus:ring-white/30
        ${isLarge ? "row-span-2" : ""}`}
    >
      {/* Background Poster — random cover from this genre's color family */}
      <img
        src={poster}
        alt={config.label}
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
        decoding="async"
        onError={(e) => {
          const img = e.currentTarget;
          if (img.dataset.fallback === "1") return;
          img.dataset.fallback = "1";
          img.src = config.poster;
        }}
      />

      {/* Gradient overlay */}
      <div className={`absolute inset-0 bg-gradient-to-t ${config.accent} opacity-90`} />

      {/* Tilt glass sheen */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(${130 + tilt.y * 3}deg, rgba(255,255,255,0.14) 0%, transparent 45%, rgba(255,255,255,0.04) 100%)`,
          transition: isHovered ? "none" : "background 0.45s ease",
        }}
      />

      {/* Frosted top strip */}
      <div
        className="absolute inset-x-0 top-0 h-1/3 pointer-events-none"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 100%)",
        }}
      />

      {/* Badge top-left */}
      <div className="absolute top-3 left-3 z-10">
        {config.isAdult ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-600/85 border border-rose-400/40 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-sm">
            🔞 18+
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-black/40 border border-white/15 text-[10px] font-bold uppercase tracking-wider text-white/75 backdrop-blur-sm">
            Genre
          </span>
        )}
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
          <div>
            <h3
              className={`font-extrabold capitalize leading-tight drop-shadow-md ${config.textColor} ${isLarge ? "text-2xl md:text-3xl" : "text-base md:text-lg"}`}
            >
              {config.label}
            </h3>
            {isLarge && (
              <p className="text-xs text-white/50 font-medium mt-1">Tap to explore lane</p>
            )}
          </div>
          <div
            data-browse-arrow
            className={`flex items-center justify-center w-8 h-8 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm transition-all duration-300 flex-shrink-0 ${isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2"}`}
          >
            <ArrowRight className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
      </div>
    </button>
  );
}

export function NovelGenreSlider() {
  const refreshed = useMobileAppearance();
  const navigate = useNavigate();
  const { settings: contentSafetySettings } = useContentSafetySettings();
  const canShowAdultEverywhere = contentSafetySettings.showAdultEverywhere;

  const genres = useMemo(
    () => (canShowAdultEverywhere ? [...BASE_GENRES, HENTAI_CONFIG] : BASE_GENRES),
    [canShowAdultEverywhere],
  );

  // Live novel covers: top novel per genre. The 18+ card keeps its fixed
  // poster (adult art is never fetched for a hub card).
  const coverQueries = useQueries({
    queries: genres.map((g) => ({
      queryKey: ["novel-genre-cover", g.genre],
      queryFn: async (): Promise<string | null> => {
        if (g.isAdult) return null;
        const res = await searchNovels("", 1, 3, { genre: g.label, adult: false }).catch(() => null);
        const first = (res?.results ?? []).find((r) => r.poster);
        return first?.poster ?? null;
      },
      staleTime: 30 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });

  // Live novel covers only — no manga art anywhere on this lane. Until a
  // genre's cover resolves, the card shows the neutral placeholder under the
  // same gradient/tilt treatment.
  const posters = genres.map(
    (g, i) => coverQueries[i]?.data || g.poster,
  );

  return (
    <section data-mobile-browse-section className="mb-16 relative">
      <HomeSectionHeading
        icon={<Flame className="w-5 h-5 text-primary" />}
        title="Novel Genres"
      />

      {/* ── Bento Grid ─────────────────────────────────────────────
          Layout (3 cols):
          [LARGE row-span-2] [card] [card]
          [LARGE cont.     ] [card] [card]
          [card] [card] [card]
          ───────────────────────────────────────────────────────── */}
      <div
        data-mobile-home-rail="novel-genres"
        className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4"
        style={{
          gridAutoRows: "clamp(160px, 20vw, 240px)",
        }}
      >
        {genres.map((config, index) => (
          <TiltGlassCard
            key={config.genre}
            config={config}
            poster={posters[index] ?? config.poster}
            isLarge={!refreshed && index === 0}
            onClick={() =>
              navigate(
                `/novel/genre/${encodeURIComponent(config.genre)}${config.genre === HENTAI_GENRE ? "?adult=1" : ""}`,
              )
            }
          />
        ))}
      </div>
    </section>
  );
}
