/**
 * React hook wrapper around the centralized haptics module (`@/lib/haptics`).
 *
 * Kept for backwards compatibility with existing call sites (MobileNav etc.).
 * Unlike the old implementation, every method now:
 *   - respects the `tatakai_mobile_config.hapticFeedback` toggle, and
 *   - falls back to `navigator.vibrate` on mobile web (not just Capacitor native).
 *
 * For new code prefer `triggerHaptic('event')` from `@/lib/haptics` directly.
 */
import { Capacitor } from '@capacitor/core';
import { triggerHaptic } from '@/lib/haptics';

export function useHaptics() {
  const isNative = (() => {
    try {
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  })();

  const impact = (style: 'light' | 'medium' | 'heavy' = 'medium') => triggerHaptic(style);
  const notification = (type: 'success' | 'warning' | 'error' = 'success') => triggerHaptic(type);
  const vibrate = (_duration = 300) => triggerHaptic('medium');
  const selectionStart = () => triggerHaptic('select');
  const selectionChanged = () => triggerHaptic('select');
  const selectionEnd = () => triggerHaptic('select');

  return {
    impact,
    notification,
    vibrate,
    selectionStart,
    selectionChanged,
    selectionEnd,
    isNative,
  };
}
