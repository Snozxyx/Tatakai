import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import './uchiha-crows.css';

/** Sourced NIAID / Ryan Kissinger SVG; attribution is bundled with the artwork. */
function Crow() {
  return <img className="uc-bird" src="/assets/profile-themes/uchiha/crow.svg" alt="" draggable={false} />;
}

const FLOCK = [
  { top: 12, size: 64, duration: 23, delay: -5, opacity: .72 },
  { top: 28, size: 40, duration: 29, delay: -19, opacity: .5 },
  { top: 57, size: 92, duration: 31, delay: -12, opacity: .65 },
  { top: 76, size: 48, duration: 25, delay: -3, opacity: .5 },
  { top: 37, size: 32, duration: 33, delay: -27, opacity: .4 },
  { top: 87, size: 76, duration: 28, delay: -22, opacity: .62 },
];

export function UchihaCrows({ variant = 'page', paused = false }: { variant?: 'page' | 'banner' | 'widget'; paused?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useMotionPreference();
  const [visible, setVisible] = useState(true);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (ref.current) observer.observe(ref.current);
    const onVisibility = () => setHidden(document.hidden);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);
  return <div ref={ref} className={`uchiha-crows uchiha-crows-${variant}`} data-still={reduce || undefined} data-paused={paused || hidden || !visible || undefined} aria-hidden="true">
    {FLOCK.slice(0, variant === 'widget' ? 4 : 6).map((bird, index) => <span key={index} className="uc-flight" style={{
      top: `${bird.top}%`, width: `${variant === 'widget' ? bird.size * .6 : bird.size}px`,
      '--uc-duration': `${bird.duration}s`, '--uc-delay': `${bird.delay}s`, '--uc-opacity': bird.opacity,
      '--uc-rest': `${12 + index * 15}%`, '--uc-flap': `${.9 + index * .12}s`,
    } as CSSProperties}><Crow /></span>)}
  </div>;
}
