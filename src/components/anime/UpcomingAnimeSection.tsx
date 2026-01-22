import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useUpcomingAnime, JikanAnime } from "@/hooks/useUpcomingAnime";
import { useRef } from "react";

function UpcomingAnimeCard({ anime }: { anime: JikanAnime }) {
  const imageUrl = anime.images.webp?.large_image_url || anime.images.jpg.large_image_url;
  const title = anime.title_english || anime.title;
  
  return (
    <GlassPanel 
      hoverEffect 
      className="group flex-shrink-0 w-[180px] cursor-pointer overflow-hidden"
    >
      <div className="relative aspect-[3/4]">
        <img
          src={imageUrl}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        
        {/* Type Badge */}
        {anime.type && (
          <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-primary/80 text-primary-foreground text-xs font-bold">
            {anime.type}
          </div>
        )}

        {/* Score */}
        {anime.score && (
          <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-md bg-background/80 backdrop-blur text-xs font-bold">
            ⭐ {anime.score}
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h4 className="font-bold text-sm line-clamp-2 group-hover:text-primary transition-colors">
            {title}
          </h4>
          <div className="flex flex-col gap-1 mt-1 text-xs text-muted-foreground">
            {anime.aired.string && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {anime.aired.string.includes(' to ') 
                  ? anime.aired.string.split(' to ')[0] 
                  : anime.aired.string}
              </span>
            )}
            {anime.studios.length > 0 && (
              <span className="line-clamp-1">{anime.studios[0].name}</span>
            )}
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

export function UpcomingAnimeSection() {
  const { data, isLoading, error } = useUpcomingAnime();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (error) {
    return null; // Silently fail if API is unavailable
  }

  if (isLoading) {
    return (
      <section className="mb-24">
        <div className="flex items-center justify-between mb-8 px-2">
          <h3 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-500" />
            Upcoming Anime
          </h3>
        </div>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[180px] aspect-[3/4] bg-muted/50 rounded-xl animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (!data?.data || data.data.length === 0) {
    return null;
  }

  return (
    <section className="mb-24">
      <div className="flex items-center justify-between mb-8 px-2">
        <h3 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Calendar className="w-5 h-5 text-purple-500" />
          Upcoming Anime
        </h3>
        <div className="flex gap-2">
          <button 
            onClick={() => scroll("left")}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button 
            onClick={() => scroll("right")}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide scroll-smooth"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {data.data.map((anime, index) => (
          <UpcomingAnimeCard key={`${anime.mal_id}-${index}`} anime={anime} />
        ))}
      </div>
    </section>
  );
}
