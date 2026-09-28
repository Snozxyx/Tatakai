import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

export interface IconSwapProps {
    /** 
     * The unique identifier for the current state. 
     * When this changes, the component triggers the swap animation. 
     */
    swapKey: string | number | boolean;
    children: ReactNode;
    /** Optional custom rotation in degrees. Set to 0 to disable rotation. */
    rotation?: number;
    className?: string;
}

/**
 * Crossfade between two icon states in place.
 * Uses a premium scale + rotation + blur spring animation.
 * Both icons explicitly share one grid cell to eliminate layout shift.
 * Falls back to a plain opacity fade for users who prefer reduced motion.
 */
export function IconSwap({ 
    swapKey, 
    children, 
    rotation = 30, // A subtle 30-degree spin creates a beautiful morphing effect
    className = '' 
}: IconSwapProps) {
    const reduce = useReducedMotion();

    return (
        <span className={`relative inline-grid place-items-center ${className}`}>
            <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                    key={String(swapKey)}
                    initial={
                        reduce 
                            ? { opacity: 0 } 
                            : { scale: 0.5, opacity: 0, rotate: -rotation, filter: 'blur(2px)' }
                    }
                    animate={{ scale: 1, opacity: 1, rotate: 0, filter: 'blur(0px)' }}
                    exit={
                        reduce 
                            ? { opacity: 0 } 
                            : { scale: 0.5, opacity: 0, rotate: rotation, filter: 'blur(2px)' }
                    }
                    transition={{ 
                        type: 'spring', 
                        // Apple-esque spring values for a snappy but smooth interaction
                        stiffness: 350, 
                        damping: 25,
                        mass: 1
                    }}
                    // Force the icon into the first cell of the parent grid so old/new overlap perfectly
                    className="col-start-1 row-start-1 flex items-center justify-center origin-center"
                >
                    {children}
                </motion.span>
            </AnimatePresence>
        </span>
    );
}