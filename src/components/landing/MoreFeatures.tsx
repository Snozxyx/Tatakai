"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { animate, stagger } from "animejs";
import { gsap } from "gsap";
import {
  Palette,
  Languages,
  ScanSearch,
  PartyPopper,
  Trophy,
  MessagesSquare,
  ListOrdered,
  MonitorSmartphone,
  Server,
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
  { icon: Palette, title: "25+ themes", body: "Light, dark, and accented looks — plus a Lite mode that keeps low-end devices smooth.", accent: "text-violet-300" },
  { icon: Languages, title: "Dubs in 13 languages", body: "German, French, Hindi, Telugu, Malayalam and more, pulled from 30+ servers.", accent: "text-cyan-300" },
  { icon: ScanSearch, title: "Search by screenshot", body: "Recognize any scene with image search powered by trace.moe.", accent: "text-pink-300" },
  { icon: PartyPopper, title: "Watch2Together", body: "Host sync watch parties and react in real time with friends.", accent: "text-amber-300" },
  { icon: Trophy, title: "Ranks & leaderboards", body: "Climb the ranks, collect badges, and top the contributor board.", accent: "text-emerald-300" },
  { icon: MessagesSquare, title: "Forums & threads", body: "Reddit-style threaded discussions for every corner of anime.", accent: "text-violet-300" },
  { icon: ListOrdered, title: "Tier lists", body: "Build, rank, and share your definitive takes.", accent: "text-cyan-300" },
  { icon: MonitorSmartphone, title: "Web, desktop & mobile", body: "Pick up on the browser, the desktop app, or Android (soon).", accent: "text-pink-300" },
  { icon: Server, title: "Community servers", body: "Add moderated, fan-run video servers to widen your sources.", accent: "text-amber-300" },
];

// Breadth strip — scrolled by GSAP, kept honest against the feature list.
const marquee = [
  "13 dub languages", "30+ servers", "25+ themes", "Web", "Desktop",
  "Android soon", "trace.moe search", "Watch parties", "Tier lists",
  "Forums", "Leaderboards", "Playlists", "MAL & AniList sync", "Lite mode",
];

export function MoreFeatures() {
  const reduceMotion = useReducedMotion();
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
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || played) return;
        played = true;
        animate(cards, {
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
    return () => io.disconnect();
  }, [reduceMotion]);

  // GSAP: seamless auto-scrolling breadth strip. Static under reduced motion.
  useEffect(() => {
    const track = marqueeRef.current;
    if (!track || reduceMotion) return;
    const ctx = gsap.context(() => {
      gsap.to(track, { xPercent: -50, ease: "none", duration: 28, repeat: -1 });
    });
    return () => ctx.revert();
  }, [reduceMotion]);

  return (
    <section className="py-16 lg:py-24">
      <div className="mb-12 max-w-2xl">
        <h2 className="font-display text-[clamp(1.9rem,4vw,3.25rem)] font-medium leading-[1.02] tracking-[-0.03em] text-white">
          {"There’s even more inside"}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-white/55 lg:text-lg">
          {"The showcase only scratches the surface — here’s a little of what else is waiting once you’re in."}
        </p>
      </div>

      <div ref={gridRef} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {extras.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              data-extra
              style={reduceMotion ? undefined : { opacity: 0 }}
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
