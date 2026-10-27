import { useSyncExternalStore } from 'react';

const readMotionPreference = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  || document.body.classList.contains('reduce-motion')
  || document.documentElement.classList.contains('reduce-motion')
  || document.documentElement.dataset.reducedMotion === 'true';

const listeners = new Set<() => void>();
let stopObserving: (() => void) | undefined;
let reduced = false;

function subscribe(notify: () => void) {
  listeners.add(notify);
  if (!stopObserving) {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      const next = query.matches
        || document.body.classList.contains('reduce-motion')
        || document.documentElement.classList.contains('reduce-motion')
        || document.documentElement.dataset.reducedMotion === 'true';
      if (next === reduced) return;
      reduced = next;
      listeners.forEach(listener => listener());
    };
    const observer = new MutationObserver(sync);
    query.addEventListener('change', sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-reduced-motion'] });
    sync();
    stopObserving = () => {
      query.removeEventListener('change', sync);
      observer.disconnect();
    };
  }
  return () => {
    listeners.delete(notify);
    if (!listeners.size) {
      stopObserving?.();
      stopObserving = undefined;
    }
  };
}

function snapshot() {
  // Refresh after the last subscriber unmounts, including between SSR and hydration.
  if (!stopObserving && typeof window !== 'undefined') reduced = readMotionPreference();
  return reduced;
}

/** One shared observer for all avatars/effects, with live OS and app settings. */
export function useMotionPreference() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
