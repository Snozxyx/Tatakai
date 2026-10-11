import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import type { BackgroundEffectKey } from '@/lib/profileSettings';

interface ProfileBackgroundEffectsProps {
  effect: BackgroundEffectKey;
  /** Contain the same scene inside a profile widget, with fewer particles. */
  variant?: 'page' | 'widget';
}

type EffectStyle = CSSProperties & { [key: `--${string}`]: string | number };
type ParticleKind = 'sakura' | 'rain' | 'stars' | 'fireflies' | 'snow' | 'embers';
interface LayerProps { reduce: boolean; compact: boolean; }

/** Above ambient artwork, below content. The host owns its isolated stacking context. */
export function ProfileBackgroundEffects({ effect, variant = 'page' }: ProfileBackgroundEffectsProps) {
  const reduce = useMotionPreference();
  const isMobile = useIsMobile();
  const compact = variant === 'widget';
  const [paused, setPaused] = useState(document.hidden);
  useEffect(() => {
    const sync = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  return (
    <AnimatePresence initial={false}>
      {effect !== 'none' && (
        <motion.div
          key={effect}
          className={`profile-effect ${compact ? 'absolute' : 'fixed'} inset-0 z-0 pointer-events-none overflow-hidden`}
          style={{ containerType: 'size' }}
          aria-hidden="true"
          data-profile-effect={effect}
          data-paused={paused || reduce}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.15 : 0.25, ease: [0.23, 1, 0.32, 1] }}
        >
          {(['sakura', 'rain', 'stars', 'fireflies', 'snow', 'embers'] as BackgroundEffectKey[]).includes(effect) && (
            <ParticleLayer kind={effect as ParticleKind} reduce={reduce} compact={compact || isMobile} widget={compact} />
          )}
          {effect === 'blackhole' && <BlackholeLayer reduce={reduce} compact={compact || isMobile} />}
          {effect === 'pitch' && <div className="absolute inset-0 bg-black" />}
          {effect === 'sky' && <SkyLayer reduce={reduce} compact={compact} />}
          {effect === 'aurora' && <AuroraLayer reduce={reduce} compact={compact} />}
          {effect === 'moonlit' && <MoonlitLayer reduce={reduce} compact={compact} />}
          {effect === 'prism' && <PrismLayer reduce={reduce} compact={compact} />}
          {effect === 'ocean' && <OceanLayer reduce={reduce} compact={compact} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const PARTICLE_SCENES = {
  sakura: { count: 28, smallCount: 12, duration: 16, animation: 'petal-fall', background: 'radial-gradient(ellipse at 15% 10%, rgb(244 114 182 / 0.14), transparent 65%), linear-gradient(180deg, rgb(190 24 93 / 0.04), transparent)' },
  rain: { count: 64, smallCount: 24, duration: 1.2, animation: 'rain-fall', background: 'linear-gradient(160deg, rgb(71 85 105 / 0.22), rgb(15 23 42 / 0.12) 60%, rgb(56 189 248 / 0.08))' },
  stars: { count: 54, smallCount: 22, duration: 6, animation: 'profile-star-twinkle', background: 'radial-gradient(ellipse at 70% 25%, hsl(var(--profile-accent) / 0.18), transparent 65%), linear-gradient(160deg, #0b1024, #10112b 55%, #050916)' },
  fireflies: { count: 26, smallCount: 12, duration: 12, animation: 'profile-firefly-float', background: 'radial-gradient(ellipse at 20% 80%, rgb(52 211 153 / 0.12), transparent 65%), linear-gradient(160deg, rgb(6 35 27 / 0.85), rgb(7 18 21 / 0.9))' },
  snow: { count: 42, smallCount: 18, duration: 20, animation: 'profile-snow-fall', background: 'radial-gradient(ellipse at 50% 0%, rgb(186 230 253 / 0.16), transparent 70%), linear-gradient(180deg, rgb(51 65 85 / 0.12), transparent)' },
  embers: { count: 34, smallCount: 14, duration: 18, animation: 'profile-ember-rise', background: 'radial-gradient(ellipse at 50% 100%, rgb(180 83 9 / 0.25), transparent 65%), linear-gradient(160deg, #160c14, #0c0a12 55%, #22120f)' },
} satisfies Record<ParticleKind, { count: number; smallCount: number; duration: number; animation: string; background: string }>;

function ParticleLayer({ kind, reduce, compact, widget }: LayerProps & { kind: ParticleKind; widget: boolean }) {
  const scene = PARTICLE_SCENES[kind];
  const count = widget ? Math.ceil(scene.smallCount * 0.65) : compact ? scene.smallCount : scene.count;
  // Stable distribution keeps particles from jumping when settings or viewport change.
  const particles = useMemo(() => Array.from({ length: count }, (_, i) => {
    const random = (salt: number) => {
      const value = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453;
      return value - Math.floor(value);
    };
    return { left: random(1) * 100, top: random(2) * 100, size: random(3), duration: scene.duration * (0.7 + random(4) * 0.6), phase: random(5), drift: (random(6) * 2 - 1) * (widget ? 25 : 100), opacity: 0.3 + random(7) * 0.5 };
  }), [count, scene.duration, widget]);
  const falling = kind === 'sakura' || kind === 'rain' || kind === 'snow' || kind === 'embers';
  return (
    <>
      <div className="absolute inset-0" style={{ background: scene.background }} />
      {(!reduce || !falling) && particles.map((p, i) => {
        const size = kind === 'rain' ? 1 : kind === 'sakura' ? (widget ? 4 : 7) + p.size * 7 : 1.5 + p.size * (kind === 'snow' ? 4 : 2.5);
        const style: EffectStyle = {
          left: `${p.left}%`, top: falling ? 0 : `${p.top}%`, width: size,
          height: kind === 'rain' ? (widget ? 15 : 35) + p.size * (widget ? 20 : 65) : kind === 'sakura' ? size * 0.65 : size,
          opacity: p.opacity,
          background: kind === 'rain' ? 'linear-gradient(transparent, rgb(186 230 253 / 0.6), transparent)' : kind === 'embers' ? '#fdba74' : kind === 'fireflies' ? '#fde68a' : kind === 'sakura' ? '#fbcfe8' : '#e0f2fe',
          borderRadius: kind === 'sakura' ? '100% 0 100% 0' : '50%',
          boxShadow: kind === 'embers' ? '0 0 7px rgb(251 146 60 / 0.6)' : kind === 'fireflies' ? '0 0 8px 2px rgb(253 230 138 / 0.35)' : kind === 'stars' ? '0 0 5px rgb(224 242 254 / 0.45)' : undefined,
          animation: reduce ? undefined : `${scene.animation} ${p.duration}s ${falling ? 'linear' : 'ease-in-out'} ${-p.phase * p.duration}s infinite`,
          '--petal-drift': `${p.drift}px`, '--petal-spin': `${i % 2 ? -280 : 280}deg`,
          '--particle-drift': `${p.drift}px`, '--particle-opacity': p.opacity,
        };
        return <span key={i} className="absolute" style={style} />;
      })}
    </>
  );
}

function BlackholeLayer({ reduce, compact }: LayerProps) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 43%, #030108 5%, #0c0719 30%, hsl(var(--profile-accent) / 0.12) 65%, #070910)' }} />
      {/* Centering and rotation live on separate elements so they cannot overwrite each other. */}
      <div className="absolute left-1/2 top-[43%] h-[52%] w-[85%] -translate-x-1/2 -translate-y-1/2">
        <div className="absolute inset-0 rounded-[50%]" style={{ background: 'conic-gradient(from 40deg, transparent, hsl(var(--profile-accent) / 0.7), rgb(251 146 60 / 0.35), transparent 50%, hsl(var(--profile-accent) / 0.5), transparent)', filter: `blur(${compact ? 8 : 18}px)`, animation: reduce ? undefined : 'profile-blackhole-spin 32s linear infinite' }} />
        <div className="absolute inset-[12%] rounded-[50%]" style={{ background: 'radial-gradient(ellipse, #020106 40%, #07040d 60%, transparent 72%)' }} />
        <div className="absolute inset-[18%] rounded-[50%] border border-white/10" style={{ boxShadow: '0 0 24px hsl(var(--profile-accent) / 0.35), inset 0 0 12px hsl(var(--profile-accent) / 0.25)' }} />
      </div>
    </>
  );
}

function SkyLayer({ reduce, compact }: LayerProps) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(155deg, #101d36, #252044 40%, #15344a 75%, #0c1427)' }} />
      {[0, 1].map(i => (
        <div key={i} className="absolute -inset-[20%]" style={{
          background: i === 0 ? 'radial-gradient(ellipse at 25% 35%, hsl(var(--profile-accent) / 0.28), transparent 45%)' : 'radial-gradient(ellipse at 75% 60%, rgb(125 211 252 / 0.2), transparent 40%)',
          animation: reduce ? undefined : `profile-cloud-drift ${compact ? 24 : 36}s ease-in-out ${i * -12}s infinite`,
        }} />
      ))}
    </>
  );
}

function AuroraLayer({ reduce, compact }: LayerProps) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #06141e, #081b23 55%, #0a101d)' }} />
      {[0, 1, 2].slice(0, compact ? 2 : 3).map(i => (
        <div key={i} className="absolute -left-[25%] top-[8%] h-[65%] w-[150%] rounded-[50%]" style={{
          background: `linear-gradient(${110 + i * 25}deg, transparent 20%, ${i === 0 ? 'rgb(52 211 153 / 0.3)' : i === 1 ? 'hsl(var(--profile-accent) / 0.3)' : 'rgb(56 189 248 / 0.22)'} 45%, transparent 65%)`,
          filter: `blur(${compact ? 12 : 28}px)`, transform: `rotate(${-15 + i * 12}deg)`,
          animation: reduce ? undefined : `profile-aurora-sway ${24 + i * 8}s ease-in-out ${-i * 7}s infinite`,
        }} />
      ))}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 35%, rgb(4 12 22 / 0.6))' }} />
    </>
  );
}

