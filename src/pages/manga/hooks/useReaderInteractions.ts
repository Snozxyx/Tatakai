import { useEffect, useRef, type RefObject } from 'react';
import type { ReaderSettings } from '@/lib/reader/settings';
import { READER_CONTROL_SELECTOR, READER_STEP, ReaderTapTracker } from '@/lib/reader/interactions';

export function useReaderInteractions(options: {
  rootRef: RefObject<HTMLDivElement>; settings: ReaderSettings; paused: boolean; reducedMotion: boolean;
  onSettings: () => void; onNextPage: () => void; onStopAutoScroll: () => void;
}) {
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    const root = options.rootRef.current;
    if (!root) return;
    const tracker = new ReaderTapTracker();
    let tapTimer: ReturnType<typeof setTimeout>;
    let cursorTimer: ReturnType<typeof setTimeout>;
    let lastTap = 0;
    let cursorPoint = { x: 0, y: 0 };
    const showCursor = () => { root.removeAttribute('data-reader-cursor-hidden'); };
    const hideLater = () => {
      clearTimeout(cursorTimer);
      if (current.current.settings.hideCursorWhileReading && !current.current.paused)
        cursorTimer = setTimeout(() => {
          if (current.current.settings.hideCursorWhileReading && !current.current.paused) root.setAttribute('data-reader-cursor-hidden', 'true');
        }, 1500);
    };
    const stopAuto = () => { if (current.current.settings.autoScroll) current.current.onStopAutoScroll(); };
    const down = (event: PointerEvent) => {
      clearTimeout(tapTimer);
      tracker.down(event.pointerId, event.clientX, event.clientY);
      stopAuto();
    };
    const move = (event: PointerEvent) => {
      tracker.move(event.pointerId, event.clientX, event.clientY);
      if (event.pointerType !== 'mouse') return;
      if ((event.target as Element)?.closest(READER_CONTROL_SELECTOR)) {
        clearTimeout(cursorTimer); showCursor(); return;
      }
      if (root.hasAttribute('data-reader-cursor-hidden') && Math.hypot(event.clientX - cursorPoint.x, event.clientY - cursorPoint.y) < current.current.settings.cursorWakeDistance) return;
      cursorPoint = { x: event.clientX, y: event.clientY };
      showCursor(); hideLater();
    };
    const up = (event: PointerEvent) => {
      const tap = tracker.up(event.pointerId, event.clientX, event.clientY);
      if (!tap || current.current.paused || event.button !== 0 || (event.target as Element)?.closest(READER_CONTROL_SELECTOR) || document.getSelection()?.toString()) return;
      const now = Date.now();
      clearTimeout(tapTimer);
      if (now - lastTap < 340) { lastTap = 0; return; }
      lastTap = now;
      tapTimer = setTimeout(() => {
        const { settings, onSettings, onNextPage, reducedMotion, paused } = current.current;
        if (paused || document.getSelection()?.toString()) return;
        if (settings.tapBehavior === 'settings') onSettings();
        if (settings.tapBehavior === 'scroll') {
          if (settings.readingMode === 'paged') onNextPage();
          else root.scrollBy({ top: root.clientHeight * READER_STEP, behavior: reducedMotion ? 'instant' : 'smooth' });
        }
      }, 340);
    };
    const cancel = (event: PointerEvent) => tracker.remove(event.pointerId);
    const scroll = () => { tracker.cancel(); clearTimeout(tapTimer); };
    const leave = () => { clearTimeout(cursorTimer); showCursor(); tracker.cancel(); };
    const keydown = (event: KeyboardEvent) => {
      showCursor(); clearTimeout(cursorTimer);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key) && !(event.target as Element)?.closest(READER_CONTROL_SELECTOR)) stopAuto();
    };
    root.addEventListener('pointerdown', down, true);
    root.addEventListener('pointermove', move, true);
    root.addEventListener('pointerup', up, true);
    root.addEventListener('pointercancel', cancel, true);
    root.addEventListener('pointerleave', leave);
    root.addEventListener('scroll', scroll, { passive: true });
    root.addEventListener('wheel', stopAuto, { passive: true });
    root.addEventListener('touchstart', stopAuto, { passive: true });
    document.addEventListener('keydown', keydown, true);
    root.addEventListener('focusin', leave);
    return () => {
      clearTimeout(tapTimer); clearTimeout(cursorTimer); showCursor();
      root.removeEventListener('pointerdown', down, true);
      root.removeEventListener('pointermove', move, true);
      root.removeEventListener('pointerup', up, true);
      root.removeEventListener('pointercancel', cancel, true);
      root.removeEventListener('pointerleave', leave);
      root.removeEventListener('scroll', scroll);
      root.removeEventListener('wheel', stopAuto);
      root.removeEventListener('touchstart', stopAuto);
      document.removeEventListener('keydown', keydown, true);
      root.removeEventListener('focusin', leave);
    };
  }, [options.rootRef]);
  useEffect(() => {
    if (options.paused || !options.settings.hideCursorWhileReading) options.rootRef.current?.removeAttribute('data-reader-cursor-hidden');
  }, [options.paused, options.settings.hideCursorWhileReading, options.rootRef]);
}
