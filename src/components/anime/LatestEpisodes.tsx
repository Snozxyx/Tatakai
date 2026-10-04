import { memo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Play, Zap } from "lucide-react";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { AnimeCard, getHighQualityPoster } from "@/lib/api";
import { usePreviewSource } from "@/hooks/usePreviewSource";

interface LatestEpisodesProps {
  animes: AnimeCard[];
}

function LatestEpisodeCard({ anime }: { anime: AnimeCard }) {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { startHover, cancelHover, source } = usePreviewSource();
  const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;

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
      hoverEffect={false}
      className="group relative flex w-[260px] md:w-[300px] shrink-0 snap-start cursor-pointer items-stretch gap-3 md:gap-4 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3 active:scale-[0.98]"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 144px' }}
      onClick={() => navigate(`/anime/${anime.id}`)}
      onMouseEnter={() => { if (canHover) startHover(anilistId, titles); }}
      onMouseLeave={() => { if (canHover) cancelHover(); }}
    >
      <div className="relative h-[110px] md:h-[120px] w-[80px] md:w-[88px] shrink-0 overflow-hidden rounded-xl bg-white/[0.05]">
        {/* Static poster */}
        <img
          src={
            (anime.poster || '')
              .replace('/cover/medium/', '/cover/large/')
              .replace(/\/banner\/(small|medium)\//, '/banner/large/') ||
            getHighQualityPoster(anime.poster, anime.anilistId)
          }
          alt={anime.name}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          className="h-full w-full object-cover"
          {...(!source?.streamUrl ? { 'data-preview-unavailable': 'true' } : {})}
        />

        {/* Video Preview — hover-capable desktop only */}
        {canHover && source?.streamUrl && !source.isHls && (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover opacity-100 transition-opacity duration-300"
            muted
            loop
            playsInline
            preload="none"
          />
        )}

        {/* Play overlay when no preview — desktop hover only */}
        {!source?.streamUrl && (
          <div className="absolute inset-0 hidden items-center justify-center bg-black/40 opacity-0 transition-all duration-300 group-hover:opacity-100 md:flex">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm ring-1 ring-white/20">
              <Play className="ml-1 h-4 w-4 fill-current" />
            </div>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div>
          <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-white/90 transition-colors group-hover:text-white">
            {anime.name}
          </h4>
          <p className="mt-1 text-[11px] font-medium text-white/40">
            {anime.type} • {anime.duration}
          </p>
        </div>
        
        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
          <span className="inline-flex items-center gap-1 rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70">
            Sub <span className="tabular-nums text-white/40">{anime.episodes.sub}</span>
          </span>
          {anime.episodes.dub > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              Dub <span className="tabular-nums text-primary/60">{anime.episodes.dub}</span>
            </span>
          )}
        </div>
      </div>
    </GlassPanel>
  );
}

export const LatestEpisodes = memo(function LatestEpisodes({ animes }: LatestEpisodesProps) {
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

  if (!animes || animes.length === 0) return null;

  return (
    <section className="mb-10 md:mb-12 space-y-4 md:space-y-5" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 260px' }}>
      <HomeSectionHeading
        icon={<Zap className="w-5 h-5 text-amber" />}
        title="Latest Episodes"
        action={
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => scroll("left")}
              aria-label="Scroll left"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => scroll("right")}
              aria-label="Scroll right"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {/* Snap container for smooth, tactile scrolling */}
      <div
        ref={scrollRef}
        className="flex gap-3 md:gap-4 overflow-x-auto pb-4 pt-1 snap-x snap-proximity scroll-smooth scrollbar-hide [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y] -mx-1 px-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {animes.slice(0, 10).map((anime) => (
          <LatestEpisodeCard key={anime.id} anime={anime} />
        ))}
      </div>
    </section>
  );
})