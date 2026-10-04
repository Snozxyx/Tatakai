import { type ReactNode, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface RevealProps {
  children: ReactNode;
  /** Stagger helper — delays the reveal slightly for a smoother cascade. */
  delay?: number;
  className?: string;
}

/**
 * Fades + lifts its children in the first time they scroll into view. Purely
 * cosmetic: honours `prefers-reduced-motion` (renders statically) and only
 * animates once so scrolling back up doesn't re-trigger it. Used to give the
 * home page a smoother, less "pop-in" feel.
 *
 * Mobile fast-path: on narrow viewports (<768px) motion is skipped entirely.
 * Framer's per-section whileInView observers + transforms caused visible jank
 * scrolling from Top-10 into the infinite feed on phones.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const reduceMotion = useReducedMotion();
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  if (reduceMotion || isMobileViewport) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
