import { useState, useEffect } from 'react';
import { useMotionValue, animate } from 'framer-motion';

interface AnimatedNumberOptions {
  decimals?: number;
  prefix?: string;
  suffix?: string;
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}

export function useAnimatedNumber(
  endValue: number,
  duration: number = 1000,
  options?: AnimatedNumberOptions
): string {
  const [displayValue, setDisplayValue] = useState(0);
  const motionValue = useMotionValue(0);
  
  const { decimals = 0, prefix = '', suffix = '', easing = 'easeInOut' } = options || {};

  useEffect(() => {
    const controls = animate(motionValue, endValue, {
      duration: duration / 1000,
      ease: easing,
      onUpdate: (latest) => {
        const formatted = Number(latest.toFixed(decimals));
        setDisplayValue(formatted);
      },
    });

    return () => controls.stop();
  }, [endValue, duration, decimals, easing, motionValue]);

  return `${prefix}${displayValue.toLocaleString()}${suffix}`;
}