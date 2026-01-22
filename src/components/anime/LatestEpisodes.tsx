import { Clock, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { AnimeCard, getProxiedImageUrl } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useRef, useState, useEffect } from "react";
import { fetchEpisodes, fetchStreamingSources } from "@/lib/api";

interface LatestEpisodesProps {
  animes: AnimeCard[];
}

function LatestEpisodeCard({ anime }: { anime: AnimeCard }) {
  const navigate = useNavigate();
  const [isHovering, setIsHovering] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isHovering || previewUrl) return;

    hoverTimeoutRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const episodes = await fetchEpisodes(anime.id);
        if (episodes.episodes.length > 0) {
          const sources = await fetchStreamingSources(episodes.episodes[0].episodeId, "hd-2", "sub");
          if (sources.sources.length > 0) {
            setPreviewUrl(sources.sources[0].url);
          }
        }
      } catch (error) {
        // Preview not available
      } finally {
        setIsLoading(false);
      }
    }, 600);

    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, [isHovering, anime.id, previewUrl]);

  useEffect(() => {
    if (videoRef.current) {
      if (isHovering && previewUrl) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [isHovering, previewUrl]);

  return (
    <GlassPanel 
      hoverEffect 
      className="group p-3 flex-shrink-0 w-[280px] cursor-pointer"
      onClick={() => navigate(`/anime/${anime.id}`)}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-28 flex-shrink-0 rounded-xl overflow-hidden">
              <img
                src={getProxiedImageUrl(anime.poster)} 
                alt={anime.name}
                className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110"
              />
          
          {/* Video Preview */}
          {previewUrl && (
            <video
              ref={videoRef}
              src={`https://corsproxy.io/?${encodeURIComponent(previewUrl)}`}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                isHovering ? 'opacity-100' : 'opacity-0'
              }`}
              muted
              loop
              playsInline
            />
          )}

          {/* Loading/Play overlay */}
          <div className={`absolute inset-0 bg-background/30 flex items-center justify-center transition-opacity ${
            isHovering && !previewUrl ? 'opacity-100' : 'opacity-0'
          }`}>
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <Play className="w-8 h-8 fill-foreground text-foreground" />
            )}
          </div>
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