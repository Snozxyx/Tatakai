import { useMemo } from 'react';
import { isNative, isDesktop, isMobileNative } from '@/lib/platform/platform';

/**
 * Thin React bindings over `@/lib/platform/platform` (the single source of
 * truth). Kept as hooks so existing call sites don't change; the detection
 * logic lives in one place now.
 */

export function useIsNativeApp(): boolean {
  return useMemo(() => isNative(), []);
}

// Desktop apps only (Electron/Tauri)
export function useIsDesktopApp(): boolean {
  return useMemo(() => isDesktop(), []);
}

// Mobile apps only (Capacitor)
export function useIsMobileApp(): boolean {
  return useMemo(() => isMobileNative(), []);
}
