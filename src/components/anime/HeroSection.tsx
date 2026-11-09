import uiI18n from "@/lib/uiI18n";
import { useUiTranslation } from "@/hooks/ui/useUiTranslation";
import { Play, Pause } from "lucide-react";
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
import { SpotlightPresentation, useSpotlightPresentation } from '@/components/customization/SpotlightPresentation';

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
  const presentation = useSpotlightPresentation();
  return (presentation?.variant === 'cinematic' || presentation?.variant !== 'classic' && refreshed) ? (
    <CinematicHero
      spotlights={spotlights.length ? spotlights : [spotlight]}
      onActiveSpotlightChange={onActiveSpotlightChange}
      {...navigation}
    />
  ) : (
    <SpotlightPresentation>
    <ClassicHeroSection
      spotlight={spotlight}
      spotlights={spotlights}
      {...navigation}
    />
    </SpotlightPresentation>
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
      <div data-spotlight-stage
        className="classic-spotlight-mobile lg:hidden relative overflow-hidden rounded-3xl border border-white/[0.08] bg-black/80 shadow-2xl shadow-black/50"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Background poster with gradient overlay */}
        <div className="absolute inset-0 overflow-hidden">
          <img data-spotlight-art
            key={activeSpotlight.id}
            src={getHighQualityImage(
              activeSpotlight.banner || activeSpotlight.poster
            )}
            alt=""
            fetchPriority="high"
            decoding="async"
            className="w-full h-full object-cover scale-105 brightness-[0.55]"
          />
          <div data-spotlight-shade className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-black/90" />
          <div data-spotlight-shade className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/90 to-transparent" />
        </div>

        {/* Mobile content */}
        <div
          className={`relative z-10 px-5 pb-5 pt-8 transition-opacity duration-300 ${
            isTransitioning ? "opacity-0" : "opacity-100"
          }`}
        >
          {/* Small poster + info */}
          <div className="flex gap-4 mb-4">
            <div className="w-28 flex-shrink-0 overflow-hidden rounded-2xl border border-white/15 shadow-2xl shadow-black/60 ring-1 ring-white/10">
              <img data-spotlight-art
                src={getHighQualityImage(activeSpotlight.poster)}
                alt={activeSpotlight.name}
                loading="eager"
                decoding="async"
                className="w-full aspect-[3/4] object-cover"
              />
            </div>

            <div data-spotlight-copy className="flex-1 min-w-0 py-1">
              <div className="inline-flex items-center gap-2 text-white/80 text-xs font-medium mb-2">
                {t("discover.spotlightRank", { rank: activeSpotlight.rank })}
              </div>

              <h1 data-spotlight-title className="font-display text-2xl font-medium tracking-tight leading-[1.05] text-white text-balance drop-shadow-lg mb-2 line-clamp-3">
                {activeSpotlight.name}
              </h1>

              <div data-spotlight-metadata className="flex gap-1.5 mb-2.5 overflow-x-auto no-scrollbar scrollbar-hide [-webkit-overflow-scrolling:touch]">
                {activeSpotlight.otherInfo.slice(0, 4).map((info, idx) => (
                  <span
                    key={idx}
                    className="shrink-0 px-2 py-0.5 rounded-md border border-white/15 bg-black/50 backdrop-blur-md text-xs font-medium text-white/80"
                  >
                    {info}
                  </span>
                ))}
              </div>

              {!getDetailsPath && (
                <div data-spotlight-metadata className="text-xs font-medium tabular-nums text-white/60">
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
          <p data-spotlight-description className="text-[13px] text-white/65 leading-relaxed line-clamp-2 mb-4">
            {activeSpotlight.description}
          </p>

          {/* Action buttons - full width on mobile */}
          <div data-spotlight-actions className="flex gap-3">
            <button
              onClick={handleWatch}
              className="flex-1 h-12 rounded-[10px] bg-white text-black font-medium text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
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
                className="h-12 w-12 shrink-0 rounded-[10px] border border-white/15 bg-black/50 text-white hover:text-white hover:bg-white/10 flex items-center justify-center active:scale-[0.98] transition-transform"
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
      <div data-spotlight-stage className="hidden lg:grid grid-cols-12 gap-8 items-center">
        {/* Typography & Info (Left) */}
        <div data-spotlight-copy
          className={`col-span-5 space-y-6 z-20 transition-opacity duration-300 ${
            isTransitioning ? "opacity-0" : "opacity-100"
          }`}
        >
          <div className="inline-flex items-center gap-2 text-muted-foreground text-xs font-medium">
            {t("discover.spotlightRank", { rank: activeSpotlight.rank })}
          </div>

          <h1 data-spotlight-title
            data-long-title={activeSpotlight.name.length > 60}
            className="spotlight-heading font-display text-5xl font-medium tracking-tight leading-[1.04] text-foreground"
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

          <p data-spotlight-description className="text-lg text-muted-foreground max-w-[42ch] leading-relaxed line-clamp-3">
            {activeSpotlight.description}
          </p>

          <div data-spotlight-metadata className="flex flex-wrap gap-3">
            {activeSpotlight.otherInfo.slice(0, 4).map((info, idx) => (
              <span
                key={idx}
                className="px-4 py-1.5 rounded-lg border border-border bg-muted/50 text-sm font-medium hover:bg-muted cursor-default transition-colors"
              >
                {info}
              </span>
            ))}
          </div>

          <div data-spotlight-actions className="flex items-center gap-3">
            <button
              onClick={handleWatch}
              className="h-12 px-6 rounded-[10px] bg-foreground text-background font-medium text-sm  active:scale-[0.98] transition-[opacity,transform,background-color] flex items-center gap-2"
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
                className="h-12 w-12 rounded-[10px] border border-border bg-muted/50 flex items-center justify-center hover:bg-muted hover:border-foreground/30 transition-[opacity,transform,background-color]"
              />
            )}
          </div>

          {/* Navigation dots */}
          {allSpotlights.length > 1 && (
            <div className="flex items-center gap-2">
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
        <div data-spotlight-graphic
          className={`col-span-7 relative h-[clamp(360px,38vw,560px)] transition-opacity duration-300 ${
            isTransitioning ? "opacity-0" : "opacity-100"
          }`}
        >
          <GlassPanel quiet className="w-full h-full p-2 rotate-[-2deg] ease-out group">
            <div className="relative w-full h-full rounded-lg overflow-hidden">
              <img data-spotlight-art
                src={getHighQualityImage(heroImage)}
                alt={activeSpotlight.name}
                className="w-full h-full object-cover filter brightness-90 contrast-110 transition-transform duration-200 "
              />
              <div data-spotlight-shade className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />

              {/* Embedded Metadata in Image */}
              <div data-spotlight-metadata className="absolute bottom-8 left-8 right-8 flex justify-between items-end">
                {!getDetailsPath && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground normal-case tracking-normal mb-1">
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
              </div>
            </div>
          </GlassPanel>

          {/* Floating Element */}
          {!getDetailsPath && (
            <GlassPanel quiet className="absolute -bottom-6 -left-6 p-5 w-64 rotate-[3deg] z-30">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("discover.japaneseLabel")}
                </span>
              </div>
              <div className="text-lg font-medium text-foreground mb-1 line-clamp-1">
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
