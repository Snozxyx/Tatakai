import { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import type { BackgroundEffectKey } from '@/lib/profileSettings';

/**
 * Animated background layer for the profile page, driven by the viewed profile's
 * `backgroundEffect` setting (so it renders for own AND other viewers). Sits at
 * `fixed inset-0 -z-10` behind the page content, alongside the existing
 * banner-blur ambient layer.
 *
 * Perf: heavy layers are desktop-gated and particle counts are capped on mobile;
 * `useReducedMotion` collapses every mode to a static gradient. Animations use
 * transform/opacity only.
 */

interface ProfileBackgroundEffectsProps {
  effect: BackgroundEffectKey;
}

const ROOT_CLASS = 'fixed inset-0 -z-10 pointer-events-none overflow-hidden';

export function ProfileBackgroundEffects({ effect }: ProfileBackgroundEffectsProps) {
  const reduce = useReducedMotion();
  const isMobile = useIsMobile();

  if (effect === 'none') return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={effect}
        className={ROOT_CLASS}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {effect === 'sakura' && <SakuraLayer reduce={!!reduce} isMobile={isMobile} />}
        {effect === 'rain' && <RainLayer reduce={!!reduce} isMobile={isMobile} />}
        {effect === 'blackhole' && <BlackholeLayer reduce={!!reduce} />}
        {effect === 'pitch' && <PitchLayer />}
        {effect === 'sky' && <SkyLayer reduce={!!reduce} />}
      </motion.div>
    </AnimatePresence>
  );
}

interface LayerProps {
  reduce: boolean;
  isMobile?: boolean;
}

// ── Sakura petals ─────────────────────────────────────────────────────────────
function SakuraLayer({ reduce, isMobile }: LayerProps) {
  const count = isMobile ? 12 : 24;
  const petals = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => {
        const size = 8 + Math.random() * 10;
        return {
          id: i,
          left: Math.random() * 100,
          size,
          duration: 8 + Math.random() * 10,
          delay: Math.random() * 12,
          drift: `${(Math.random() * 2 - 1) * 120}px`,
          spin: `${Math.random() > 0.5 ? 360 : -360}deg`,
          opacity: 0.4 + Math.random() * 0.5,
        };
      }),
    [count],
  );

  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-pink-500/[0.04] via-transparent to-transparent" />
      {!reduce &&
        petals.map((p) => (
          <span
            key={p.id}
            className="absolute top-0 rounded-full bg-pink-200/70 shadow-[0_0_6px_rgba(251,207,232,0.4)]"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.7,
              opacity: p.opacity,
              borderRadius: '100% 0 100% 0',
              animation: `petal-fall ${p.duration}s linear ${p.delay}s infinite`,
              ['--petal-drift' as any]: p.drift,
              ['--petal-spin' as any]: p.spin,
              willChange: 'transform',
            }}
          />
        ))}
    </>
  );
}

// ── Rain ──────────────────────────────────────────────────────────────────────
function RainLayer({ reduce, isMobile }: LayerProps) {
  const count = isMobile ? 30 : 60;
  const drops = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        height: 40 + Math.random() * 60,
        duration: 0.6 + Math.random() * 0.8,
        delay: Math.random() * 3,
        opacity: 0.15 + Math.random() * 0.35,
      })),
    [count],
  );

  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-slate-500/[0.06] via-transparent to-slate-900/[0.08]" />
      {!reduce &&
        drops.map((d) => (
          <span
            key={d.id}
            className="absolute top-0 w-px bg-gradient-to-b from-transparent via-sky-200/60 to-transparent"
            style={{
              left: `${d.left}%`,
              height: d.height,
              opacity: d.opacity,
              animation: `rain-fall ${d.duration}s linear ${d.delay}s infinite`,
              willChange: 'transform',
            }}
          />
        ))}
    </>
  );
}

// ── Blackhole ───────────────────────────────────────────────────────────────
function BlackholeLayer({ reduce }: LayerProps) {
  return (
    <>
      {/* Deep radial core */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 45%, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.75) 30%, hsl(var(--background)) 70%)',
        }}
      />
      {/* Rotating accretion ring — desktop only */}
      {!reduce && (
        <div
          className="absolute left-1/2 top-[45%] hidden h-[90vw] w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-2xl md:block"
          style={{
            background:
              'conic-gradient(from 0deg, transparent, hsl(var(--profile-accent) / 0.5), transparent 40%, hsl(var(--profile-accent) / 0.3), transparent 80%)',
            animation: 'profile-blackhole-spin 24s linear infinite',
            willChange: 'transform',
          }}
        />
      )}
      {/* Inner glow orbs drifting inward */}
      {!reduce && (
        <>
          <motion.div
            className="absolute left-1/2 top-[45%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            style={{ background: 'hsl(var(--profile-accent) / 0.35)' }}
            animate={{ scale: [1, 0.4, 1], opacity: [0.5, 0.2, 0.5] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
        </>
      )}
    </>
  );
}

// ── Dark pitch ────────────────────────────────────────────────────────────────
function PitchLayer() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(ellipse 80% 80% at 50% 40%, rgba(0,0,0,0.6) 0%, #000 60%, #000 100%)',
      }}
    />
  );
}

// ── Sky ─────────────────────────────────────────────────────────────────────
function SkyLayer({ reduce }: LayerProps) {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, hsl(217 60% 12%) 0%, hsl(262 45% 16%) 35%, hsl(199 55% 14%) 70%, hsl(240 30% 8%) 100%)',
          backgroundSize: '300% 300%',
          animation: reduce ? undefined : 'profile-sky-drift 30s ease-in-out infinite',
        }}
      />
      {/* Accent-tinted parallax glow orbs */}
      {!reduce && (
        <>
          <motion.div
            className="absolute left-[10%] top-[20%] h-64 w-64 rounded-full blur-3xl"
            style={{ background: 'hsl(var(--profile-accent) / 0.18)' }}
            animate={{ x: [0, 40, 0], y: [0, 20, 0] }}
            transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute right-[8%] top-[50%] h-72 w-72 rounded-full bg-sky-400/10 blur-3xl"
            animate={{ x: [0, -50, 0], y: [0, -25, 0] }}
            transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          />
        </>
      )}
    </>
  );
}
