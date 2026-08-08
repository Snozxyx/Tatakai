import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EyeOff, Sparkles, Compass, ArrowRight, Flame} from "lucide-react";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";

const HENTAI_GENRE = "hentai";

interface GenreConfig {
  genre: string;
  label: string;
  poster: string;
  accent: string;
  glowColor: string;
  textColor: string;
  tag?: string;
  isAdult?: boolean;
}

const BASE_GENRES: GenreConfig[] = [
  {
    genre: "action",
    label: "Action",
    poster: "https://cdn.atsu.moe/static/posters/PpYZrYu1LUs0GVYT.jpg",
    accent: "from-amber-600/60 via-orange-700/30 to-black/80",
    glowColor: "shadow-amber-500/30",
    textColor: "text-amber-300",
  },
  {
    genre: "fantasy",
    label: "Fantasy",
    poster: "https://cdn.atsu.moe/static/posters/N3HO30V76uWZV9iG.jpg",
    accent: "from-cyan-600/60 via-blue-700/30 to-black/80",
    glowColor: "shadow-cyan-500/30",
    textColor: "text-cyan-300",
  },
  {
    genre: "romance",
    label: "Romance",
    poster: "https://cdn.atsu.moe/static/posters/LOSrlEEmNxpdYVMq.jpg",
    accent: "from-rose-500/60 via-pink-700/30 to-black/80",
    glowColor: "shadow-rose-500/30",
    textColor: "text-rose-300",
  },
  {
    genre: "comedy",
    label: "Comedy",
    poster: "https://cdn.atsu.moe/static/posters/rGVzeEHgpwXHagMM.png",
    accent: "from-yellow-500/60 via-amber-700/30 to-black/80",
    glowColor: "shadow-yellow-400/30",
    textColor: "text-yellow-300",
  },
  {
    genre: "drama",
    label: "Drama",
    poster: "https://cdn.atsu.moe/static/posters/smyw3jl9NabpSky6.jpg",
    accent: "from-fuchsia-500/60 via-purple-700/30 to-black/80",
    glowColor: "shadow-fuchsia-500/30",
    textColor: "text-fuchsia-300",
  },
  {
    genre: "adventure",
    label: "Adventure",
    poster: "https://cdn.atsu.moe/static/posters/N3HO30V76uWZV9iG.jpg",
    accent: "from-emerald-500/60 via-teal-700/30 to-black/80",
    glowColor: "shadow-emerald-500/30",
    textColor: "text-emerald-300",
  },
  {
    genre: "historical",
    label: "Historical",
    poster: "https://cdn.atsu.moe/static/posters/PpYZrYu1LUs0GVYT.jpg",
    accent: "from-stone-500/60 via-amber-900/30 to-black/80",
    glowColor: "shadow-stone-400/30",
    textColor: "text-stone-300",
  },
  {
    genre: "isekai",
    label: "Isekai",
    poster: "https://cdn.atsu.moe/static/posters/LOSrlEEmNxpdYVMq.jpg",
    accent: "from-sky-500/60 via-indigo-700/30 to-black/80",
    glowColor: "shadow-sky-400/30",
    textColor: "text-sky-300",
  },
];

const HENTAI_CONFIG: GenreConfig = {
  genre: "hentai",
  label: "18+ / Hentai",
  poster:
    "https://media.discordapp.net/attachments/1403660216687398996/1532009365295333456/10800.jpg?ex=6a6b4a68&is=6a69f8e8&hm=b93d31b07ff122ffed575c37ff7e0dc8a99dee20ef7bd757965c60995cb6078c&=&format=webp&width=1070&height=675",
  accent: "from-rose-700/70 via-red-900/40 to-black/90",
  glowColor: "shadow-rose-600/50",
  textColor: "text-rose-300",
  tag: "18+",
  isAdult: true,
};

function TiltGlassCard({
  config,
  onClick,
  isLarge = false,
}: {
  config: GenreConfig;
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

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${isHovered ? 1.025 : 1})`,
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
        src={config.poster}
        alt={config.label}
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
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
          className="p-4 flex items-end justify-between"
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
            className={`flex items-center justify-center w-8 h-8 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm transition-all duration-300 flex-shrink-0 ${isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2"}`}
          >
            <ArrowRight className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
      </div>
    </button>
  );
}

export function MangaGenreSlider() {
  const navigate = useNavigate();
  const { settings: contentSafetySettings } = useContentSafetySettings();
  const canShowAdultEverywhere = contentSafetySettings.showAdultEverywhere;

  const genres = useMemo(
    () => (canShowAdultEverywhere ? [...BASE_GENRES, HENTAI_CONFIG] : BASE_GENRES),
    [canShowAdultEverywhere],
  );

  return (
    <section className="mb-16 relative">
         <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
          <Flame className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-2xl lg:text-3xl font-bold font-display tracking-tight">Manga Genres</h2>
      </div>

      {/* ── Bento Grid ─────────────────────────────────────────────
          Layout (3 cols):
          [LARGE row-span-2] [card] [card]
          [LARGE cont.     ] [card] [card]
          [card] [card] [card]
          ───────────────────────────────────────────────────────── */}
      <div
        className="grid gap-3 md:gap-4"
        style={{
          gridTemplateColumns: "repeat(3, 1fr)",
          gridAutoRows: "clamp(160px, 20vw, 240px)",
        }}
      >
        {genres.map((config, index) => (
          <TiltGlassCard
            key={config.genre}
            config={config}
            isLarge={index === 0}
            onClick={() =>
              navigate(
                `/manga/genre/${encodeURIComponent(config.genre)}${config.genre === HENTAI_GENRE ? "?adult=1" : ""}`,
              )
            }
          />
        ))}
      </div>
    </section>
  );
}