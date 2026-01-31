import { useMemo } from 'react';

export function useIsNativeApp(): boolean {
  return useMemo(() => {
    if (typeof window === 'undefined') return false;

    // Check for Electron
    const isElectron = !!(window as any).electron;

    // Check for Capacitor
    const isCapacitor = !!(window as any).Capacitor?.isNative;

    // Check for Tauri (legacy check as per existing code)
    const hasTauri = !!(window as any).__TAURI__ ||
      !!(window as any).__TAURI_INTERNALS__ ||
      !!(window as any).invoke ||
      !!(window as any).tauri;

    const isNative = isElectron || isCapacitor || hasTauri;

    // Debug logging
    console.log('🔍 useIsNativeApp debug:', {
      isElectron,
      isCapacitor,
      hasTauri,
      isNative
    });

    return isNative;
  }, []);
}