function MoonlitLayer({ reduce, compact }: LayerProps) {
  return (
    <>
      <ParticleLayer kind="stars" reduce={reduce} compact={compact} widget={compact} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 78% 18%, rgb(147 197 253 / 0.18), transparent 50%)' }} />
      <div className="absolute right-[12%] top-[12%] aspect-square w-[15%] max-w-40 rounded-full" style={{ background: 'radial-gradient(circle at 35% 30%, #f4f1e9, #cad8ec 55%, #859bbc)', boxShadow: '0 0 60px rgb(186 230 253 / 0.2), 0 0 120px rgb(147 197 253 / 0.08)' }}>
        <div className="absolute left-[22%] top-[35%] h-[18%] w-[18%] rounded-full bg-slate-400/20" />
        <div className="absolute bottom-[18%] right-[25%] h-[26%] w-[26%] rounded-full bg-slate-400/15" />
      </div>
      <div className="absolute -inset-[20%]" style={{ background: 'radial-gradient(ellipse at 75% 40%, rgb(226 232 240 / 0.1), transparent 40%)', animation: reduce ? undefined : 'profile-cloud-drift 40s ease-in-out infinite' }} />
    </>
  );
}

function PrismLayer({ reduce, compact }: LayerProps) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(150deg, #101322, #191527 50%, #0b1620)' }} />
      {['rgb(196 181 253 / 0.2)', 'rgb(153 246 228 / 0.16)', 'rgb(251 207 232 / 0.16)'].map((color,i) => (
        <div key={color} className="absolute -top-[35%] h-[170%] w-[45%]" style={{ left: `${i*30-15}%`, background: `linear-gradient(90deg, transparent, ${color} 45%, transparent)`, transform: 'rotate(28deg)', filter: `blur(${compact ? 12 : 30}px)`, animation: reduce ? undefined : `profile-prism-sway ${32+i*8}s ease-in-out ${-i*11}s infinite` }} />
      ))}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgb(255 255 255 / 0.06), transparent 70%)' }} />
    </>
  );
}

function OceanLayer({ reduce, compact }: LayerProps) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #12303d, #09222f 45%, #040f1d)' }} />
      {[0,1,2].slice(0,compact ? 2 : 3).map(i => (
        <div key={i} className="absolute -left-[30%] h-[65%] w-[160%] rounded-[50%]" style={{ top: `${12+i*18}%`, borderTop: '1px solid rgb(153 246 228 / 0.12)', background: `radial-gradient(ellipse at 50% 0%, rgb(153 246 228 / ${0.1-i*0.02}), transparent 55%)`, transform: `rotate(${-8+i*6}deg)`, animation: reduce ? undefined : `profile-ocean-tide ${26+i*8}s ease-in-out ${-i*9}s infinite` }} />
      ))}
      <div className="absolute inset-0" style={{ background: 'conic-gradient(from 150deg at 45% -10%, transparent 0deg, rgb(207 250 254 / 0.04) 12deg, transparent 25deg, rgb(207 250 254 / 0.07) 35deg, transparent 52deg)' }} />
    </>
  );
}
