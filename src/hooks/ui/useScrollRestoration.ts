import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Saves and restores scroll position for the calling component.
 *
 * Usage:
 *   const scrollRef = useScrollRestoration('trending-page');
 *   return <div ref={scrollRef} className="overflow-y-auto h-full">...</div>;
 *
 * Or for window-level scroll:
 *   useScrollRestoration('trending-page', { useWindow: true });
 */
export function useScrollRestoration(
  key: string,
  options: { useWindow?: boolean; delay?: number } = {}
) {
  const { useWindow = false, delay = 50 } = options;
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const storageKey = `tatakai_scroll_${key}_${location.pathname}`;

  // Restore scroll on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return;
    const pos = Number(saved);
    if (isNaN(pos) || pos <= 0) return;

    // Delay slightly so the DOM has rendered content
    const t = setTimeout(() => {
      if (useWindow) {
        window.scrollTo({ top: pos, behavior: 'instant' });
      } else if (scrollRef.current) {
        scrollRef.current.scrollTop = pos;
      }
    }, delay);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save scroll on unmount / route change
  useEffect(() => {
    const el = scrollRef.current;

    const save = () => {
      const pos = useWindow ? window.scrollY : (el?.scrollTop ?? 0);
      if (pos > 0) {
        sessionStorage.setItem(storageKey, String(pos));
      }
    };

    // Also save on beforeunload
    window.addEventListener('beforeunload', save);
    return () => {
      save();
      window.removeEventListener('beforeunload', save);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, useWindow]);

  return scrollRef;
}
