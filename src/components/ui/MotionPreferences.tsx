import { type ReactNode, useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';

export function MotionPreferences({ children }: { children: ReactNode }) {
  const reduced = useMotionPreference();
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reduced);
    return () => { delete document.documentElement.dataset.reducedMotion; };
  }, [reduced]);
  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      {children}
    </MotionConfig>
  );
}
