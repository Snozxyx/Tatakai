import { Star, BookOpen } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { getHighQualityImage } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";

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
  const spotlightName = String(activeSpotlight?.name || "Untitled");
  const spotlightPoster = String(activeSpotlight?.poster || "");
  const spotlightType = activeSpotlight?.type || "Manga";
  const spotlightStatus = activeSpotlight?.status || "Ongoing";

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
    if (activeSpotlight) navigate(`/manga/${activeSpotlight.id}`);
  };

  const goTo = (idx: number) => {
    if (idx === currentIndex) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex(idx);
      setIsTransitioning(false);
    }, 250);
  };

  // Swipe between spotlights on touch — parity with the anime hero.
  const touchXRef = useRef<number | null>(null);
  const onTouchStart = (e: ReactTouchEvent) => {
    touchXRef.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: ReactTouchEvent) => {
    if (touchXRef.current == null) return;
    const dx = e.changedTouches[0].clientX - touchXRef.current;
    touchXRef.current = null;
    if (Math.abs(dx) < 48 || allSpotlights.length <= 1) return;
    const next = (currentIndex + (dx < 0 ? 1 : -1) + allSpotlights.length) % allSpotlights.length;
    goTo(next);
  };

  if (!activeSpotlight) return null;

  return (
    <section className="relative mb-16 md:mb-24">
      <div
        className="lg:hidden relative overflow-hidden rounded-3xl border border-white/[0.08] bg-background/40 shadow-2xl shadow-black/50"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="absolute inset-0 h-[400px] overflow-hidden">
          <img
            src={getHighQualityImage(spotlightPoster)}
            alt=""
            className="w-full h-full object-cover scale-105 brightness-50"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/15 via-background/85 to-background" />
          {/* Ambient glow — same token language as the anime hero */}
          <div className="absolute -top-16 left-1/2 h-40 w-3/4 -translate-x-1/2 rounded-full bg-primary/25 blur-[80px]" aria-hidden />
        </div>

        <div
          className={`relative z-10 pt-8 px-4 pb-5 transition-all duration-500 ${
            isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
          }`}
        >
          <div className="flex gap-4 mb-6">
            <div className="w-32 flex-shrink-0">
              <GlassPanel className="overflow-hidden rounded-2xl ring-1 ring-white/10 shadow-2xl shadow-black/60">
                <img
                  src={getHighQualityImage(spotlightPoster)}
                  alt={spotlightName}
                  className="w-full aspect-[3/4] object-cover"
                />
              </GlassPanel>
            </div>

            <div className="flex-1 min-w-0 py-2">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-amber/30 bg-amber-500/15 backdrop-blur-md text-amber text-[10px] font-bold tracking-wider uppercase mb-2 shadow-lg shadow-black/30">
                <Star className="w-2.5 h-2.5 fill-amber" />
                Featured Manga
              </div>

              <h1 className="font-display text-xl font-black tracking-tight leading-tight text-white text-balance drop-shadow-lg mb-2 line-clamp-3">
                {spotlightName}
              </h1>

              <div className="text-xs font-medium text-white/65">
                {spotlightType} •{" "}
                {activeSpotlight.chapters
                  ? `${activeSpotlight.chapters} Chapters`
                  : spotlightStatus}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleRead}
              className="flex-1 h-12 rounded-2xl bg-white text-black font-bold text-sm hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl shadow-black/40 ring-1 ring-white/40"
            >
              <BookOpen className="w-4 h-4 fill-black" />
              Read Now
            </button>
          </div>

          {allSpotlights.length > 1 && (
            <div className="flex items-center justify-center gap-1 pt-4">
              {allSpotlights.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => goTo(idx)}
                  aria-label={`Show spotlight ${idx + 1}`}
                  className="flex h-7 w-7 items-center justify-center"
                >
                  <span
                    className={`transition-all duration-300 rounded-full ${
                      idx === currentIndex
                        ? "w-6 h-1.5 bg-white"
                        : "w-1.5 h-1.5 bg-white/35"
                    }`}
                  />
                </button>
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
            {spotlightName.split(" ").slice(0, 3).join(" ")}
            {spotlightName.split(" ").length > 3 && (
              <>
                <br />
                <span className="text-foreground/60">{spotlightName.split(" ").slice(3).join(" ")}</span>
              </>
            )}
          </h1>

          <div className="flex flex-wrap gap-3">
            <span className="px-4 py-1.5 rounded-lg border border-border bg-muted/50 text-sm font-medium hover:bg-muted cursor-default transition-colors">
              {spotlightType}
            </span>
            <span className="px-4 py-1.5 rounded-lg border border-border bg-muted/50 text-sm font-medium hover:bg-muted cursor-default transition-colors">
              {spotlightStatus}
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
              src={getHighQualityImage(spotlightPoster)}
              alt={spotlightName}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-[2s] ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/20 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full bg-primary/20 blur-[100px] pointer-events-none mix-blend-screen" />
          </div>

          <div className="absolute -right-6 -bottom-6 w-48 aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border-4 border-background rotate-[-6deg] group-hover:rotate-0 transition-transform duration-500">
            <img
              src={getHighQualityImage(spotlightPoster)}
              alt={spotlightName}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}