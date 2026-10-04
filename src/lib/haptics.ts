/**
 * Centralized haptics — one entry point for the whole app.
 *
 * Works in three tiers, best-effort and always safe to call:
 *   1. Capacitor native (Android/iOS) → the real Haptics plugin (impact / notification / selection).
 *   2. Mobile web / desktop with a vibration motor → `navigator.vibrate` patterns.
 *   3. Everything else → no-op.
 *
 * Gated by the user's `tatakai_mobile_config.hapticFeedback` setting (default on),
 * so a single toggle silences every call site. Prefer `triggerHaptic(event)` with a
 * semantic event name over raw durations so the feel stays consistent everywhere.
 */
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export type HapticEvent =
  // UI micro-interactions
  | 'navigate' | 'tap' | 'select' | 'open' | 'toggle'
  // outcome feedback
  | 'success' | 'warning' | 'error'
  // raw intensity
  | 'light' | 'medium' | 'heavy'
  // semantic app events
  | 'download-complete' | 'post' | 'comment' | 'reader-toggle';

/** Respect the user's haptic toggle (default enabled). */
export function hapticsEnabled(): boolean {
  try {
    const raw = localStorage.getItem('tatakai_mobile_config');
    if (raw) return JSON.parse(raw).hapticFeedback !== false;
  } catch {
    /* ignore */
  }
  return true;
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Web vibration patterns (ms) keyed by event — richer than a single buzz. */
const WEB_PATTERN: Record<HapticEvent, number | number[]> = {
  navigate: 8,
  tap: 8,
  select: 10,
  open: 12,
  toggle: 10,
  success: [12, 45, 22],
  warning: [20, 60, 20],
  error: [30, 40, 30, 40, 30],
  light: 8,
  medium: 18,
  heavy: 32,
  'download-complete': [15, 50, 15, 60, 25],
  post: [12, 35, 18],
  comment: 12,
  'reader-toggle': 10,
};

/** Map a semantic event onto the native plugin's coarser API. */
async function fireNative(event: HapticEvent): Promise<void> {
  try {
    switch (event) {
      case 'success':
        await Haptics.notification({ type: NotificationType.Success });
        return;
      case 'warning':
        await Haptics.notification({ type: NotificationType.Warning });
        return;
      case 'error':
        await Haptics.notification({ type: NotificationType.Error });
        return;
      case 'download-complete':
      case 'post':
        // A double tap reads as "done".
        await Haptics.notification({ type: NotificationType.Success });
        return;
      case 'heavy':
        await Haptics.impact({ style: ImpactStyle.Heavy });
        return;
      case 'medium':
      case 'open':
      case 'toggle':
      case 'reader-toggle':
        await Haptics.impact({ style: ImpactStyle.Medium });
        return;
      case 'select':
        await Haptics.selectionChanged();
        return;
      default:
        await Haptics.impact({ style: ImpactStyle.Light });
    }
  } catch {
    /* plugin missing / blocked — ignore */
  }
}

/**
 * Fire a haptic for a semantic event. Safe to call anywhere (async, never throws).
 * Silent when the user disabled haptics or the device has no motor.
 */
export async function triggerHaptic(event: HapticEvent = 'tap'): Promise<void> {
  if (!hapticsEnabled()) return;
  if (isNative()) {
    await fireNative(event);
    return;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(WEB_PATTERN[event] ?? 10);
    } catch {
      /* ignore */
    }
  }
}
