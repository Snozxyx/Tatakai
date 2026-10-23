import uiI18n from "@/lib/uiI18n";
import { useUiTranslation } from "@/hooks/ui/useUiTranslation";
import { Star, Play, Pause } from "lucide-react";
import { memo, useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { GlassPanel } from "@/components/ui/GlassPanel";
import {
  SpotlightAnime,
  getProxiedImageUrl,
  getHighQualityImage,
} from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { AddToPlaylistButton } from "@/components/playlist/AddToPlaylistButton";
import { buildPreferredAnimeRouteId } from "@/lib/animeIdMapping";
import { useMobileAppearance } from "@/hooks/ui/useMobileAppearance";
import { useMotionPreference } from "@/hooks/ui/useMotionPreference";
import { useVisibleAutoplay } from "@/hooks/ui/useVisibleAutoplay";
import { CinematicHero } from "./CinematicHero";

interface HeroSectionProps {
  spotlight: SpotlightAnime;
  spotlights?: SpotlightAnime[];
  onActiveSpotlightChange?: (anime: SpotlightAnime) => void;
  /** Custom sources keep their exact route and cannot expose unverified catalogue actions. */
  getDetailsPath?: (anime: SpotlightAnime) => string;
  hideCatalogActions?: boolean;
  actionLabel?: string;
  mediaType?: "anime" | "manga" | "novel";
}

export const HeroSection = memo(function HeroSection({
  spotlight,
  spotlights = [],
  onActiveSpotlightChange,
  ...navigation
}: HeroSectionProps) {
  useUiTranslation();
  const refreshed = useMobileAppearance();
  return refreshed ? (
    <CinematicHero
      spotlights={spotlights.length ? spotlights : [spotlight]}
      onActiveSpotlightChange={onActiveSpotlightChange}
      {...navigation}
    />
  ) : (
    <ClassicHeroSection
      spotlight={spotlight}
      spotlights={spotlights}
      {...navigation}
    />
  );
});

const ClassicHeroSection = memo(function ClassicHeroSection({
  spotlight,
  spotlights = [],
  getDetailsPath,
  hideCatalogActions = false,
  actionLabel,
}: HeroSectionProps) {
  useUiTranslation();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const reduced = useMotionPreference();
  const { ref: sectionRef, visible: inView } = useVisibleAutoplay();
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout>>();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const touchXRef = useRef<number | null>(null);

  const allSpotlights =
    spotlights.length > 0 ? spotlights.slice(0, 5) : [spotlight];
  const activeSpotlight = allSpotlights[currentIndex] || spotlight;
  const heroImage = activeSpotlight.banner || activeSpotlight.poster;
  const routeAnimeId = buildPreferredAnimeRouteId({
    id: activeSpotlight.id,
    name: activeSpotlight.name,
    malId: (activeSpotlight as any)?.malId,
    anilistId: (activeSpotlight as any)?.anilistId,
  });

  // Auto-rotate spotlights
  useEffect(() => {
    if (allSpotlights.length <= 1 || paused || focused || reduced || !inView)
      return;

    const interval = setInterval(() => {
      setIsTransitioning(true);
      transitionTimer.current = setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % allSpotlights.length);
        setIsTransitioning(false);
      }, 400);
    }, 6000);

    return () => {
      clearInterval(interval);
      clearTimeout(transitionTimer.current);
      setIsTransitioning(false);
    };
  }, [allSpotlights.length, paused, focused, reduced, inView]);

  const handleWatch = () => {
    navigate(
      getDetailsPath
        ? getDetailsPath(activeSpotlight)
        : `/anime/${routeAnimeId || activeSpotlight.id}`
    );
  };

  const goTo = (idx: number) => {
    if (idx === currentIndex) return;
    clearTimeout(transitionTimer.current);
    if (reduced) {
      setCurrentIndex(idx);
      setIsTransitioning(false);
      return;
    }
    setIsTransitioning(true);
    transitionTimer.current = setTimeout(() => {
      setCurrentIndex(idx);
      setIsTransitioning(false);
    }, 250);
  };

  useEffect(() => () => clearTimeout(transitionTimer.current), []);

  const rotationControl =
    allSpotlights.length > 1 && !reduced ? (
      <button
        type="button"
        onClick={() => setPaused((value) => !value)}
        aria-label={
          paused ? t("migration.resumeRotation") : t("migration.pauseRotation")
        }
        aria-pressed={paused}
        className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
      >
        {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </button>
    ) : null;

  // Swipe between spotlights on touch.
  const onTouchStart = (e: React.TouchEvent) => {
    touchXRef.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchXRef.current == null) return;
    const dx = e.changedTouches[0].clientX - touchXRef.current;
    touchXRef.current = null;
    if (Math.abs(dx) < 48 || allSpotlights.length <= 1) return;
    const next =
      (currentIndex + (dx < 0 ? 1 : -1) + allSpotlights.length) %
      allSpotlights.length;
    goTo(next);
  };

  return (
    <section
      ref={sectionRef}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setFocused(false);
      }}
      className="balanced-spotlight relative mb-12 md:mb-16"
    >
      {/* Mobile Layout — immersive banner, swipeable */}
      <div
        className="classic-spotlight-mobile lg:hidden relative overflow-hidden rounded-3xl border border-white/[0.08] bg-black/80 shadow-2xl shadow-black/50"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Background poster with gradient overlay */}
        <div className="absolute inset-0 overflow-hidden">
          <img
            key={activeSpotlight.id}
            src={getHighQualityImage(
              activeSpotlight.banner || activeSpotlight.poster
            )}
            alt=""
            fetchPriority="high"
            decoding="async"
            className="w-full h-full object-cover scale-105 brightness-[0.55]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/15 via-black/70 to-black/90" />
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/90 to-transparent" />
          {/* Ambient glow — same token language as the desktop hero */}
          <div
            className="absolute -top-16 left-1/2 h-40 w-3/4 -translate-x-1/2 rounded-full bg-primary/25 blur-[80px]"
            aria-hidden
          />
        </div>

        {/* Mobile content */}
        <div
          className={`relative z-10 px-4 pb-5 pt-10 transition-opacity duration-300 ${
            isTransitioning ? "opacity-0" : "opacity-100"
          }`}
        >
          {/* Small poster + info */}
          <div className="flex gap-3.5 mb-4">
            <div className="w-28 flex-shrink-0 overflow-hidden rounded-2xl border border-white/15 shadow-2xl shadow-black/60 ring-1 ring-white/10">
              <img
                src={getHighQualityImage(activeSpotlight.poster)}
                alt={activeSpotlight.name}
                loading="eager"
                decoding="async"
                className="w-full aspect-[3/4] object-cover"
              />
            </div>

            <div className="flex-1 min-w-0 py-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber/30 bg-black/50 backdrop-blur-md text-amber text-[10px] font-bold tracking-wider uppercase mb-2 shadow-lg shadow-black/30">
                <Star className="w-2.5 h-2.5 fill-amber" />
                {t("discover.spotlightRank", { rank: activeSpotlight.rank })}
              </div>

              <h1 className="font-display text-2xl font-black tracking-tight leading-[1.05] text-white text-balance drop-shadow-lg mb-2 line-clamp-3">
                {activeSpotlight.name}
              </h1>

              <div className="flex gap-1.5 mb-2.5 overflow-x-auto no-scrollbar scrollbar-hide [-webkit-overflow-scrolling:touch]">
                {activeSpotlight.otherInfo.slice(0, 4).map((info, idx) => (
                  <span
                    key={idx}
                    className="shrink-0 px-2 py-0.5 rounded-md border border-white/15 bg-black/50 backdrop-blur-md text-[10px] font-semibold text-white/80"
                  >
                    {info}
                  </span>
                ))}
              </div>

              {!getDetailsPath && (
                <div className="text-[11px] font-semibold tabular-nums text-white/60">
                  {t("anime.sub")} {activeSpotlight.episodes.sub}{" "}
                  {activeSpotlight.episodes.dub
                    ? uiI18n.t("app.i18n_value_0_i18n_value_1_4df7889b", {
                        value0: t("anime.dub"),
                        value1: activeSpotlight.episodes.dub,
                      })
                    : ""}
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <p className="text-[13px] text-white/65 leading-relaxed line-clamp-2 mb-4">
            {activeSpotlight.description}
          </p>

          {/* Action buttons - full width on mobile */}
          <div className="flex gap-2.5">
            <button
              onClick={handleWatch}
              className="flex-1 h-[52px] rounded-2xl bg-white text-black font-bold text-[15px] active:scale-[0.98] transition-transform flex items-center justify-center gap-2 shadow-xl shadow-black/40 ring-1 ring-white/40"
            >
              <Play className="w-4 h-4 fill-black" />
              {actionLabel || t("discover.watchNow")}
            </button>
            {!hideCatalogActions && (
              <AddToPlaylistButton
                animeId={activeSpotlight.id}
                animeName={activeSpotlight.name}
                animePoster={activeSpotlight.poster}
                variant="icon"
                className="h-[52px] w-[52px] shrink-0 rounded-2xl border border-white/15 bg-black/50 text-white hover:text-white hover:bg-white/10 backdrop-blur-md ring-1 ring-white/10 flex items-center justify-center active:scale-95 transition-transform"
              />
            )}
          </div>

          {/* Navigation dots — 28px hit targets */}
          {allSpotlights.length > 1 && (
            <div className="flex items-center justify-center gap-1 pt-4">
              {rotationControl}
              {allSpotlights.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => goTo(idx)}
                  aria-label={t("migration.showSpotlight", { number: idx + 1 })}
                  aria-pressed={idx === currentIndex}
                  className="flex h-11 w-11 items-center justify-center"
                >
                  <span
                    className={`transition-[opacity,transform,background-color] duration-300 rounded-full ${
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

      {/* Desktop Layout - Side by side */}
      <div className="hidden lg:grid grid-cols-12 gap-8 items-center">
        {/* Typography & Info (Left) */}
        <div
          className={`col-span-5 space-y-8 z-20 transition-opacity duration-300 ${
            isTransitioning ? "opacity-0" : "opacity-100"
          }`}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber text-xs font-bold tracking-wider uppercase">
            <Star className="w-3 h-3 fill-amber" />
            {t("discover.spotlightRank", { rank: activeSpotlight.rank })}
          </div>

          <h1
            data-long-title={activeSpotlight.name.length > 60}
            className="spotlight-heading font-display text-5xl font-bold tracking-tight leading-[1.04] text-foreground"
          >
            {activeSpotlight.name.split(" ").slice(0, 2).join(" ")}
            {activeSpotlight.name.split(" ").length > 2 && (
              <>
                <br />
                <span className="text-foreground/60">
                  {activeSpotlight.name.split(" ").slice(2).join(" ")}
                </span>
              </>
            )}
          </h1>

          <p className="text-lg text-muted-foreground max-w-[42ch] leading-relaxed line-clamp-3">
            {activeSpotlight.description}
          </p>

          <div className="flex flex-wrap gap-3">
            {activeSpotlight.otherInfo.slice(0, 4).map((info, idx) => (
              <span
                key={idx}
                className="px-4 py-1.5 rounded-lg border border-border bg-muted/50 text-sm font-medium hover:bg-muted cursor-default transition-colors"
              >
                {info}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-4 pt-4">
            <button
              onClick={handleWatch}
              className="h-14 px-8 rounded-full bg-foreground text-background font-bold text-lg hover:scale-105 active:scale-95 transition-[opacity,transform,background-color] flex items-center gap-2 glow-primary"
            >
              <Play className="w-5 h-5 fill-background" />
              {actionLabel || t("discover.watchNow")}
            </button>
            {!hideCatalogActions && (
              <AddToPlaylistButton
                animeId={activeSpotlight.id}
                animeName={activeSpotlight.name}
                animePoster={activeSpotlight.poster}
                variant="icon"
                className="h-14 w-14 rounded-full border border-border bg-muted/50 flex items-center justify-center hover:bg-muted hover:border-foreground/30 transition-[opacity,transform,background-color]"
              />
            )}
          </div>

          {/* Navigation dots */}
          {allSpotlights.length > 1 && (
            <div className="flex items-center gap-2 pt-4">
              {rotationControl}
              {allSpotlights.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => goTo(idx)}
                  aria-label={t("migration.showSpotlight", { number: idx + 1 })}
                  aria-pressed={idx === currentIndex}
                  className="flex h-11 w-11 items-center justify-center rounded-full"
                >
                  <span
                    className={`h-2 rounded-full ${
                      idx === currentIndex
                        ? "w-8 bg-foreground"
                        : "w-2 bg-muted-foreground/50"
                    }`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Graphic/Image (Right) */}
        <div
          className={`col-span-7 relative h-[650px] transition-opacity duration-300 ${
            isTransitioning ? "opacity-0" : "opacity-100"
          }`}
        >
          {/* Background Glow behind image */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[70%] bg-gradient-to-br from-primary/40 to-secondary/40 rounded-full blur-[100px] opacity-30" />

          <GlassPanel className="w-full h-full p-2 rotate-[-2deg] ease-out group">
            <div className="relative w-full h-full rounded-2xl overflow-hidden">
              <img
                src={getHighQualityImage(heroImage)}
                alt={activeSpotlight.name}
                className="w-full h-full object-cover filter brightness-90 contrast-110 transition-transform duration-200 group-hover:scale-[1.025]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />

              {/* Embedded Metadata in Image */}
              <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end">
                {!getDetailsPath && (
                  <div>
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">
                      {t("anime.episodes")}
                    </div>
                    <div className="text-foreground font-medium">
                      {t("anime.sub")}: {activeSpotlight.episodes.sub} |{" "}
                      {t("anime.dub")}:{" "}
                      {activeSpotlight.episodes.dub ||
                        t("discover.notAvailable")}
                    </div>
                  </div>
                )}
                <div className="text-6xl font-black text-foreground/10 tracking-widest font-display">
                  #{activeSpotlight.rank}
                </div>
              </div>
            </div>
          </GlassPanel>

          {/* Floating Element */}
          {!getDetailsPath && (
            <GlassPanel className="absolute -bottom-10 -left-10 p-6 w-64 rotate-[3deg] z-30">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-muted-foreground">
                  {t("discover.japaneseLabel")}
                </span>
                <Star className="w-4 h-4 text-amber fill-amber" />
              </div>
              <div className="text-lg font-bold text-foreground mb-1 line-clamp-1">
                {activeSpotlight.jname}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("discover.originalTitle")}
              </div>
            </GlassPanel>
          )}
        </div>
      </div>
    </section>
  );
});
