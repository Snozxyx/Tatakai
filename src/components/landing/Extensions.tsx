"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { animate, stagger } from "animejs";
import { Reveal } from "@/components/ui/Reveal";
import { ShowcaseMedia } from "@/components/landing/ShowcaseMedia";
import { Puzzle, Palette, Layers, ShieldCheck, Boxes, type LucideIcon } from "lucide-react";

const BRAND = "/assets/brand";

interface Ext {
  icon: LucideIcon;
  name: string;
  kind: string;
  accent: string;
}

// The extension model, shown as an "installed sources" strip beneath the demo.
const sources: Ext[] = [
  { icon: Boxes, name: "Multi-source library", kind: "Anime · Manga", accent: "text-violet-300" },
  { icon: Palette, name: "Custom themes", kind: "Appearance", accent: "text-cyan-300" },
  { icon: ShieldCheck, name: "Moderated & trusted", kind: "Safety gate", accent: "text-emerald-300" },
  { icon: Layers, name: "Stack several at once", kind: "Priority routing", accent: "text-pink-300" },
];

export function Extensions() {
  const reduceMotion = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);

  // anime.js: slide the source cards in once, when the strip scrolls into view.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>("[data-ext]"));
    if (!rows.length) return;

    if (reduceMotion) {
      rows.forEach((r) => {
        r.style.opacity = "1";
        r.style.transform = "none";
      });
      return;
    }

    let played = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || played) return;
        played = true;
        animate(rows, {
          opacity: [0, 1],
          translateY: [20, 0],
          delay: stagger(90),
          duration: 620,
          ease: "out(3)",
        });
        io.disconnect();
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduceMotion]);

  return (
    <section className="py-16 lg:py-24">
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
        <Reveal className="lg:order-1">
          <ShowcaseMedia type="video" src={`${BRAND}/extension.mp4`} label="Extensions — preview" />
        </Reveal>

        <Reveal className="lg:order-2">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur-md">
              <Puzzle className="h-3.5 w-3.5 text-violet-300" />
              <span className="text-xs font-medium text-white/70">Extensions</span>
            </div>
            <h2 className="mb-4 font-display text-[clamp(1.6rem,3vw,2.5rem)] font-medium leading-[1.05] tracking-[-0.03em] text-white">
              Your sources, your way
            </h2>
            <p className="mb-6 max-w-md text-base leading-relaxed text-white/60">
              Tatakai is built around extensions. Add the sources you want, theme the app to
              taste, and run several at once — nothing is hard-wired, and everything stays in your
              hands.
            </p>
            <ul className="flex flex-wrap gap-2">
              {["Custom sources", "Themeable", "Community-built", "Multi-source"].map((p) => (
                <li key={p} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">{p}</li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>

      <div ref={listRef} className="mt-10 grid gap-3 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4">
        {sources.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.name}
              data-ext
              style={reduceMotion ? undefined : { opacity: 0 }}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md transition-colors duration-300 hover:border-white/25 hover:bg-white/[0.05]"
            >
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <Icon className={`h-5 w-5 ${s.accent}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-medium text-white">{s.name}</p>
                <p className="truncate text-xs text-white/50">{s.kind}</p>
              </div>
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.5)]" />
            </div>
          );
        })}
      </div>
    </section>
  );
}
