type VisibilityListener = (visible: boolean) => void;
let observer: IntersectionObserver | undefined;
const listeners = new Map<Element, VisibilityListener>();

/** One observer for the entire TV catalogue instead of one per media card. */
export function observeTVVisibility(element: Element, listener: VisibilityListener) {
  if (typeof IntersectionObserver === 'undefined') { listener(true); return () => {}; }
  observer ||= new IntersectionObserver(entries => {
    for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting);
  }, { rootMargin: '120px' });
  listeners.set(element, listener);
  observer.observe(element);
  return () => {
    listeners.delete(element);
    observer?.unobserve(element);
    if (!listeners.size) { observer?.disconnect(); observer = undefined; }
  };
}
