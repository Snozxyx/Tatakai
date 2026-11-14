import { useEffect, useRef, type RefObject } from 'react';
import type { ReaderSettings } from '@/lib/reader/settings';
import { readerCanAdvance, READER_STEP } from '@/lib/reader/interactions';

export function useReaderAutoScroll(rootRef: RefObject<HTMLDivElement>, settings: ReaderSettings, paused: boolean) {
  const current = useRef({ settings, paused });
  current.current = { settings, paused };
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !settings.autoScroll || settings.readingMode !== 'vertical') return;
    let frame = 0, last = 0, elapsed = 0;
    const advance = (now: number) => {
      const { settings, paused } = current.current;
      const delta = last ? Math.max(0, now - last) : 0;
      last = now;
      const step = settings.autoScrollMode === 'jump' ? root.clientHeight * READER_STEP : settings.autoScrollSpeed * Math.min(32, delta) / 16;
      if (paused || document.hidden || !readerCanAdvance(root, step)) elapsed = 0;
      else if (settings.autoScrollMode === 'jump') {
        elapsed += delta;
        if (elapsed >= settings.autoScrollInterval * 1000) {
          root.scrollBy({ top: step, behavior: 'instant' });
          elapsed = 0;
        }
      } else root.scrollBy({ top: step, behavior: 'instant' });
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [rootRef, settings.autoScroll, settings.readingMode]);
}
