import { Star, BookOpen } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { getProxiedImageUrl } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

interface MangaHeroSectionProps {
  spotlight: UnifiedMediaCardProps["item"];
  spotlights?: UnifiedMediaCardProps["item"][];
}

export function MangaHeroSection({ spotlight, spotlights = [] }: MangaHeroSectionProps) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const allSpotlights = spotlights.length > 0 ? spotlights.slice(0, 5) : [spotlight];
  const activeSpotlight = allSpotlights[currentIndex] || spotlight;

  useEffect(() => {
    if (allSpotlights.length <= 1) return;

    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % allSpotlights.length);
        setIsTransitioning(false);
      }, 400);
    }, 6000);

    return () => clearInterval(interval);
  }, [allSpotlights.length]);

  const handleRead = () => {
    navigate(`/manga/${activeSpotlight.id}`);
  };

  return (
    <section className="relative mb-16 md:mb-24">
      <div className="lg:hidden relative">
        <div className="absolute inset-0 h-[400px] overflow-hidden">
          <img
            src={getProxiedImageUrl(activeSpotlight.poster)}
            alt=""
            className="w-full h-full object-cover scale-105 brightness-50"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/85 to-background" />
        </div>

        <div
          className={`relative z-10 pt-8 px-2 transition-all duration-500 ${
            isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
          }`}
        >
          <div className="flex gap-4 mb-6">
            <div className="w-32 flex-shrink-0">
              <GlassPanel className="overflow-hidden rounded-xl">
                <img
                  src={getProxiedImageUrl(activeSpotlight.poster)}
                  alt={activeSpotlight.name}
                  className="w-full aspect-[3/4] object-cover"
                />
              </GlassPanel>
            </div>

            <div className="flex-1 min-w-0 py-2">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-amber/30 bg-amber/10 text-amber text-[10px] font-bold tracking-wider uppercase mb-2">
                <Star className="w-2.5 h-2.5 fill-amber" />
                Featured Manga
              </div>

              <h1 className="font-display text-xl font-black tracking-tight leading-tight gradient-text mb-2 line-clamp-2">
                {activeSpotlight.name}
              </h1>

              <div className="text-xs text-muted-foreground">
                {activeSpotlight.type || "Manga"} •{" "}
                {activeSpotlight.chapters
                  ? `${activeSpotlight.chapters} Chapters`
                  : activeSpotlight.status || "Ongoing"}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleRead}
              className="flex-1 h-12 rounded-full bg-foreground text-background font-bold text-sm hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <BookOpen className="w-4 h-4 fill-background" />
              Read Now
            </button>
          </div>

          {allSpotlights.length > 1 && (
            <div className="flex items-center justify-center gap-2 pt-6">
              {allSpotlights.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setIsTransitioning(true);
                    setTimeout(() => {
                      setCurrentIndex(idx);
                      setIsTransitioning(false);
                    }, 300);
                  }}
                  className={`transition-all duration-300 rounded-full ${
                    idx === currentIndex ? "w-6 h-1.5 bg-foreground" : "w-1.5 h-1.5 bg-muted-foreground/50"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hidden lg:grid grid-cols-12 gap-8 items-center">
        <div
          className={`col-span-5 space-y-8 z-20 transition-all duration-500 ${
            isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0 animate-fade-in"
          }`}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber text-xs font-bold tracking-wider uppercase">
            <Star className="w-3 h-3 fill-amber" />
            Featured Manga
          </div>

          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] gradient-text">
            {activeSpotlight.name.split(" ").slice(0, 3).join(" ")}
            {activeSpotlight.name.split(" ").length > 3 && (
              <>
                <br />
                <span className="text-foreground/60">{activeSpotlight.name.split(" ").slice(3).join(" ")}</span>
              </>
            )}
          </h1>

          <div className="flex flex-wrap gap-3">
            <span className="px-4 py-1.5 rounded-lg border border-border bg-muted/50 text-sm font-medium hover:bg-muted cursor-default transition-colors">
              {activeSpotlight.type || "Manga"}
            </span>
            <span className="px-4 py-1.5 rounded-lg border border-border bg-muted/50 text-sm font-medium hover:bg-muted cursor-default transition-colors">
              {activeSpotlight.status || "Ongoing"}
            </span>
            {activeSpotlight.chapters && (
              <span className="px-4 py-1.5 rounded-lg border border-border bg-muted/50 text-sm font-medium hover:bg-muted cursor-default transition-colors">
                {activeSpotlight.chapters} Chapters
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 pt-4">
            <button
              onClick={handleRead}
              className="h-14 px-8 rounded-full bg-foreground text-background font-bold text-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2 glow-primary"
            >
              <BookOpen className="w-5 h-5 fill-background" />
              Read Now
            </button>
          </div>

          {allSpotlights.length > 1 && (
            <div className="flex items-center gap-2 pt-4">
              {allSpotlights.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setIsTransitioning(true);
                    setTimeout(() => {
                      setCurrentIndex(idx);
                      setIsTransitioning(false);
                    }, 300);
                  }}
                  className={`transition-all duration-300 rounded-full ${
                    idx === currentIndex
                      ? "w-8 h-2 bg-foreground"
                      : "w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        <div
          className={`col-span-7 relative transition-all duration-700 ease-out ${
            isTransitioning ? "opacity-0 scale-95 translate-x-4" : "opacity-100 scale-100 translate-x-0"
          }`}
        >
          <div className="relative aspect-[16/9] w-full rounded-[2.5rem] overflow-hidden group">
            <img
              src={getProxiedImageUrl(activeSpotlight.poster)}
              alt={activeSpotlight.name}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-[2s] ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/20 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full bg-primary/20 blur-[100px] pointer-events-none mix-blend-screen" />
          </div>

          <div className="absolute -right-6 -bottom-6 w-48 aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border-4 border-background rotate-[-6deg] group-hover:rotate-0 transition-transform duration-500">
            <img
              src={getProxiedImageUrl(activeSpotlight.poster)}
              alt={activeSpotlight.name}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}