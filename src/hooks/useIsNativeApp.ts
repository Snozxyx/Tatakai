import { useMemo } from 'react';
import { Capacitor } from '@capacitor/core';

export function useIsNativeApp(): boolean {
  return useMemo(() => {
    if (typeof window === 'undefined') return false;

    // Check for Electron
    const isElectron = !!(window as any).electron;

    // Check for Capacitor - use the official API
    const isCapacitor = Capacitor.isNativePlatform();

    // Check for Tauri (legacy check as per existing code)
    const hasTauri = !!(window as any).__TAURI__ ||
      !!(window as any).__TAURI_INTERNALS__ ||
      !!(window as any).invoke ||
      !!(window as any).tauri;

    const isNative = isElectron || isCapacitor || hasTauri;

    return isNative;
  }, []);
}

// Separate hook for desktop apps only (Electron/Tauri)
export function useIsDesktopApp(): boolean {
  return useMemo(() => {
    if (typeof window === 'undefined') return false;

    // Check for Electron
    const isElectron = !!(window as any).electron;

    // Check for Tauri
    const hasTauri = !!(window as any).__TAURI__ ||
      !!(window as any).__TAURI_INTERNALS__ ||
      !!(window as any).invoke ||
      !!(window as any).tauri;

    return isElectron || hasTauri;
  }, []);
}

// Separate hook for mobile apps only (Capacitor)
export function useIsMobileApp(): boolean {
  return useMemo(() => {
    return Capacitor.isNativePlatform();
  }, []);
}
