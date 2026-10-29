import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import { EMPRESS_POSTER } from './config';
import type { ThemeLoadingProps } from '../types';
import './empress.css';
import './empress-cinematic.css';
export function EmpressLoading({ owner }: ThemeLoadingProps) {
  const reducedMotion=useMotionPreference();
  return <div className="ge-arrival" role="status" aria-busy="true" data-motion={!reducedMotion} aria-live="polite" style={{ backgroundImage: `linear-gradient(#09090de6,#09090df2),url(${EMPRESS_POSTER})` }}><span>✦</span><p>{owner?.username ? `@${owner.username}` : 'TATAKAI'}</p><h2>{owner?.display_name || owner?.username ? `Loading ${owner.display_name || owner.username}'s profile` : 'Loading profile'}</h2><small>Opening the archives…</small></div>;
}

