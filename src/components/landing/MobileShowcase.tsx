import { BRAND_ASSET_BASE } from '@/lib/assets';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
"use client";

import { useEffect, useRef } from "react";
import { useMotionPreference } from "@/hooks/ui/useMotionPreference";
import { animate, stagger } from "animejs";
import { Reveal } from "@/components/ui/Reveal";
import { Smartphone, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";

const BRAND = BRAND_ASSET_BASE;

interface PhoneShot {
  src: string;
  name: string;
  line: string;
}

const phones: PhoneShot[] = [
  { src: `${BRAND}/mobile_home.jpg`, name: "Home", line: "Pick up where you left off" },
  { src: `${BRAND}/mobile_watch.jpg`, name: "Continue watching", line: "Your queue, always current" },
  { src: `${BRAND}/mobile_animeinfo.jpg`, name: "Anime details", line: "Scores, genres & your status" },
  { src: `${BRAND}/mobile_mangahome.jpg`, name: "Manga home", line: "Browse manga on the go" },
  { src: `${BRAND}/mobile_mangaread.jpg`, name: "Manga reader", line: "Chapters that remember you" },
  { src: `${BRAND}/mobile_community.jpg`, name: "Community", line: "The feed, on the go" },
  { src: `${BRAND}/mobile_download.jpg`, name: "Downloads", line: "Your offline shelf" },
  { src: `${BRAND}/mobile_profile.jpg`, name: "Profile", line: "Your taste, showcased" },
];

export function MobileShowcase() {
  useUiTranslation();
  const reduceMotion = useMotionPreference();
  const trackRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const cards = Array.from(track.querySelectorAll<HTMLElement>("[data-phone]"));

    if (!cards.length) return;

    if (reduceMotion) {
      cards.forEach((c) => {
        c.style.opacity = "1";
        c.style.transform = "none";
      });
      return;
    }

    let played = false;
    let entrance: ReturnType<typeof animate> | undefined;
    
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || played) return;
        played = true;
        entrance = animate(cards, {
          opacity: [0, 1],
          translateY: [44, 0],
          rotate: [2.5, 0],
          delay: stagger(85),
          duration: 850,
          ease: "out(3)",
        });
        io.disconnect();
      },
      { threshold: 0.15 },
    );
    io.observe(track);
    return () => {
      io.disconnect();
      try {
        entrance?.revert();
      } catch {
        /* noop */
      }
    };
  }, [reduceMotion]);

  const nudge = (dir: 1 | -1) => {
    railRef.current?.scrollBy({ left: dir * 320, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <section className="relative py-20 lg:py-32 overflow-hidden" aria-labelledby="mobile-heading">
      {/* Ambient Background Glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/10 blur-[120px]" />

      <Reveal>
        <div className="mb-14 flex flex-wrap items-end justify-between gap-8 lg:mb-20 px-6 lg:px-16">
          <div className="max-w-3xl">
            <div className="mb-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-violet-300/90">
              <span className="h-px w-8 bg-gradient-to-r from-violet-400/80 to-transparent" />
              <Smartphone className="h-4 w-4" />
              {uiI18n.t('app.mobile_app_cd39eab7')}
            </div>
            <h2
              id="mobile-heading"
              className="font-display text-[clamp(2.25rem,4.5vw,4rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-white"
            >
              {uiI18n.t('app.your_anime_world_a310ca53')} <br className="hidden sm:block"/> {uiI18n.t('app.in_your_pocket_28fe3887')}
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/60 sm:text-lg">
              {uiI18n.t('app.track_browse_and_keep_up_with_the_community_from_fef07814')}
            </p>
          </div>

          <div className="hidden gap-3 md:flex">
            <button
              type="button"
              onClick={() => nudge(-1)}
              aria-label={uiI18n.t('app.scroll_left_2c9e5a60')}
              className="group flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 backdrop-blur-md transition-[color,background-color,border-color,opacity,transform,box-shadow] hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-95"
            >
              <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" />
            </button>
            <button
              type="button"
              onClick={() => nudge(1)}
              aria-label={uiI18n.t('app.scroll_right_2994b49c')}
              className="group flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 backdrop-blur-md transition-[color,background-color,border-color,opacity,transform,box-shadow] hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-95"
            >
              <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        {/* CSS Mask-image for seamless edge fading regardless of background color */}
        <div className="relative w-full [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)] md:[mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] [-webkit-mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
          <div
            ref={railRef}
            className="flex snap-x snap-mandatory gap-6 overflow-x-auto px-[10vw] pb-12 pt-4 [scrollbar-width:none] lg:gap-8 [&::-webkit-scrollbar]:hidden"
          >
            <div ref={trackRef} className="flex gap-6 lg:gap-8">
              {phones.map((shot, i) => (
                <figure
                  key={shot.src}
                  data-phone
                  
                  className="group w-[210px] shrink-0 snap-center sm:w-[240px]"
                >
                  <div
                    data-phone-frame
                    className="relative rounded-[2.85rem] border border-white/10 bg-[#121118] p-[10px] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] ring-1 ring-black/50 transition-[color,background-color,border-color,opacity,transform,box-shadow] duration-200 ease-out group-hover:-translate-y-3 group-hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9),0_0_80px_-30px_rgba(139,92,246,0.3)]"
                  >
                    {/* Hardware Details (Side buttons) */}
                    <div className="absolute -left-[3px] top-24 h-10 w-[3px] rounded-l-sm bg-gradient-to-r from-white/20 to-transparent" />
                    <div className="absolute -left-[3px] top-36 h-14 w-[3px] rounded-l-sm bg-gradient-to-r from-white/20 to-transparent" />
                    <div className="absolute -right-[3px] top-32 h-16 w-[3px] rounded-r-sm bg-gradient-to-l from-white/20 to-transparent" />

                    {/* Screen Inner Bezel */}
                    <div className="relative aspect-[9/19] overflow-hidden rounded-[2.2rem] bg-black ring-1 ring-white/10 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
                      <img
                        src={shot.src}
                        alt={uiI18n.t('app.i18n_value_0_screen_f77ec101', { value0: shot.name })}
                        loading={i < 3 ? "eager" : "lazy"}
                        decoding="async"
                        draggable={false}
                        className="absolute inset-0 h-full w-full select-none object-cover object-top transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                      
                      {/* Modern "Dynamic Island" Notch */}
                      <div className="absolute left-1/2 top-3 z-20 flex h-[22px] w-[72px] -translate-x-1/2 items-center justify-end rounded-full bg-black px-2 ring-1 ring-white/[0.08] shadow-[inset_0_-2px_6px_rgba(255,255,255,0.05)]">
                         <div className="h-2.5 w-2.5 rounded-full bg-[#0a0a0a] ring-1 ring-white/10 flex items-center justify-center">
                            <div className="h-1 w-1 rounded-full bg-[#111] shadow-[inset_0_0_2px_rgba(255,255,255,0.5)]" />
                         </div>
                      </div>

                      {/* Screen Glare Overlay */}
                      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-tr from-white/[0.08] via-transparent to-transparent opacity-60 transition-opacity duration-200 group-hover:opacity-100" />
                    </div>
                  </div>

                  <figcaption className="mt-6 text-center transition-transform duration-200 group-hover:translate-y-1">
                    <p className="font-display text-base font-semibold text-white/90">{shot.name}</p>
                    <p className="mt-1 text-sm text-white/50">{shot.line}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

      {/* Cinematic Landscape Feature Card */}
      <Reveal delay={0.12}>
        <div className="px-6 lg:px-16 mt-6">
          <figure className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0d0c13] shadow-[0_30px_90px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/5">
            <img
              src={`${BRAND}/mobile_playersetting.jpg`}
              alt={uiI18n.t('app.player_settings_c1823e10')}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="aspect-[16/11] w-full select-none object-cover object-center transition-transform duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03] sm:aspect-[21/9]"
            />
            
            {/* Ambient vignette */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-200 group-hover:opacity-90" />
            
            {/* Floating UI Card Overlay */}
            <div className="absolute bottom-5 left-5 right-5 sm:bottom-8 sm:left-8 sm:max-w-[420px]">
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl transition-[color,background-color,border-color,opacity,transform,box-shadow] duration-200 group-hover:bg-black/50 group-hover:border-white/20">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                <div className="relative flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 shadow-inner">
                    <SlidersHorizontal className="h-5 w-5 text-violet-200" />
                  </span>
                  <div>
                    <p className="font-display text-lg font-semibold text-white">
                      {uiI18n.t('app.fine_tuned_playback_afe69d95')}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-white/60">
                      {uiI18n.t('app.quality_subtitles_audio_upscaling_perfectly_conf_928bd1bc')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </figure>
        </div>
      </Reveal>
    </section>
  );
}