import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

type PagePlaceholder = { number: string; ratio: number; width: number; style: CSSProperties };

/** Keep chapter geometry and page tracking, while releasing distant image leases. */
export function ReaderChapterWindow({ active, geometry, pageStyle, children }: { active: boolean; geometry: string; pageStyle: CSSProperties; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(true);
  const snapshots = useRef<PagePlaceholder[]>([]);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    if (active) { setMounted(true); return; }
    if (!mounted) return;
    const pages = [...element.querySelectorAll<HTMLElement>('[data-page]')];
    snapshots.current = pages.map(page => {
      const bounds = page.getBoundingClientRect();
      return { number: page.dataset.page!, ratio: bounds.width / Math.max(1, bounds.height), width: bounds.width,
        style: { width: page.style.width, maxWidth: page.style.maxWidth, height: page.style.height, maxHeight: page.style.maxHeight } };
    });
    if (snapshots.current.length) setMounted(false);
  }, [active, mounted]);
  return <div ref={root} data-reader-chapter-mounted={active || mounted ? 'true' : 'false'} className="w-full" style={{ display: 'contents' }}>
    {active || mounted ? children : snapshots.current.map((page, index) => <div key={index} data-page={page.number}
      data-reader-page-placeholder aria-hidden="true" className="mx-auto" style={{ ...pageStyle,
        width: !pageStyle.width || pageStyle.width === 'auto' ? page.width : pageStyle.width,
        aspectRatio: String(page.ratio), minHeight: page.ratio > 0 ? undefined : '32vh',
      }} data-reader-geometry={geometry} />)}
  </div>;
}
