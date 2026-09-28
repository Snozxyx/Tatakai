"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

interface ShowcaseMediaProps {
  type: "video" | "image";
  src: string;
  poster?: string;
  /** Accessible description of the feature shown. */
  label: string;
  className?: string;
  /** CSS aspect-ratio for the frame, e.g. "16 / 9". */
  ratio?: string;
  /** object-position focus; screenshots usually read best from the top. */
  focus?: string;
}

/**
 * A framed piece of showcase media for the landing page.
 *
 * Videos are lazy: the file only downloads once the card nears the viewport,
 * then autoplays (muted + looping) while visible and pauses when scrolled
 * away — so the page never pulls every clip at once. Honors
 * prefers-reduced-motion by showing a paused, user-controllable video.
 */
export function ShowcaseMedia({
  type,
  src,
  poster,
  label,
  className = "",
  ratio = "16 / 9",
  focus = "center top",
}: ShowcaseMediaProps) {
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shouldLoad, setShouldLoad] = useState(type !== "video");
  const [inView, setInView] = useState(false);

  // Load + track visibility for videos only.
  useEffect(() => {
    if (type !== "video") return;
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          setInView(true);
        } else {
          setInView(false);
        }
      },
      { threshold: 0.35, rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [type]);

  // Play while visible, pause when not. Skip autoplay under reduced motion.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || type !== "video" || reduceMotion) return;
    if (inView && shouldLoad) {
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } else {
      v.pause();
    }
  }, [inView, shouldLoad, type, reduceMotion]);

  return (
    <div
      ref={containerRef}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_24px_70px_-24px_rgba(0,0,0,0.85)] backdrop-blur-md transition-transform duration-500 will-change-transform hover:scale-[1.015] ${className}`}
      style={{ aspectRatio: ratio }}
    >
      {/* Soft gradient glow, strengthens on hover */}
      <div className="pointer-events-none absolute -inset-px z-0 rounded-2xl bg-gradient-to-br from-violet-500/20 via-transparent to-cyan-500/20 opacity-40 transition-opacity duration-500 group-hover:opacity-100" />
      {/* Top-edge highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

      {type === "video" ? (
        <video
          ref={videoRef}
          src={shouldLoad ? src : undefined}
          muted
          loop
          playsInline
          preload="none"
          poster={poster}
          controls={!!reduceMotion}
          aria-label={label}
          className="relative z-10 h-full w-full object-cover"
          style={{ objectPosition: focus }}
        />
      ) : (
        <img
          src={src}
          alt={label}
          loading="lazy"
          decoding="async"
          className="relative z-10 h-full w-full object-cover"
          style={{ objectPosition: focus }}
        />
      )}
    </div>
  );
}
