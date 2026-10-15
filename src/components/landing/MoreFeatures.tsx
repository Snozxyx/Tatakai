import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
"use client";

import { useEffect, useRef } from "react";
import { useMotionPreference } from "@/hooks/ui/useMotionPreference";
import { animate, stagger } from "animejs";
import { gsap } from "gsap";
import {
  Palette,
  Bell,
  ScanSearch,
  PartyPopper,
  Trophy,
  MessagesSquare,
  ListOrdered,
  MonitorSmartphone,
  Bookmark,
  type LucideIcon,
} from "lucide-react";

interface Extra {
  icon: LucideIcon;
  title: string;
  body: string;
  accent: string;
}

// Features the media showcase above doesn't cover — the "there's more" list.
const extras: Extra[] = [
  { icon: Palette, get title() { return uiI18n.t('app.25_themes_3e75499d'); }, get body() { return uiI18n.t('app.light_dark_and_accented_looks_plus_a_lite_mode_t_ca61478a'); }, accent: "text-violet-300" },
  { icon: Bell, get title() { return uiI18n.t('app.airing_calendar_37949cd3'); }, get body() { return uiI18n.t('app.seasonal_charts_and_airing_schedules_with_remind_260bb313'); }, accent: "text-cyan-300" },
  { icon: ScanSearch, get title() { return uiI18n.t('app.search_by_screenshot_12f98526'); }, get body() { return uiI18n.t('app.recognize_any_scene_with_image_search_powered_by_f0f8afcd'); }, accent: "text-pink-300" },
  { icon: PartyPopper, get title() { return uiI18n.t('app.watch2together_cde01fad'); }, get body() { return uiI18n.t('app.host_sync_watch_parties_and_react_in_real_time_w_2b37577d'); }, accent: "text-amber-300" },
  { icon: Trophy, get title() { return uiI18n.t('app.ranks_leaderboards_ef2ca515'); }, get body() { return uiI18n.t('app.climb_the_ranks_collect_badges_and_top_the_contr_4a47b4ac'); }, accent: "text-emerald-300" },
  { icon: MessagesSquare, get title() { return uiI18n.t('app.forums_threads_71864988'); }, get body() { return uiI18n.t('app.reddit_style_threaded_discussions_for_every_corn_7ff77bbb'); }, accent: "text-violet-300" },
  { icon: ListOrdered, get title() { return uiI18n.t('app.tier_lists_bfe1b707'); }, get body() { return uiI18n.t('app.build_rank_and_share_your_definitive_takes_74672eb4'); }, accent: "text-cyan-300" },
  { icon: MonitorSmartphone, get title() { return uiI18n.t('app.web_desktop_mobile_f1509cd0'); }, get body() { return uiI18n.t('app.pick_up_on_the_browser_the_desktop_app_and_andro_7e19412b'); }, accent: "text-pink-300" },
  { icon: Bookmark, get title() { return uiI18n.t('app.plan_to_watch_4a4ffa92'); }, get body() { return uiI18n.t('app.a_dedicated_backlog_for_everything_you_plan_to_w_d9b0d028'); }, accent: "text-amber-300" },
];

// Breadth strip — scrolled by GSAP, kept honest against the feature list.
const marquee = [
  "Airing calendar", "Plan to watch", "25+ themes", "Web", "Desktop",
  "Android", "IOS", "trace.moe search", "Watch parties", "Tier lists",
  "Forums", "Leaderboards", "Playlists", "MAL & AniList sync", "Lite mode",
];

export function MoreFeatures() {
  useUiTranslation();
  const reduceMotion = useMotionPreference();
  const gridRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);

  // anime.js: stagger the cards in once, the first time the grid scrolls in.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-extra]"));
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
          translateY: [28, 0],
          scale: [0.96, 1],
          delay: stagger(65, { grid: [3, 3], from: "first" }),
          duration: 700,
          ease: "out(3)",
        });
        io.disconnect();
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => { io.disconnect(); entrance?.revert(); };
  }, [reduceMotion]);

  // GSAP: seamless auto-scrolling breadth strip. Static under reduced motion.
  useEffect(() => {
    const track = marqueeRef.current;
    if (!track || reduceMotion) return;
    const ctx = gsap.context(() => {
      gsap.to(track, { xPercent: -50, ease: "none", duration: 28, repeat: -1 });
    }, track);
    return () => ctx.revert();
  }, [reduceMotion]);

  return (
    <section className="py-16 lg:py-24">
      <div className="mb-12 max-w-2xl">
        <h2 className="font-display text-[clamp(1.9rem,4vw,3.25rem)] font-medium leading-[1.02] tracking-[-0.03em] text-white">
          {uiI18n.t('app.there_s_even_more_inside_245c026d')}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-white/55 lg:text-lg">
          {uiI18n.t('app.the_showcase_only_scratches_the_surface_here_s_a_dd322cbb')}
        </p>
      </div>

      <div ref={gridRef} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {extras.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              data-extra

              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md transition-colors duration-300 hover:border-white/25 hover:bg-white/[0.05]"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <Icon className={`h-5 w-5 ${f.accent}`} />
              </div>
              <h3 className="mb-2 font-display text-lg font-medium text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-white/55">{f.body}</p>
            </div>
          );
        })}
      </div>

      {/* GSAP marquee — the breadth, at a glance */}
      <div className="relative mt-12 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] py-4">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-black to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-black to-transparent" />
        <div
          ref={marqueeRef}
          className={`flex items-center gap-6 ${reduceMotion ? "flex-wrap justify-center px-6" : "w-max"}`}
        >
          {(reduceMotion ? marquee : [...marquee, ...marquee]).map((label, i) => (
            <span key={i} className="flex items-center gap-3 whitespace-nowrap text-sm font-medium text-white/70">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-br from-violet-400 to-cyan-400" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
