import { useNavigate } from "react-router-dom";
import { Hash, ArrowUpRight } from "lucide-react";
import { useAniListGenres } from "@/hooks/api/useAniListGenres";

interface GenreCloudProps {
  genres: string[];
}

// Curated palette — cycles through so each genre gets a consistent, distinct accent
const ACCENT_COLORS = [
  { text: "text-rose-400", glow: "bg-rose-500" },
  { text: "text-amber-400", glow: "bg-amber-500" },
  { text: "text-emerald-400", glow: "bg-emerald-500" },
  { text: "text-sky-400", glow: "bg-sky-500" },
  { text: "text-violet-400", glow: "bg-violet-500" },
  { text: "text-orange-400", glow: "bg-orange-500" },
  { text: "text-pink-400", glow: "bg-pink-500" },
  { text: "text-teal-400", glow: "bg-teal-500" },
];

function getAccent(genre: string) {
  let hash = 0;
  for (let i = 0; i < genre.length; i++) {
    hash = genre.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % ACCENT_COLORS.length;
  return ACCENT_COLORS[index];
}

export function GenreCloud({ genres }: GenreCloudProps) {
  const navigate = useNavigate();
  // AniList's live vocabulary; `genres` (from the home bundle) is merged in so a
  // genre AniList has retired before the API cache expires still renders.
  const { genres: allGenres } = useAniListGenres();
  const mergedGenres = Array.from(new Set([...(genres || []), ...allGenres]));

  const handleGenreClick = (genre: string) => {
    navigate(`/genre/${genre.toLowerCase().replace(/\s+/g, "-")}`);
  };

  return (
    <section className="mb-24">
      <div className="flex items-center gap-2.5 mb-8 px-2">
        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
          <Hash className="w-5 h-5" />
        </div>
        <h3 className="font-display text-2xl font-semibold tracking-tight">
          Explore Genres
        </h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {mergedGenres.map((genre) => {
          const accent = getAccent(genre);
          return (
            <button
              key={genre}
              onClick={() => handleGenreClick(genre)}
              className="group relative overflow-hidden rounded-2xl px-5 py-4 border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-all duration-300 hover:-translate-y-0.5 text-left"
            >
              {/* Soft accent glow, revealed on hover */}
              <div
                className={`absolute -top-6 -right-6 w-16 h-16 rounded-full blur-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-500 ${accent.glow}`}
              />

              <div className="relative z-10 flex items-center justify-between gap-2">
                <span className="text-base font-bold text-foreground/80 group-hover:text-foreground transition-colors truncate">
                  {genre}
                </span>
                <ArrowUpRight
                  className={`w-4 h-4 shrink-0 text-muted-foreground/40 group-hover:${accent.text} transform -translate-x-1 translate-y-1 opacity-0 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300`}
                />
              </div>

              {/* Accent underline dot */}
              <div className={`mt-2 h-1 w-6 rounded-full ${accent.glow} opacity-30 group-hover:w-10 group-hover:opacity-70 transition-all duration-300`} />
            </button>
          );
        })}
      </div>
    </section>
  );
}