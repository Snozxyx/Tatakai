import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** Own two-finger gestures without taking away native one-finger scrolling. */
export function useReaderPinchZoom(rootRef: RefObject<HTMLDivElement>, zoom: number, onZoom: (zoom: number) => void, zoomWithWheel = true) {
  const latest = useRef({ zoom, onZoom, zoomWithWheel });
  latest.current = { zoom, onZoom, zoomWithWheel };
  const suppressTap = useRef(false);
  const anchor = useRef<{
    element: HTMLElement; x: number; y: number; clientX: number; clientY: number;
  } | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const point = anchor.current;
    if (!root || !point || !point.element.isConnected) return;
    const rect = point.element.getBoundingClientRect();
    root.scrollLeft += rect.left + rect.width * point.x - point.clientX;
    root.scrollTop += rect.top + rect.height * point.y - point.clientY;
    if (!suppressTap.current) anchor.current = null;
  }, [zoom, rootRef]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let pinch: { distance: number; zoom: number } | null = null;
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    const distance = (touches: TouchList) => Math.max(1, Math.hypot(
      touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY,
    ));
    const captureAnchor = (clientX: number, clientY: number) => {
      anchor.current = null;
      const pages = [...root.querySelectorAll<HTMLElement>('[data-page]')];
      const element = pages.find((page) => {
        const rect = page.getBoundingClientRect();
        return rect.top <= clientY && rect.bottom >= clientY;
      });
      if (element) {
        const rect = element.getBoundingClientRect();
        anchor.current = { element, x: (clientX - rect.left) / Math.max(1, rect.width),
          y: (clientY - rect.top) / Math.max(1, rect.height), clientX, clientY };
      }
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !latest.current.zoomWithWheel) return;
      event.preventDefault();
      captureAnchor(event.clientX, event.clientY);
      const step = Math.abs(event.deltaY) > 40 ? 8 : 3;
      const next = Math.min(300, Math.max(50, latest.current.zoom + (event.deltaY < 0 ? step : -step)));
      if (next !== latest.current.zoom) latest.current.onZoom(next);
    };
    const start = (event: TouchEvent) => {
      if (event.touches.length < 2) {
        if (!suppressTap.current) anchor.current = null;
        return;
      }
      event.preventDefault();
      clearTimeout(releaseTimer);
      suppressTap.current = true;
      if (event.touches.length !== 2) return;
      pinch = { distance: distance(event.touches), zoom: latest.current.zoom };
      const clientX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      const clientY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      captureAnchor(clientX, clientY);
    };

    const move = (event: TouchEvent) => {
      if (!suppressTap.current) return;
      // Keep the remaining finger from starting a scroll after a pinch ends.
      event.preventDefault();
      if (!pinch || event.touches.length !== 2) return;
      const next = Math.min(300, Math.max(50, Math.round(pinch.zoom * distance(event.touches) / pinch.distance)));
      if (next !== latest.current.zoom) latest.current.onZoom(next);
    };
    const end = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch = null;
      if (event.touches.length || !suppressTap.current) return;
      // Pointer-up and synthetic click follow touchend; neither is a reader tap.
      releaseTimer = setTimeout(() => { suppressTap.current = false; anchor.current = null; }, 350);
    };
    const click = (event: MouseEvent) => {
      if (suppressTap.current) { event.preventDefault(); event.stopPropagation(); }
    };
    root.addEventListener('wheel', wheel, { passive: false });
    root.addEventListener('touchstart', start, { passive: false });
    root.addEventListener('touchmove', move, { passive: false });
    root.addEventListener('touchend', end);
    root.addEventListener('touchcancel', end);
    root.addEventListener('click', click, true);
    return () => {
      clearTimeout(releaseTimer);
      root.removeEventListener('wheel', wheel);
      root.removeEventListener('touchstart', start);
      root.removeEventListener('touchmove', move);
      root.removeEventListener('touchend', end);
      root.removeEventListener('touchcancel', end);
      root.removeEventListener('click', click, true);
      anchor.current = null;
      suppressTap.current = false;
    };
  }, [rootRef]);
  return suppressTap;
}
