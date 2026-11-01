import { useLayoutEffect, useRef, type RefObject } from 'react';

type Anchor = { element: HTMLElement; fraction: number; viewportFraction: number };
export function captureReaderAnchor(root: HTMLElement): Anchor | null {
  const bounds = root.getBoundingClientRect();
  const y = bounds.top + root.clientHeight * 0.4;
  const page = [...root.querySelectorAll<HTMLElement>('[data-page]')].find(el => {
    const rect = el.getBoundingClientRect(); return rect.top <= y && rect.bottom >= y;
  });
  if (!page) return null;
  const rect = page.getBoundingClientRect();
  return { element: page, fraction: (y - rect.top) / Math.max(1, rect.height), viewportFraction: 0.4 };
}
export function restoreReaderAnchor(root: HTMLElement, anchor: Anchor | null) {
  if (!anchor?.element.isConnected) return;
  const rect = anchor.element.getBoundingClientRect();
  root.scrollTop += rect.top + rect.height * anchor.fraction - root.getBoundingClientRect().top - root.clientHeight * anchor.viewportFraction;
}

/** Preserve a point inside the visible page, including long webtoon images. */
export function useReaderLayoutAnchor(rootRef: RefObject<HTMLDivElement>, identity: string, geometry: string, enabled: boolean) {
  const anchor = useRef<Anchor | null>(null);
  const previous = useRef(identity);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) { anchor.current = null; return; }
    if (previous.current !== identity) { previous.current = identity; anchor.current = null; }
    restoreReaderAnchor(root, anchor.current);
    anchor.current = captureReaderAnchor(root);
    let frame = 0;
    let adjusting = false;
    const capture = () => { if (!adjusting) anchor.current = captureReaderAnchor(root); };
    const restore = () => {
      adjusting = true; restoreReaderAnchor(root, anchor.current);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { adjusting = false; capture(); });
    };
    const observer = new ResizeObserver(restore);
    observer.observe(root);
    root.querySelectorAll<HTMLElement>('[data-reader-entry]').forEach(el => observer.observe(el));
    root.addEventListener('scroll', capture, { passive: true });
    root.addEventListener('load', restore, true);
    const old = root.style.overflowAnchor; root.style.overflowAnchor = 'none';
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      root.removeEventListener('scroll', capture); root.removeEventListener('load', restore, true);
      root.style.overflowAnchor = old;
    };
  }, [rootRef, identity, geometry, enabled]);
}
