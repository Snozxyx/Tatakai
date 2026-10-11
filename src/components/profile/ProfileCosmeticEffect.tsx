import type { ReactNode } from 'react';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import { PROFILE_NAMEPLATES, type ProfileNameplateKey, type ProfileCosmeticEffectKey } from '@/lib/profileCosmetics';

export function ProfileNameplate({ nameplate, children }: { nameplate: ProfileNameplateKey; children: ReactNode }) {
  const design = PROFILE_NAMEPLATES.find(item => item.key === nameplate);
  if (!design || nameplate === 'none') return <>{children}</>;
  return (
    <span data-profile-nameplate={nameplate} className="relative inline-flex max-w-full items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: `linear-gradient(110deg, ${design.colors[0]}, ${design.colors[1]})`, color: design.accent, boxShadow: `inset 0 0 0 1px ${design.accent}33` }}>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="currentColor"><path d="M8 0 10 6 16 8 10 10 8 16 6 10 0 8 6 6Z" /></svg>
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

const EFFECT_COLORS = { constellation: '#c5ddff', blossom: '#ffc1dd', spirit: '#f4ca8a', hologram: '#b7eee6' };

/** An authored entrance at the perimeter; it settles so the portrait and copy stay clear. */
export function ProfileCosmeticEffect({ effect, animated = true }: { effect: ProfileCosmeticEffectKey; animated?: boolean }) {
  const reduced = useMotionPreference();
  if (effect === 'none') return null;
  const color = EFFECT_COLORS[effect];
  return (
    <div data-profile-cosmetic={effect} aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[inherit]">
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 0% 0%, ${color}14, transparent 32%), radial-gradient(ellipse at 100% 100%, ${color}12, transparent 32%)`, boxShadow: `inset 0 0 0 1px ${color}24` }} />
      {Array.from({length:8},(_,i)=>{
        const side = i%2===0;
        return <svg key={i} viewBox="0 0 24 24" className="absolute h-5 w-5" style={{ left:side?`${2+i%3}%`:undefined, right:!side?`${2+i%3}%`:undefined, top:`${8+i*11}%`, color, opacity:0.65, animation: animated && !reduced ? `profile-cosmetic-arrive 2.4s cubic-bezier(0.23, 1, 0.32, 1) ${i*0.08}s both` : undefined }}>
          {effect === 'constellation' && <path fill="currentColor" d="M12 1 14 9 22 12 14 14 12 22 9 14 1 12 9 9Z" />}
          {effect === 'blossom' && <g fill="currentColor">{[0,72,144,216,288].map(rotation=><ellipse key={rotation} cx="12" cy="7" rx="3.5" ry="6" transform={`rotate(${rotation} 12 12)`} />)}<circle cx="12" cy="12" r="2" fill="#fff2d7" /></g>}
          {effect === 'spirit' && <path fill="currentColor" d="M12 1Q22 11 18 18Q12 24 6 18Q2 12 9 7Q7 16 12 18Q17 16 12 1Z" />}
          {effect === 'hologram' && <g stroke="currentColor" fill="none"><path d="M12 1 22 12 12 23 2 12Z M12 1V23 M2 12H22" /><path d="M12 6 17 12 12 18 7 12Z" /></g>}
        </svg>;
      })}
    </div>
  );
}
