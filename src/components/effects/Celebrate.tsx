/**
 * Lightweight celebration burst — the app's "delight budget" primitive.
 * DOM particles only, no canvas.
 *
 * Fire from anywhere via `celebrate()`. Single <CelebrationHost/> mounted
 * once in MainLayout renders bursts into a body portal and self-cleans.
 *
 * Reduced motion: celebrate() no-ops + BurstLayer returns null + CSS
 * media query hides strays as a backstop.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from 'framer-motion';

export type CelebrateVariant = 'petal' | 'confetti' | 'spark' | 'heart' | 'magic';

export interface CelebrateOptions {
  /** Viewport-space origin. Defaults to screen centre. */
  x?: number;
  y?: number;
  variant?: CelebrateVariant;
  /** Particle count, clamped 6–48. Default 18. */
  count?: number;
  /** Base duration ms. Default 1100. */
  duration?: number;
  /** Distance multiplier. Default 1. */
  spread?: number;
  /** Override emoji glyphs. */
  glyphs?: string[];
  /** Override paper-dot colors (confetti/magic). */
  colors?: string[];
  /** Disable the expanding ring + core flash. */
  disableRing?: boolean;
}

interface BurstSpec {
  id: number;
  x: number;
  y: number;
  variant: CelebrateVariant;
  count: number;
  duration: number;
  spread: number;
  glyphs?: string[];
  colors?: string[];
  disableRing: boolean;
}

type Listener = (b: BurstSpec) => void;
const listeners = new Set<Listener>();
let seq = 0;

const MIN_COUNT = 6;
const MAX_COUNT = 48;
const DEFAULT_DURATION = 1100;
const MAX_BURSTS = 6;
const STYLE_ID = 'celebration-burst-styles';

const GLYPHS: Record<CelebrateVariant, string[]> = {
  petal: ['🌸', '🌸', '🌷', '❀', '💮'],
  confetti: ['🎉', '✨', '🎊', '⭐'],
  spark: ['✨', '⚡', '★', '✦', '˖'],
  heart: ['💖', '💕', '❤️', '💗'],
  magic: ['✨', '🔮', '💫', '⭐', '🌙'],
};

const PAPER_COLORS = ['#f472b6', '#a78bfa', '#60a5fa', '#facc15', '#34d399', '#fb7185', '#ffffff'];

export function isCelebrationReduced(): boolean {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-motion')) return true;
  return false;
}

function ensureCelebrateStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
    @keyframes celebrate-pop {
      0% { transform: translate(-50%,-50%) translate3d(0,0,0) scale(.2) rotate(0deg); opacity: 0; }
      12% { opacity: 1; transform: translate(-50%,-50%) translate3d(calc(var(--bx) * .18), calc(var(--by) * .18), 0) scale(var(--ps,1.1)) rotate(calc(var(--br) * .15)); }
      70% { opacity: 1; }
      100% { transform: translate(-50%,-50%) translate3d(var(--bx), var(--by), 0) scale(.55) rotate(var(--br)); opacity: 0; }
    }
    @keyframes celebrate-drop {
      0% { transform: translate(-50%,-50%) translate3d(0,0,0) rotate(0deg) scale(.4); opacity: 0; }
      10% { opacity: 1; transform: translate(-50%,-50%) translate3d(calc(var(--bx) * .2), calc(var(--by) * .2), 0) rotate(calc(var(--br) * .2)) scale(1); }
      100% { transform: translate(-50%,-50%) translate3d(var(--bx), calc(var(--by) + 140px), 0) rotate(var(--br)) scale(.9); opacity: 0; }
    }
    @keyframes celebrate-twinkle {
      0% { transform: translate(-50%,-50%) scale(0) rotate(0deg); opacity: 0; }
      22% { opacity: 1; transform: translate(-50%,-50%) translate3d(calc(var(--bx) * .3), calc(var(--by) * .3), 0) scale(var(--ps,1.3)) rotate(calc(var(--br) * .3)); }
      100% { transform: translate(-50%,-50%) translate3d(var(--bx), var(--by), 0) scale(.15) rotate(var(--br)); opacity: 0; }
    }
    @keyframes celebrate-ring {
      0% { transform: translate(-50%,-50%) scale(.15); opacity: .7; }
      100% { transform: translate(-50%,-50%) scale(1); opacity: 0; }
    }
    @keyframes celebrate-core {
      0% { transform: translate(-50%,-50%) scale(.3); opacity: .9; }
      100% { transform: translate(-50%,-50%) scale(1.6); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .celebrate-particle, .celebrate-ring, .celebrate-core { animation: none !important; display: none !important; }
    }
    .reduce-motion .celebrate-particle, .reduce-motion .celebrate-ring, .reduce-motion .celebrate-core {
      animation: none !important; display: none !important;
    }
  `;
  document.head.appendChild(el);
}

/** Trigger a celebration burst from anywhere. No-op if no host or reduced motion. Returns burst id or -1. */
export function celebrate(opts: CelebrateOptions = {}): number {
  if (typeof window === 'undefined') return -1;
  if (isCelebrationReduced()) return -1;
  if (listeners.size === 0) return -1;
  const spec: BurstSpec = {
    id: (seq += 1),
    x: opts.x ?? window.innerWidth / 2,
    y: opts.y ?? window.innerHeight / 2,
    variant: opts.variant ?? 'petal',
    count: Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.round(opts.count ?? 18))),
    duration: Math.max(400, Math.min(3000, opts.duration ?? DEFAULT_DURATION)),
    spread: Math.max(0.4, Math.min(2.5, opts.spread ?? 1)),
    glyphs: opts.glyphs,
    colors: opts.colors,
    disableRing: opts.disableRing ?? false,
  };
  listeners.forEach((l) => l(spec));
  return spec.id;
}

/** Convenience: burst at explicit viewport coords. */
export function celebrateAt(x: number, y: number, opts: Omit<CelebrateOptions, 'x' | 'y'> = {}) {
  return celebrate({ ...opts, x, y });
}

/** Convenience: burst from an element's centre (e.g. clicked favourite button). */
export function celebrateFromElement(
  el: Element | null | undefined,
  opts: CelebrateOptions = {},
) {
  if (!el || typeof window === 'undefined') return celebrate(opts);
  const r = (el as HTMLElement).getBoundingClientRect?.();
  if (!r) return celebrate(opts);
  return celebrate({ ...opts, x: r.left + r.width / 2, y: r.top + r.height / 2 });
}

export function CelebrationHost() {
  const [bursts, setBursts] = useState<BurstSpec[]>([]);

  useEffect(() => {
    ensureCelebrateStyles();
    const add: Listener = (b) =>
      setBursts((prev) =>
        prev.length >= MAX_BURSTS ? [...prev.slice(-MAX_BURSTS + 1), b] : [...prev, b],
      );
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  const remove = useCallback((id: number) => {
    setBursts((prev) => (prev.length === 0 ? prev : prev.filter((b) => b.id !== id)));
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden" aria-hidden>
      {bursts.map((b) => (
        <BurstLayer key={b.id} spec={b} onDone={() => remove(b.id)} />
      ))}
    </div>,
    document.body,
  );
}

interface Particle {
  id: number;
  kind: 'glyph' | 'pill' | 'dot';
  glyph?: string;
  color?: string;
  bx: string;
  by: string;
  br: string;
  ps: number;
  size: number;
  delay: number;
  dur: number;
  anim: string;
  easing: string;
}

function BurstLayer({ spec, onDone }: { spec: BurstSpec; onDone: () => void }) {
  const prefersReduced = useReducedMotion();
  const reduce =
    !!prefersReduced ||
    (typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-motion'));

  const particles = useMemo<Particle[]>(() => {
    const glyphs = spec.glyphs?.length ? spec.glyphs : GLYPHS[spec.variant] ?? GLYPHS.petal;
    const colors = spec.colors?.length ? spec.colors : PAPER_COLORS;
    return Array.from({ length: spec.count }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / spec.count + Math.random() * 0.7;
      // Two-depth distribution: inner cluster + outer fliers for richness
      const outer = Math.random() > 0.55;
      const base = spec.variant === 'spark' ? 70 + Math.random() * 130 : 60 + Math.random() * 150;
      const dist = base * spec.spread * (outer ? 1.15 : 0.6) * (0.7 + Math.random() * 0.6);
      const bx = Math.cos(angle) * dist;
      // Upward bias so it reads as a "pop", confetti gets extra fall via keyframe
      const by = Math.sin(angle) * dist - (spec.variant === 'confetti' ? 20 : 55) * spec.spread;

      let kind: Particle['kind'] = 'glyph';
      if (spec.variant === 'confetti' && Math.random() > 0.38) kind = Math.random() > 0.5 ? 'pill' : 'dot';
      else if (spec.variant === 'magic' && Math.random() > 0.6) kind = 'dot';
      else if (spec.variant === 'spark' && Math.random() > 0.7) kind = 'dot';

      const isPetalLike = spec.variant === 'petal' || spec.variant === 'heart';
      return {
        id: i,
        kind,
        glyph: kind === 'glyph' ? glyphs[i % glyphs.length] : undefined,
        color: kind !== 'glyph' ? colors[i % colors.length] : undefined,
        bx: `${bx.toFixed(1)}px`,
        by: `${by.toFixed(1)}px`,
        br: `${((Math.random() * 2 - 1) * (isPetalLike ? 320 : 220)).toFixed(0)}deg`,
        ps: 0.9 + Math.random() * 0.6,
        size:
          kind === 'glyph'
            ? 13 + Math.random() * (spec.variant === 'spark' ? 13 : 17)
            : 6 + Math.random() * 8,
        delay: Math.random() * 70,
        dur: Math.round(
          spec.duration * (isPetalLike ? 0.95 + Math.random() * 0.35 : 0.8 + Math.random() * 0.4),
        ),
        anim:
          spec.variant === 'confetti'
            ? 'celebrate-drop'
            : spec.variant === 'spark' || spec.variant === 'magic'
              ? 'celebrate-twinkle'
              : 'celebrate-pop',
        easing:
          spec.variant === 'confetti'
            ? 'cubic-bezier(.15,.85,.45,1)'
            : 'cubic-bezier(.22,1,.36,1)',
      };
    });
  }, [spec]);

  useEffect(() => {
    const t = window.setTimeout(onDone, spec.duration + 180);
    return () => window.clearTimeout(t);
  }, [onDone, spec.duration]);

  if (reduce) return null;

  const ringSize = Math.max(90, spec.count * 5);

  return (
    <>
      {!spec.disableRing && (
        <>
          <span
            className="celebrate-core absolute rounded-full bg-white"
            style={
              {
                left: spec.x,
                top: spec.y,
                width: 26,
                height: 26,
                filter: 'blur(1px)',
                boxShadow: '0 0 24px 8px rgba(255,255,255,.85)',
                animation: `celebrate-core ${Math.round(spec.duration * 0.4)}ms ease-out forwards`,
              } as CSSProperties
            }
          />
          <span
            className="celebrate-ring absolute rounded-full border-2 border-white/80"
            style={
              {
                left: spec.x,
                top: spec.y,
                width: ringSize,
                height: ringSize,
                animation: `celebrate-ring ${Math.round(spec.duration * 0.55)}ms ease-out forwards`,
              } as CSSProperties
            }
          />
        </>
      )}
      {particles.map((p) =>
        p.kind === 'glyph' ? (
          <span
            key={p.id}
            className="celebrate-particle absolute select-none will-change-transform"
            style={
              {
                left: spec.x,
                top: spec.y,
                fontSize: p.size,
                lineHeight: 1,
                animation: `${p.anim} ${p.dur}ms ${p.easing} ${p.delay}ms forwards`,
                '--bx': p.bx,
                '--by': p.by,
                '--br': p.br,
                '--ps': p.ps,
              } as CSSProperties
            }
          >
            {p.glyph}
          </span>
        ) : p.kind === 'pill' ? (
          <span
            key={p.id}
            className="celebrate-particle absolute will-change-transform"
            style={
              {
                left: spec.x,
                top: spec.y,
                width: p.size * 0.62,
                height: p.size * 0.95,
                background: p.color,
                borderRadius: 2,
                animation: `${p.anim} ${p.dur}ms ${p.easing} ${p.delay}ms forwards`,
                '--bx': p.bx,
                '--by': p.by,
                '--br': p.br,
                '--ps': p.ps,
              } as CSSProperties
            }
          />
        ) : (
          <span
            key={p.id}
            className="celebrate-particle absolute will-change-transform"
            style={
              {
                left: spec.x,
                top: spec.y,
                width: p.size * 0.55,
                height: p.size * 0.55,
                background: p.color,
                borderRadius: 9999,
                boxShadow: `0 0 10px 2px ${p.color}`,
                animation: `${p.anim} ${p.dur}ms ${p.easing} ${p.delay}ms forwards`,
                '--bx': p.bx,
                '--by': p.by,
                '--br': p.br,
                '--ps': p.ps,
              } as CSSProperties
            }
          />
        ),
      )}
    </>
  );
}