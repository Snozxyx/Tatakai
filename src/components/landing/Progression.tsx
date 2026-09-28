"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { animate, stagger } from "animejs";
import { gsap } from "gsap";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/utils";
import { Trophy, CheckCircle2, Lock } from "lucide-react";
import {
  RANK_TIERS,
  getRankImageUrl,
  getRankTier,
  getNextRankTier,
  getRankClassForRank,
  getBadgeHoverClass,
} from "@/lib/rankUtils";

// A representative score for the marketing preview — mid-ladder so the hero rank
// shows a striking effect and the progress bar sits partway to the next tier.
const PREVIEW_SCORE = 1500;

export function Progression() {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const current = getRankTier(PREVIEW_SCORE);
  const next = getNextRankTier(PREVIEW_SCORE);
  const pct = next
    ? Math.min(100, Math.round((next.progress / (next.progress + next.needed)) * 100))
    : 100;
  const unlockedCount = RANK_TIERS.filter((t) => PREVIEW_SCORE >= t.minScore).length;

  // gsap grows the rank bar; anime.js pops the badge ladder in — once, on scroll-in.
  useEffect(() => {
    const root = rootRef.current;
    const bar = barRef.current;
    if (!root) return;
    const chips = Array.from(root.querySelectorAll<HTMLElement>("[data-badge]"));

    if (reduceMotion) {
      chips.forEach((c) => {
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
        if (bar) {
          gsap.fromTo(
            bar,
            { scaleX: 0, transformOrigin: "left" },
            { scaleX: 1, transformOrigin: "left", duration: 1.4, ease: "power3.out" },
          );
        }
        if (chips.length) {
          animate(chips, {
            opacity: [0, 1],
            translateY: [16, 0],
            scale: [0.7, 1],
            delay: stagger(45),
            duration: 520,
            ease: "out(4)",
          });
        }
        io.disconnect();
      },
      { threshold: 0.3 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, [reduceMotion]);

  return (
    <section className="py-16 lg:py-24">
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur-md">
              <Trophy className="h-3.5 w-3.5 text-amber-300" />
              <span className="text-xs font-medium text-white/70">Progression</span>
            </div>
            <h2 className="mb-4 font-display text-[clamp(1.6rem,3vw,2.5rem)] font-medium leading-[1.05] tracking-[-0.03em] text-white">
              Every episode counts
            </h2>
            <p className="mb-6 max-w-md text-base leading-relaxed text-white/60">
              One rank climbs as you watch and read across the whole app — anime, manga, manhwa
              and comics all feed the same score. Sixteen tiers, each with its own effect, and a
              leaderboard to prove it.
            </p>
            <ul className="flex flex-wrap gap-2">
              {["16 ranks", "One unified score", "Per-rank effects", "Leaderboards"].map((p) => (
                <li key={p} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">{p}</li>
              ))}
            </ul>
          </div>
        </Reveal>

        <div ref={rootRef}>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md lg:p-8">
            {/* Current-rank hero — real Mitsu icon + per-rank name effect */}
            <div className="mb-6 flex items-center gap-4">
              <div className="relative shrink-0">
                <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />
                <img
                  src={getRankImageUrl(current.rank)}
                  alt={current.name}
                  className="relative z-10 h-16 w-16 object-contain drop-shadow-xl"
                />
              </div>
              <div className="min-w-0">
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/50">
                  Current rank
                </p>
                <h3 className={cn("font-display text-2xl font-bold tracking-tight", getRankClassForRank(current.rank))}>
                  {current.name}
                </h3>
                <p className="font-mono text-xs text-white/40">
                  Rank {current.rank} / 16 · {PREVIEW_SCORE.toLocaleString()} RP
                </p>
              </div>
            </div>

            {/* Progress to next tier */}
            {next && (
              <div className="mb-6 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/55">Progress to {next.tier.name}</span>
                  <span className="font-mono text-white/45">{next.needed} RP left</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    ref={barRef}
                    style={{ width: `${pct}%`, transformOrigin: "left", transform: reduceMotion ? "scaleX(1)" : "scaleX(0)" }}
                    className="h-full rounded-full bg-gradient-to-r from-violet-400 via-pink-400 to-cyan-400"
                  />
                </div>
              </div>
            )}

            {/* Rank ladder — all 16 real badges, unlocked/locked like the profile */}
            <div className="mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-300/80" />
              <span className="font-display text-sm font-medium text-white">Rank badges</span>
              <span className="text-xs text-white/40">{unlockedCount} / 16</span>
            </div>
            <div className="grid grid-cols-8 gap-2">
              {RANK_TIERS.map((tier) => {
                const unlocked = PREVIEW_SCORE >= tier.minScore;
                const isCurrent = tier.rank === current.rank;
                return (
                  <div
                    key={tier.rank}
                    data-badge
                    title={`${tier.name} — ${tier.minScore.toLocaleString()} RP`}
                    style={reduceMotion ? undefined : { opacity: 0 }}
                    className={cn(
                      "group relative flex items-center justify-center rounded-lg border p-1.5 transition-colors duration-300",
                      unlocked
                        ? cn("border-white/10 bg-white/[0.04]", getBadgeHoverClass(tier.rank))
                        : "border-white/[0.04] bg-white/[0.01] opacity-45",
                      isCurrent && "border-primary/40 bg-primary/[0.06] opacity-100 ring-1 ring-primary/30",
                    )}
                  >
                    <img
                      src={getRankImageUrl(tier.rank)}
                      alt={tier.name}
                      className={cn("h-8 w-8 object-contain", !unlocked && "grayscale")}
                    />
                    <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border bg-black">
                      {unlocked ? (
                        <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                      ) : (
                        <Lock className="h-2 w-2 text-white/50" />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
