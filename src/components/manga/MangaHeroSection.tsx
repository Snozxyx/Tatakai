import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { Star, BookOpen, Pause, Play } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { getHighQualityImage } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import { useMemo } from 'react';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import { useVisibleAutoplay } from '@/hooks/ui/useVisibleAutoplay';
import { toMangaSpotlight } from '@/lib/mangaSpotlight';
import { useMobileAppearance } from '@/hooks/ui/useMobileAppearance';
import { CinematicHero, type CinematicSpotlight } from '@/components/anime/CinematicHero';

interface MangaHeroSectionProps {
  spotlight: UnifiedMediaCardProps["item"];
  spotlights?: UnifiedMediaCardProps["item"][];
  onActiveSpotlightChange?: (item: CinematicSpotlight) => void;
}


export function MangaHeroSection({ spotlight, spotlights, onActiveSpotlightChange }: MangaHeroSectionProps) {
  useUiTranslation();
  const refreshed = useMobileAppearance();
  const items = useMemo(() => (spotlights?.length ? spotlights : [spotlight]).map(toMangaSpotlight), [spotlight, spotlights]);
  return refreshed ? <CinematicHero spotlights={items} mediaType="manga" onActiveSpotlightChange={onActiveSpotlightChange} />
    : <ClassicMangaHeroSection spotlight={spotlight} spotlights={spotlights} />;
}

