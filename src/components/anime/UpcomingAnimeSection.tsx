import { Calendar, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useUpcomingAnime, type UpcomingAnimeItem } from "@/hooks/api/useUpcomingAnime";
import { useRef } from "react";
import { Peekable } from "@/components/media/MediaQuickPeek";
import { peekFromAnime } from "@/components/media/quickPeekStore";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatAirDate(media: UpcomingAnimeItem): string | null {
  const { year, month, day } = media.startDate || {};
  if (!year) return media.seasonYear ? String(media.seasonYear) : null;
  if (month && day) return `${MONTHS[month - 1]} ${day}, ${year}`;
  if (month) return `${MONTHS[month - 1]} ${year}`;
  return String(year);
}

function UpcomingAnimeCard({ anime }: { anime: UpcomingAnimeItem }) {
  const imageUrl = anime.coverImage?.large || anime.coverImage?.medium || "/placeholder.svg";
  const title = anime.title?.english || anime.title?.romaji || anime.title?.native || "Unknown title";
  const airDate = formatAirDate(anime);
  const studio = anime.studios?.nodes?.find((node) => node?.name)?.name || null;
  const score = anime.averageScore ? (anime.averageScore / 10).toFixed(1) : null;

  // Unreleased titles: info-only peek (no save, View goes to search).
  const peekMedia = peekFromAnime(
    {
      id: `anilist:${anime.id}`,
      anilistId: anime.id,
      name: title,
      poster: imageUrl,
      type: anime.format,
      year: anime.seasonYear ?? anime.startDate?.year ?? undefined,
      rating: score ?? undefined,
    },
    `/search?q=${encodeURIComponent(title)}`,
  );

  return (
    <Peekable media={peekMedia ? { ...peekMedia, canSave: false } : null}>
    <GlassPanel
      hoverEffect
      className="group flex-shrink-0 w-[180px] sm:w-[200px] cursor-pointer overflow-hidden snap-start"
    >
      <div data-mobile-poster-image className="relative aspect-[2/3]">
        <img
          src={imageUrl}
          alt={title}
          className="w-full h-full object-cover transition-all duration-700 ease-out group-hover:scale-105 group-hover:brightness-110"
          loading="lazy"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
        <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/10" />

        {/* Type */}
        {anime.format && (
          <div className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-purple-500/90 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-purple-500/20">
            {anime.format}
          </div>
        )}

        {/* Score */}
        {score && (
          <div className="absolute top-3 right-3 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-md border border-white/10 text-[10px] font-bold text-white">
            <Star className="w-3 h-3 fill-amber text-amber" />
            {score}
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-3.5 pt-10">
          <h4 data-mobile-poster-title className="font-bold text-sm leading-tight line-clamp-2 drop-shadow-md group-hover:text-purple-300 transition-colors duration-300">
            {title}
          </h4>

          <div className="flex flex-col gap-1.5 mt-2">
            {airDate && (
              <span className="inline-flex items-center gap-1 w-fit bg-white/10 backdrop-blur-sm border border-white/5 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-white/80">
                <Calendar className="w-3 h-3 text-purple-400" />
                {airDate}
              </span>
            )}
            {studio && (
              <span className="text-[10px] text-white/50 line-clamp-1 font-medium tracking-wide">
                {studio}
              </span>
            )}
          </div>
        </div>
      </div>
    </GlassPanel>
    </Peekable>
  );
}

export function UpcomingAnimeSection() {
  const { data, isLoading, error } = useUpcomingAnime();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const amount = scrollRef.current.clientWidth * 0.75;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -amount : amount,
        behavior: "smooth",
      });
    }
  };

  if (error) return null;

  if (isLoading) {
    return (
      <section className="mb-24">
        <div className="flex items-center justify-between mb-8 px-2">
          <h3 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
              <Calendar className="w-5 h-5" />
            </div>
            Upcoming Anime
          </h3>
        </div>
        <div className="flex gap-4 overflow-hidden px-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-[180px] sm:w-[200px] aspect-[2/3] rounded-xl bg-white/5 border border-white/5 animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <section className="mb-24">
      <div className="flex items-center justify-between mb-8 px-2">
        <h3 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
            <Calendar className="w-5 h-5" />
          </div>
          Upcoming Anime
        </h3>

        <div className="flex gap-1 p-1 rounded-full bg-white/5 border border-white/10">
          <button
            onClick={() => scroll("left")}
            aria-label="Scroll left"
            className="p-2 rounded-full text-muted-foreground hover:text-white hover:bg-white/10 transition-all duration-300"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            aria-label="Scroll right"
            className="p-2 rounded-full text-muted-foreground hover:text-white hover:bg-white/10 transition-all duration-300"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative group/carousel">
        {/* Edge fades */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-4 w-8 bg-gradient-to-r from-background to-transparent z-10" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-4 w-8 bg-gradient-to-l from-background to-transparent z-10" />

        <div
          ref={scrollRef}
          data-mobile-home-rail
          className="flex gap-4 overflow-x-auto pb-4 px-2 scrollbar-hide scroll-smooth snap-x snap-mandatory"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {data.map((anime) => (
            <UpcomingAnimeCard key={`anilist-${anime.id}`} anime={anime} />
          ))}
        </div>
      </div>
    </section>
  );
}
