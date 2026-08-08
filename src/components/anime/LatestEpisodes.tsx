import { Clock, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { AnimeCard, getProxiedImageUrl, getHighQualityPoster } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useRef, useEffect } from "react";
import { usePreviewSource } from "@/hooks/usePreviewSource";

interface LatestEpisodesProps {
  animes: AnimeCard[];
}

function LatestEpisodeCard({ anime }: { anime: AnimeCard }) {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { startHover, cancelHover, source } = usePreviewSource();

  // Attach video src when source resolves (req 9.2)
  useEffect(() => {
    if (!videoRef.current) return;
    if (source?.streamUrl && !source.isHls) {
      videoRef.current.src = source.streamUrl;
      videoRef.current.play().catch(() => {});
    } else if (!source?.streamUrl) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
    }
  }, [source]);

  const anilistId = anime.anilistId ?? 0;
  const titles = [anime.name].filter(Boolean);

  return (
    <GlassPanel 
      hoverEffect 
      className="group p-3 flex-shrink-0 w-[280px] cursor-pointer"
      onClick={() => navigate(`/anime/${anime.id}`)}
      onMouseEnter={() => startHover(anilistId, titles)}
      onMouseLeave={() => cancelHover()}
    >
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-28 flex-shrink-0 rounded-xl overflow-hidden">
          {/* Static poster (req 9.5 — shown when no preview available) */}
          <img
            src={
              (anime.poster || '')
                .replace('/cover/medium/', '/cover/large/')
                .replace(/\/banner\/(small|medium)\//, '/banner/large/') ||
              getHighQualityPoster(anime.poster, anime.anilistId)
            }
            alt={anime.name}
            loading="lazy"
            className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110"
            {...(!source?.streamUrl ? { 'data-preview-unavailable': 'true' } : {})}
          />
          
          {/* Video Preview — only rendered when source available and not HLS (req 9.7) */}
          {source?.streamUrl && !source.isHls && (
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 opacity-100"
              muted
              loop
              playsInline
            />
          )}

          {/* Play overlay when no preview */}
          {!source?.streamUrl && (
            <div className="absolute inset-0 bg-background/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Play className="w-8 h-8 fill-foreground text-foreground" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-base font-bold mb-1 group-hover:text-primary transition-colors line-clamp-2">
            {anime.name}
          </h4>
          <p className="text-xs text-muted-foreground mb-2">
            {anime.type} • {anime.duration}
          </p>
          <div className="flex gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-primary/20 text-primary">
              SUB: {anime.episodes.sub}
            </span>
            {anime.episodes.dub > 0 && (
              <span className="px-2 py-0.5 rounded bg-secondary/20 text-secondary">
                DUB: {anime.episodes.dub}
              </span>
            )}
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

export function LatestEpisodes({ animes }: LatestEpisodesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 320;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <section className="mb-24">
      <div className="flex items-center justify-between mb-8 px-2">
        <h3 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          Latest Episodes
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
        className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide scroll-smooth"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {animes.slice(0, 10).map((anime) => (
          <LatestEpisodeCard key={anime.id} anime={anime} />
        ))}
      </div>
    </section>
  );
}