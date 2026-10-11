import { useSyncExternalStore } from 'react';
import { useMobileConfig } from './useMobileConfig';

const query = '(max-width: 1023px)';
const subscribe = (callback: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
};
const snapshot = () => window.matchMedia(query).matches;

/** One responsive gate for both browser and packaged mobile presentation. */
export function useMobileAppearance() {
  const { config } = useMobileConfig();
  const mobile = useSyncExternalStore(subscribe, snapshot, () => false);
  return mobile && config.mobileLayout === 'refreshed';
}
