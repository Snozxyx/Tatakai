import { useEffect, useRef, useState } from 'react';

/**
 * X/Twitter-style follow-along rail. The rail scrolls up with the page; when it's
 * taller than the viewport it pins its BOTTOM to the bottom of the screen (so the
 * lower widgets come into view as you scroll), and when it's shorter it pins near
 * the top. The `top` offset is recomputed from the rail's height whenever it or
 * the window resizes.
 *
 * Spread the returned `ref` onto the `position: sticky` element and apply `style`
 * for the computed `top`; give its <aside> parent `self-stretch` (inside a
 * `flex items-start` row) so the sticky element has the full column height to
 * travel through. Shared by the main community feed rail and the community-space
 * rail so both behave identically.
 */
export function useFollowAlongRail(offset = 24) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(offset);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const h = el.offsetHeight;
      const vh = window.innerHeight;
      setTop(h + offset > vh ? vh - h - offset : offset);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [offset]);

  return { ref, style: { top } as React.CSSProperties };
}
