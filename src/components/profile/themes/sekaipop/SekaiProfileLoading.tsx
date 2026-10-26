import type { CSSProperties } from 'react';
import { Diamond, Sparkles, Star } from 'lucide-react';
import { CachedProfileImage } from '@/components/ui/cached-profile-image';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import { defaultSekaiConfig, readSekaiConfig, sekaiMascotUrl } from '@/lib/profileThemes';
import type { ThemeLoadingProps } from '../types';
import './sekaipop-loading.css';

export function SakuraArrival({ still = false }: { still?: boolean }) {
  return <div className={`sp-sakura-arrival ${still ? 'sp-sakura-still' : ''}`} aria-hidden="true">{[12, 28, 43, 58, 72, 88].map((left, i) => <span key={left} style={{ left: `${left}%`, '--petal-delay': `${i * 85}ms`, '--petal-angle': `${i * 43 - 65}deg` } as CSSProperties}><svg viewBox="0 0 32 36" fill="currentColor"><path d="M16 34C6 28 0 17 3 8 5 2 11 0 16 6 21 0 27 2 29 8 32 17 26 28 16 34Z" /></svg></span>)}</div>;
}

export function SekaiProfileLoading({ configuration, owner }: ThemeLoadingProps) {
  const reducedMotion = useMotionPreference();
  const config = readSekaiConfig(configuration) ?? defaultSekaiConfig();
  const dark = config.mode !== 'light';
  const style = { '--sl-ink': dark ? '#f0e9fa' : config.colors.ink, '--sl-outline': config.colors.ink,
    '--sl-a': config.colors.primary, '--sl-b': config.colors.secondary,
    '--sl-paper': dark ? '#30243d' : config.colors.paper, '--sl-board': dark ? '#201828' : '#f1e7f6',
    '--sl-ring': dark ? '#736080' : '#fffdf5' } as CSSProperties;
  return <div className="sp-profile-loading" style={style} data-motion={config.motion && !reducedMotion} role="status" aria-live="polite" aria-busy="true">
    <SakuraArrival still={!config.motion || reducedMotion} />
    <div className="sp-isekai-scene">
      <div className="sp-isekai-orbit" aria-hidden="true"><Star /><Diamond /><Sparkles /></div>
      <div className="sp-isekai-gate">
        <div className="sp-isekai-destination"><span className="sp-isekai-portrait">{owner?.avatar_url ? <CachedProfileImage src={owner.avatar_url} alt="" /> : (owner?.display_name || owner?.username || 'T').slice(0,1)}</span><strong>{owner?.display_name || owner?.username || 'A little world'}</strong><span>SEKAI · TATAKAI</span></div>
        <div className="sp-isekai-door sp-isekai-door-left" aria-hidden="true"><Diamond /></div><div className="sp-isekai-door sp-isekai-door-right" aria-hidden="true"><Star /></div>
      </div>
      {config.mascot.enabled && <img className="sp-isekai-companion" src={sekaiMascotUrl(config.mascot.key)} alt="" />}
      <span className="sp-isekai-ticket" aria-hidden="true">ADMIT ONE · ANOTHER WORLD</span>
    </div>
    <div className="sp-isekai-copy"><h1>Into the Isekai</h1><p>Entering {owner?.username ? `@${owner.username}’s` : 'your'} little world…</p></div>
    <div className="sp-loading-lane sp-isekai-lane" aria-hidden="true"><span /></div>
  </div>;
}
