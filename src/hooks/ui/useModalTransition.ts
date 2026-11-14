import { useEffect, useRef, useState } from 'react';
import { useMotionPreference } from './useMotionPreference';

/** React lifecycle for the existing Transitions.dev modal recipe. */
export function useModalTransition(open: boolean) {
  const [visible, setVisible] = useState(open);
  const [motionClass, setMotionClass] = useState('');
  const frame = useRef<number>();
  const timer = useRef<number>();
  const reducedMotion = useMotionPreference();
  useEffect(() => {
    window.clearTimeout(timer.current);
    window.cancelAnimationFrame(frame.current || 0);
    if (open) {
      setVisible(true);
      setMotionClass('');
      frame.current = requestAnimationFrame(() => setMotionClass('is-open'));
    } else if (visible) {
      setMotionClass('is-closing');
      const duration = reducedMotion ? 0 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--modal-close-dur')) || 150;
      timer.current = window.setTimeout(() => { setVisible(false); setMotionClass(''); }, duration);
    }
    return () => { window.clearTimeout(timer.current); window.cancelAnimationFrame(frame.current || 0); };
  }, [open, reducedMotion, visible]);
  return { visible, motionClass };
}
