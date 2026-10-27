import * as React from "react";

const MOBILE_QUERY = '(max-width: 767px)';
const listeners = new Set<() => void>();
let media: MediaQueryList | undefined;

function getMedia() {
  return media ??= window.matchMedia(MOBILE_QUERY);
}

function notify() {
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  const query = getMedia();
  if (!listeners.size) query.addEventListener('change', notify);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      query.removeEventListener('change', notify);
      media = undefined;
    }
  };
}

function getSnapshot() {
  return getMedia().matches;
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * True on phone-width viewports only (< 768px) — the phone bottom navigation bar
 * lives below this line; at the tablet breakpoint and above the app uses the web
 * floating sidebar instead, so tablets get the desktop layout rather than a
 * stretched bottom bar.
 */
export function useIsPhone() {
  return useIsMobile();
}
