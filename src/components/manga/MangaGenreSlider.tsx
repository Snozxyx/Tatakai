import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { EyeOff, Flame, Sparkles } from "lucide-react";
import { getProxiedImageUrl } from "@/lib/api";
import { useContentSafetySettings } from "@/hooks/useContentSafetySettings";
import { searchManga } from "@/services/manga.service";
import type { MangaSearchItem } from "@/types/manga";

const BASE_GENRES = [
  "action",
  "romance",
  "fantasy",
  "thriller",
  "horror",
  "comedy",
  "adventure",
  "mystery",
  "drama",
  "historical",
  "isekai",
  "sports",
];

const HENTAI_GENRE = "hentai";

const GENRE_ACCENTS: Record<string, string> = {
  action: "from-orange-500/45 via-rose-500/35 to-black/80",
  romance: "from-pink-500/45 via-rose-500/30 to-black/80",
  fantasy: "from-cyan-500/40 via-blue-500/35 to-black/80",
  thriller: "from-zinc-400/25 via-zinc-700/45 to-black/85",
  horror: "from-red-700/50 via-red-900/35 to-black/90",
  comedy: "from-yellow-400/40 via-orange-500/30 to-black/80",
  adventure: "from-emerald-500/40 via-teal-500/30 to-black/80",
  mystery: "from-indigo-500/40 via-slate-600/35 to-black/85",
  drama: "from-fuchsia-500/40 via-rose-500/30 to-black/80",
  historical: "from-amber-500/40 via-orange-700/30 to-black/80",
  isekai: "from-sky-500/40 via-indigo-500/30 to-black/80",
  sports: "from-lime-500/35 via-emerald-600/30 to-black/80",
  hentai: "from-rose-500/45 via-red-600/35 to-black/90",
};

function getDaySeed() {
  const now = new Date();
  return now.getUTCDate() + (now.getUTCMonth() + 1) * 31;
}

function pickPoster(items: MangaSearchItem[], seed: number, offset: number): string {
  if (!Array.isArray(items) || items.length === 0) return "";
  const index = (seed + offset * 7) % items.length;
  return String(items[index]?.poster || "");
}

function formatGenreLabel(genre: string): string {
  return genre.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getGenreAccent(genre: string): string {
  return GENRE_ACCENTS[genre] || "from-primary/40 via-primary/20 to-black/80";
}

export function MangaGenreSlider() {
  const navigate = useNavigate();
  const { settings: contentSafetySettings } = useContentSafetySettings();
  const daySeed = useMemo(() => getDaySeed(), []);
  const canShowAdultEverywhere = contentSafetySettings.showAdultEverywhere;

  const genres = useMemo(
    () => (canShowAdultEverywhere ? [...BASE_GENRES, HENTAI_GENRE] : BASE_GENRES),
    [canShowAdultEverywhere],
  );

  const genreQueries = useQueries({
    queries: genres.map((genre) => ({
      queryKey: ["manga-genre-slider", genre],
      staleTime: 10 * 60 * 1000,
      queryFn: async () => {
        const isAdultGenre = genre === HENTAI_GENRE;
        const genrePayload = await searchManga("", 1, 12, {
          mode: "genre",
          provider: isAdultGenre ? "atsu" : "all",
          genre,
          adult: isAdultGenre,
          requiresQuery: false,
        });

        const genreRows = Array.isArray(genrePayload?.results) ? genrePayload.results : [];
        if (genreRows.length > 0) return genreRows;

        const fallback = await searchManga(`${genre} manga`, 1, 12, {
          mode: isAdultGenre ? "genre" : "search",
          provider: isAdultGenre ? "atsu" : "all",
          genre: isAdultGenre ? genre : undefined,
          adult: isAdultGenre,
          requiresQuery: !isAdultGenre,
        });

        return Array.isArray(fallback?.results) ? fallback.results : [];
      },
    })),
  });

  const cards = useMemo(() => {
    return genres.map((genre, index) => {
      const rows = Array.isArray(genreQueries[index]?.data) ? genreQueries[index]?.data || [] : [];
      return {
        genre,
        poster: pickPoster(rows, daySeed, index),
        accentPoster: pickPoster(rows, daySeed + 3, index + 1),
        count: rows.length,
      };
    });
  }, [genres, genreQueries, daySeed]);

  return (
    <section className="mb-14">
      <div className="relative mb-6 overflow-hidden rounded-[2rem] border border-white/5 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/[0.08] via-background to-background p-6 md:p-8 shadow-2xl backdrop-blur-xl">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-[100px]" />
        <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-purple-500/10 blur-[100px]" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="font-display text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="w-5 h-5" />
              </span>
              Manga Genre Hub
            </h2>
            <p className="text-sm md:text-base text-muted-foreground/80 max-w-2xl font-medium">
              Curated moodboard lanes with rotating covers. Tap any genre to open its full catalog.
            </p>
          </div>
          <div className="flex items-center self-start md:self-auto rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-md">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/80">
              Daily Moodboard
            </span>
          </div>
        </div>

        {!canShowAdultEverywhere && (
          <button
            type="button"
            onClick={() => navigate("/settings?tab=privacy#mature-content-controls")}
            className="group relative mt-6 inline-flex items-center gap-2 overflow-hidden rounded-xl border border-rose-500/20 bg-gradient-to-r from-rose-500/10 to-transparent px-4 py-2.5 text-xs font-bold text-rose-300 hover:border-rose-500/30 transition-all duration-300 hover:shadow-[0_0_20px_-5px_rgba(244,63,94,0.3)]"
          >
            <EyeOff className="w-4 h-4 transition-transform group-hover:scale-110" />
            <span>Hentai is hidden by your content safety settings</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 md:gap-5 pb-2">
        {cards.map((card) => (
          <button
            key={card.genre}
            type="button"
            onClick={() => navigate(`/manga/genre/${encodeURIComponent(card.genre)}${card.genre === HENTAI_GENRE ? "?adult=1" : ""}`)}
            className={`group relative w-full aspect-[4/5] rounded-[2rem] overflow-hidden border border-white/10 bg-gradient-to-br ${getGenreAccent(card.genre)} text-left shadow-xl hover:shadow-[0_10px_45px_-18px_rgba(0,0,0,0.7)] transition-shadow duration-300`}
          >
            {card.poster ? (
              <img
                src={getProxiedImageUrl(card.poster)}
                alt={card.genre}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-white/0" />
            )}

            {card.accentPoster ? (
              <img
                src={getProxiedImageUrl(card.accentPoster)}
                alt={`${card.genre} alt`}
                className="absolute right-4 top-4 h-24 w-16 rounded-lg border border-white/20 object-cover shadow-xl rotate-6 opacity-85 group-hover:rotate-0 transition-transform duration-500"
              />
            ) : null}

            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-transparent" />

            <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/95 backdrop-blur-sm">
              {card.genre === HENTAI_GENRE ? <Flame className="w-3.5 h-3.5 text-rose-300" /> : null}
              {card.genre === HENTAI_GENRE ? "18+" : "Genre"}
            </div>

            <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
              <h3 className="text-xl md:text-2xl font-black text-white capitalize leading-tight drop-shadow-md">{formatGenreLabel(card.genre)}</h3>
              <p className="text-xs md:text-sm font-medium text-white/80 mt-1.5">
                {card.count > 0 ? `${card.count}+ picks` : "Explore now"}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
