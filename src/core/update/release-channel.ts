import { useSyncExternalStore } from 'react';
export type ReleaseChannel = 'production' | 'beta';
export const RELEASE_CHANNEL_KEY = 'tatakai:release-channel';
const EVENT = 'tatakai-release-channel-changed';
let memory: ReleaseChannel = 'production';
export function getReleaseChannel(): ReleaseChannel {
  try { const stored = localStorage.getItem(RELEASE_CHANNEL_KEY); if (stored) memory = stored === 'beta' ? 'beta' : 'production'; } catch { /* private mode */ }
  return memory;
}
export function setReleaseChannel(channel: ReleaseChannel) {
  memory = channel;
  try { localStorage.setItem(RELEASE_CHANNEL_KEY, channel); } catch { /* session preference remains */ }
  window.dispatchEvent(new Event(EVENT));
}
export function subscribeReleaseChannel(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === RELEASE_CHANNEL_KEY) listener(); };
  window.addEventListener(EVENT, listener); window.addEventListener('storage', storage);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', storage); };
}
export const useReleaseChannel = () => useSyncExternalStore(subscribeReleaseChannel, getReleaseChannel, () => 'production' as const);
export const policyChannel = () => getReleaseChannel() === 'beta' ? 'beta' : 'stable';
