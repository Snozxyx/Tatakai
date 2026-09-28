import { type ReactNode } from "react";
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
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
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
