import { type ReactNode, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';

interface RevealProps { children: ReactNode; delay?: number; className?: string; }

/** One-shot marketing fade. Frequently used browsing content stays visible. */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const played = useRef(false);
  const reduced = useMotionPreference();
  const { pathname } = useLocation();
  useEffect(() => {
    const el = ref.current;
    if (!el || played.current || reduced || window.innerWidth < 768
      || !['/welcome', '/download'].includes(pathname)
      || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      played.current = true;
      el.style.animationDelay = Math.min(delay, 0.15) + 's';
      el.classList.add('marketing-reveal');
      observer.disconnect();
    }, { threshold: 0.1 });
    observer.observe(el);
    return () => {
      observer.disconnect();
      el.classList.remove('marketing-reveal');
      el.style.removeProperty('animation-delay');
    };
  }, [delay, pathname, reduced]);
  return <div ref={ref} className={className}>{children}</div>;
}
