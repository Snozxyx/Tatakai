/**
 * Global easter eggs, mounted once beside GlobalListeners in MainLayout.
 *
 * 1. Konami code (↑ ↑ ↓ ↓ ← → ← → B A) → 8-bit retro chime + 3D sakura petal shower.
 * 2. Secret words — tatakai / sugoi / senpai / nani / baka / kamehameha / barrelroll.
 * 3. Dynamic Tab-Away title — changes on tab blur and restores verbatim on focus.
 * 4. DevTools branded console banner.
 * 5. Full Reduced-Motion & IME/Modifier-key safety.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useReducedMotion } from 'framer-motion';
import { celebrate, type CelebrateVariant } from '@/components/effects/Celebrate';

// ==========================================
// CONFIGURATION & TYPES
// ==========================================

const KONAMI_CODE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a',
];

const SHOWER_DURATION_MS = 8500;



interface SecretWordConfig {
  toast: string;
  description?: string;
  variant: CelebrateVariant;
  count?: number;
  sound?: 'pop' | 'sparkle' | 'rumble';
}

const SECRET_WORDS: Record<string, SecretWordConfig> = {
  tatakai: {
    toast: '🌸 Tatakai! Fight on.',
    description: 'Dedicate your heart to the battle.',
    variant: 'petal',
    count: 24,
    sound: 'sparkle',
  },
  sugoi: {
    toast: '✨ Sugoi! You spotted it.',
    description: 'Your awareness stat is maxed out.',
    variant: 'spark',
    count: 28,
    sound: 'pop',
  },
  senpai: {
    toast: '👀 Senpai noticed you!',
    description: 'Keep doing what you are doing.',
    variant: 'confetti',
    count: 32,
    sound: 'pop',
  },
  nani: {
    toast: '💥 NANI?!',
    description: 'Omae wa mou shindeiru.',
    variant: 'spark',
    count: 35,
    sound: 'sparkle',
  },
  baka: {
    toast: "😤 B-baka! It's not like I animated this for you...",
    variant: 'petal',
    count: 20,
    sound: 'pop',
  },
};

// ==========================================
// LIGHTWEIGHT SYNTHESIZED SOUND EFFECTS
// ==========================================
class SoundFX {
  private static ctx: AudioContext | null = null;

  private static getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx && (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  static playChime() {
    const ctx = this.getContext();
    if (!ctx) return;
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99]; // C-E-G-C-E-G arpeggio
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.08 + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.08);
      osc.stop(ctx.currentTime + idx * 0.08 + 0.45);
    });
  }

  static playBoom() {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.6);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.7);
  }

  static playPop() {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }
}

// ==========================================
// CSS INJECTOR (Guarantees self-contained fx)
// ==========================================
const STYLE_ID = 'tatakai-easter-egg-styles';

function ensureGlobalStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes egg-barrel-roll {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .egg-barrel-roll-active {
      animation: egg-barrel-roll 1.1s cubic-bezier(0.65, 0, 0.35, 1) both;
      transform-origin: center center;
    }
    @keyframes egg-screen-shake {
      0%, 100% { transform: translate3d(0, 0, 0); }
      15% { transform: translate3d(-8px, 4px, 0) scale(1.01); }
      30% { transform: translate3d(8px, -6px, 0) scale(1.02); }
      45% { transform: translate3d(-6px, 6px, 0); }
      60% { transform: translate3d(6px, -3px, 0); }
      75% { transform: translate3d(-3px, 2px, 0); }
    }
    .egg-shake-active {
      animation: egg-screen-shake 0.65s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
      transform-origin: center center;
    }
    .egg-kamehameha-flash {
      position: fixed;
      inset: 0;
      z-index: 99999;
      pointer-events: none;
      background: radial-gradient(circle at center, rgba(147, 197, 253, 0.9) 0%, rgba(59, 130, 246, 0.7) 40%, rgba(37, 99, 235, 0) 80%);
      mix-blend-mode: screen;
      opacity: 0;
      animation: egg-flash-fade 0.75s ease-out forwards;
    }
    @keyframes egg-flash-fade {
      0% { opacity: 0; transform: scale(0.6); }
      20% { opacity: 1; transform: scale(1.1); }
      100% { opacity: 0; transform: scale(1.5); }
    }
    @keyframes petal-3d-fall {
      0% {
        transform: translate3d(var(--drift-start, 0px), -10vh, 0) rotateX(0deg) rotateY(0deg) rotateZ(0deg);
        opacity: 0;
      }
      15% { opacity: var(--petal-max-opacity, 0.9); }
      90% { opacity: var(--petal-max-opacity, 0.9); }
      100% {
        transform: translate3d(var(--drift-end, 100px), 105vh, 0) rotateX(var(--rot-x, 720deg)) rotateY(var(--rot-y, 360deg)) rotateZ(var(--rot-z, 540deg));
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

// ==========================================
// CORE EASTER EGGS COMPONENT
// ==========================================

export function EasterEggs() {
  const [showPetals, setShowPetals] = useState(false);
  const konamiIndex = useRef(0);
  const letterBuffer = useRef('');
  const showerTimeoutRef = useRef<number | null>(null);
  const animTimeouts = useRef<number[]>([]);

  const prefersReduced = useCallback(() => {
    return (
      (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ||
      (typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-motion'))
    );
  }, []);

  // Safe timeout helper that tracks IDs for clean unmounting
  const safeTimeout = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      animTimeouts.current = animTimeouts.current.filter((t) => t !== id);
      fn();
    }, ms);
    animTimeouts.current.push(id);
    return id;
  }, []);

  // Ensure scoped styles exist on mount
  useEffect(() => {
    ensureGlobalStyles();
    return () => {
      animTimeouts.current.forEach((t) => window.clearTimeout(t));
      if (showerTimeoutRef.current) window.clearTimeout(showerTimeoutRef.current);
    };
  }, []);

  // 1. "do a barrel roll"
  const triggerBarrelRoll = useCallback(() => {
    if (prefersReduced()) return;
    const body = document.body;
    const html = document.documentElement;
    if (body.classList.contains('egg-barrel-roll-active')) return;

    const prevOverflow = html.style.overflow;
    html.style.overflow = 'hidden';
    body.classList.add('egg-barrel-roll-active');

    safeTimeout(() => {
      body.classList.remove('egg-barrel-roll-active');
      html.style.overflow = prevOverflow;
    }, 1150);
  }, [prefersReduced, safeTimeout]);

  // 2. "kamehameha"
  const triggerKamehameha = useCallback(() => {
    SoundFX.playBoom();
    celebrate({ variant: 'spark', count: 45 });
    toast('🔵 Ka…me…ha…me…HA!', { duration: 3000 });

    if (prefersReduced()) return;

    const root = document.getElementById('root') ?? document.body;
    if (root.classList.contains('egg-shake-active')) return;

    const flash = document.createElement('div');
    flash.className = 'egg-kamehameha-flash';
    flash.setAttribute('aria-hidden', 'true');
    document.body.appendChild(flash);

    root.classList.add('egg-shake-active');

    safeTimeout(() => root.classList.remove('egg-shake-active'), 650);
    safeTimeout(() => flash.remove(), 780);
  }, [prefersReduced, safeTimeout]);

  
  // 4. Keyboard Listener for Konami & Secret Words
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't fire if typing in form inputs, using modifiers, or using IME composition
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) {
        konamiIndex.current = 0;
        letterBuffer.current = '';
        return;
      }

      const key = e.key;
      const lowerChar = key.length === 1 ? key.toLowerCase() : '';

      // --- Match Secret Words ---
      if (/^[a-z]$/.test(lowerChar)) {
        letterBuffer.current = (letterBuffer.current + lowerChar).slice(-16);
        const buf = letterBuffer.current;

        if (buf.endsWith('barrelroll')) {
          letterBuffer.current = '';
          triggerBarrelRoll();
          SoundFX.playPop();
          toast('🎢 Do a barrel roll!', { duration: 2500 });
          return;
        }

        if (buf.endsWith('kamehameha')) {
          letterBuffer.current = '';
          triggerKamehameha();
          return;
        }

        for (const [word, cfg] of Object.entries(SECRET_WORDS)) {
          if (buf.endsWith(word)) {
            letterBuffer.current = '';
            if (cfg.sound === 'pop') SoundFX.playPop();
            if (cfg.sound === 'sparkle') SoundFX.playChime();
            celebrate({ variant: cfg.variant, count: cfg.count ?? 25 });
            toast(cfg.toast, { description: cfg.description, duration: 3200 });
            break;
          }
        }
      }

      // --- Match Konami Code ---
      if (key === KONAMI_CODE[konamiIndex.current]) {
        konamiIndex.current += 1;
        if (konamiIndex.current === KONAMI_CODE.length) {
          konamiIndex.current = 0;
          SoundFX.playChime();
          toast('⚡ Power level: OVER 9000!', {
            description: 'You unlocked the secret sakura blossom festival.',
            duration: 4500,
          });

          setShowPetals(true);
          if (showerTimeoutRef.current) window.clearTimeout(showerTimeoutRef.current);
          showerTimeoutRef.current = window.setTimeout(() => setShowPetals(false), SHOWER_DURATION_MS);
        }
      } else {
        konamiIndex.current = key === KONAMI_CODE[0] ? 1 : 0;
      }
    };

    window.addEventListener('keydown', onKeyDown, { passive: true });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [triggerBarrelRoll, triggerKamehameha]);

  // 5. Console Greeting
  useEffect(() => {
    const banner = 'font-size:26px;font-weight:900;color:#f43f5e;text-shadow:0 2px 10px rgba(244,63,94,0.4);';
    const subtitle = 'font-size:12px;color:#a855f7;font-weight:600;';
    const tip = 'font-size:11px;color:#94a3b8;font-style:italic;';
    console.log('%c🌸 TATAKAI', banner);
    console.log('%cWelcome, challenger. The console holds deep secrets.', subtitle);
    console.log('%cHint: ↑ ↑ ↓ ↓ ← → ← → B A', tip);
  }, []);

  return <>{showPetals && <PetalShower onComplete={() => setShowPetals(false)} />}</>;
}

// ==========================================
// CINEMATIC 3D SAKURA PETAL SHOWER
// ==========================================

interface PetalItem {
  id: number;
  left: number;
  size: number;
  duration: number;
  delay: number;
  driftStart: string;
  driftEnd: string;
  rotX: string;
  rotY: string;
  rotZ: string;
  opacity: number;
  blur: number;
  glyph: string;
}

function PetalShower({ onComplete }: { onComplete: () => void }) {
  const reduce = useReducedMotion();

  const petals: PetalItem[] = useMemo(() => {
    const glyphs = ['🌸', '❀', '💮', '🌸', '✨'];
    return Array.from({ length: 48 }).map((_, i) => {
      const isForeground = Math.random() > 0.4;
      return {
        id: i,
        left: Math.random() * 100,
        size: isForeground ? 16 + Math.random() * 16 : 10 + Math.random() * 8,
        duration: 4.8 + Math.random() * 3.2,
        delay: Math.random() * 2,
        driftStart: `${(Math.random() * 2 - 1) * 60}px`,
        driftEnd: `${(Math.random() * 2 - 1) * 220}px`,
        rotX: `${Math.random() * 1080 - 540}deg`,
        rotY: `${Math.random() * 1080 - 540}deg`,
        rotZ: `${Math.random() * 720 - 360}deg`,
        opacity: isForeground ? 0.75 + Math.random() * 0.25 : 0.4 + Math.random() * 0.3,
        blur: isForeground ? 0 : Math.random() * 1.5,
        glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
      };
    });
  }, []);

  useEffect(() => {
    if (reduce) onComplete();
  }, [reduce, onComplete]);

  if (reduce || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden select-none"
      aria-hidden="true"
      style={{ perspective: '1000px' }}
    >
      {petals.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 will-change-transform"
          style={{
            left: `${p.left}%`,
            fontSize: `${p.size}px`,
            lineHeight: 1,
            filter: p.blur > 0 ? `blur(${p.blur}px)` : undefined,
            animation: `petal-3d-fall ${p.duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${p.delay}s 1 forwards`,
            ['--drift-start' as string]: p.driftStart,
            ['--drift-end' as string]: p.driftEnd,
            ['--rot-x' as string]: p.rotX,
            ['--rot-y' as string]: p.rotY,
            ['--rot-z' as string]: p.rotZ,
            ['--petal-max-opacity' as string]: p.opacity,
          }}
        >
          {p.glyph}
        </span>
      ))}
    </div>,
    document.body,
  );
}