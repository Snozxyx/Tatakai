import { useEffect, useRef, type RefObject } from 'react';

/** IntersectionObserver callbacks contain changes, not the complete visible set. */
export class ReaderVisiblePages {
  readonly elements = new Set<HTMLElement>();
  update(entries: IntersectionObserverEntry[]) {
    entries.forEach(entry => {
      if (entry.isIntersecting) this.elements.add(entry.target as HTMLElement);
      else this.elements.delete(entry.target as HTMLElement);
    });
  }
  at(root: HTMLElement) {
    const point = root.getBoundingClientRect().top + root.clientHeight * 0.35;
    return [...this.elements].filter(element => element.isConnected)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .find(element => element.getBoundingClientRect().bottom > point);
  }
}

export function useReaderVisiblePages(rootRef: RefObject<HTMLDivElement>, enabled: boolean, identity: string,
  onVisible: (element: HTMLElement) => void) {
  const callback = useRef(onVisible);
  callback.current = onVisible;
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;
    const visible = new ReaderVisiblePages();
    const observed = new Set<HTMLElement>();
    let frame = 0;
    const report = () => { frame = 0; const page = visible.at(root); if (page) callback.current(page); };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(report); };
    const observer = new IntersectionObserver(entries => { visible.update(entries); schedule(); }, { root, threshold: 0 });
    const refresh = () => {
      observed.forEach(element => { if (!element.isConnected) { observer.unobserve(element); observed.delete(element); visible.elements.delete(element); } });
      root.querySelectorAll<HTMLElement>('[data-page]').forEach(element => {
        if (!observed.has(element)) { observed.add(element); observer.observe(element); }
      });
      schedule();
    };
    const mutation = new MutationObserver(refresh);
    mutation.observe(root, { childList: true, subtree: true });
    root.addEventListener('scroll', schedule, { passive: true });
    refresh();
    return () => { observer.disconnect(); mutation.disconnect(); root.removeEventListener('scroll', schedule); cancelAnimationFrame(frame); };
  }, [rootRef, enabled, identity]);
}