function ClassicMangaHeroSection({ spotlight, spotlights = [] }: MangaHeroSectionProps) {
  useUiTranslation();
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = useMotionPreference();
  const { ref: sectionRef, visible: inView } = useVisibleAutoplay();
  const transitionTimer = useRef<ReturnType<typeof setTimeout>>();

  const allSpotlights = spotlights.length > 0 ? spotlights.slice(0, 5) : [spotlight];
  const activeSpotlight = allSpotlights[currentIndex] || spotlight;
  const spotlightName = String(activeSpotlight?.name || "Untitled");
  const spotlightPoster = String(activeSpotlight?.poster || "");
  const spotlightType = activeSpotlight?.type || "Manga";
  const spotlightStatus = activeSpotlight?.status || "Ongoing";

  useEffect(() => {
    if (allSpotlights.length <= 1 || paused || focused || reduced || !inView) return;

    const interval = setInterval(() => {
      setIsTransitioning(true);
      transitionTimer.current = setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % allSpotlights.length);
        setIsTransitioning(false);
      }, 400);
    }, 6000);

    return () => { clearInterval(interval); clearTimeout(transitionTimer.current); setIsTransitioning(false); };
  }, [allSpotlights.length, paused, focused, reduced, inView]);
  useEffect(() => () => clearTimeout(transitionTimer.current), []);

  const handleRead = () => {
    if (activeSpotlight) navigate(`/manga/${activeSpotlight.id}`);
  };

  const goTo = (idx: number) => {
    if (idx === currentIndex) return;
    clearTimeout(transitionTimer.current);
    if (reduced) { setCurrentIndex(idx); setIsTransitioning(false); return; }
    setIsTransitioning(true);
    transitionTimer.current = setTimeout(() => {
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
    <section ref={sectionRef} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }} className="balanced-spotlight relative mb-12 md:mb-16">
      <div
        className="classic-spotlight-mobile lg:hidden relative overflow-hidden rounded-3xl border border-white/[0.08] bg-black/80 shadow-2xl shadow-black/50"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="absolute inset-0 h-[400px] overflow-hidden">
          <img
            src={getHighQualityImage(spotlightPoster)}
            alt=""
            className="w-full h-full object-cover scale-105 brightness-50"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/15 via-black/70 to-black/90" />
          {/* Ambient glow — same token language as the anime hero */}
          <div className="absolute -top-16 left-1/2 h-40 w-3/4 -translate-x-1/2 rounded-full bg-primary/25 blur-[80px]" aria-hidden />
        </div>

        <div
          className={`relative z-10 pt-8 px-4 pb-5 transition-opacity duration-300 ${isTransitioning ? "opacity-0" : "opacity-100"}`}
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
                {uiI18n.t('app.featured_manga_c823f1c9')}
              </div>

              <h1 className="font-display text-xl font-black tracking-tight leading-tight text-white text-balance drop-shadow-lg mb-2 line-clamp-3">
                {spotlightName}
              </h1>

              <div className="text-xs font-medium text-white/65">
                {spotlightType} •{" "}
                {activeSpotlight.chapters
                  ? uiI18n.t('app.i18n_value_0_chapters_a5ec6adf', { value0: activeSpotlight.chapters })
                  : spotlightStatus}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleRead}
              className="flex-1 h-12 rounded-2xl bg-white text-black font-bold text-sm hover:bg-white/90 motion-safe:active:scale-[.98] transition-[opacity,transform,background-color] flex items-center justify-center gap-2 shadow-xl shadow-black/40 ring-1 ring-white/40"
            >
              <BookOpen className="w-4 h-4 fill-black" />
              {uiI18n.t('app.read_now_1d9d0f1e')}
            </button>
          </div>

          {allSpotlights.length > 1 && (
            <div className="flex items-center justify-center gap-1 pt-4">
              {!reduced && <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? uiI18n.t('app.resume_spotlight_rotation_ea6487a4') : uiI18n.t('app.pause_spotlight_rotation_95348f6f')} aria-pressed={paused} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted/30">{paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}</button>}
              {allSpotlights.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => goTo(idx)}
                  aria-label={uiI18n.t('app.show_spotlight_i18n_value_0_03b2df1b', { value0: idx + 1 })}
                  aria-pressed={idx === currentIndex} className="flex h-11 w-11 items-center justify-center rounded-full"
                >
                  <span
                    className={`transition-[opacity,transform,background-color] duration-300 rounded-full ${idx === currentIndex
                        ? "w-6 h-1.5 bg-white"
                        : "w-1.5 h-1.5 bg-white/35"}`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hidden lg:grid grid-cols-12 gap-8 items-center">
        <div
          className={`col-span-5 space-y-8 z-20 transition-opacity duration-300 ${isTransitioning ? "opacity-0" : "opacity-100 "}`}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber text-xs font-bold tracking-wider uppercase">
            <Star className="w-3 h-3 fill-amber" />
            {uiI18n.t('app.featured_manga_c823f1c9')}
          </div>

          <h1 data-long-title={spotlightName.length > 60} className="spotlight-heading font-display text-5xl font-bold tracking-tight leading-[1.04] text-foreground">
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
                {activeSpotlight.chapters} {uiI18n.t('app.chapters_034e2733')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 pt-4">
            <button
              onClick={handleRead}
              className="h-14 px-8 rounded-full bg-foreground text-background font-bold text-lg hover:scale-105 active:scale-95 transition-[opacity,transform,background-color] flex items-center gap-2 glow-primary"
            >
              <BookOpen className="w-5 h-5 fill-background" />
              {uiI18n.t('app.read_now_1d9d0f1e')}
            </button>
          </div>

          {allSpotlights.length > 1 && (
            <div className="flex items-center gap-2 pt-4">
              {!reduced && <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? uiI18n.t('app.resume_spotlight_rotation_ea6487a4') : uiI18n.t('app.pause_spotlight_rotation_95348f6f')} aria-pressed={paused} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted/30">{paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}</button>}
              {allSpotlights.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => goTo(idx)}
                  aria-label={uiI18n.t('app.show_spotlight_i18n_value_0_03b2df1b', { value0: idx + 1 })}
                  aria-pressed={idx === currentIndex}
                  className="flex h-11 w-11 items-center justify-center rounded-full"
                ><span className={`h-2 rounded-full ${idx === currentIndex ? 'w-8 bg-foreground' : 'w-2 bg-muted-foreground/50'}`} /></button>
              ))}
            </div>
          )}
        </div>

        <div
          className={`col-span-7 relative transition-[opacity,transform,background-color] duration-700 ease-out ${isTransitioning ? "opacity-0" : "opacity-100"}`}
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
