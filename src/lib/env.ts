/**
 * Environment utilities for detecting platform and runtime
 */

/**
 * Check if running in Tauri (native app) environment
 * Always returns false as Tauri support has been removed
 */
export function isTauri(): boolean {
  // Tauri support has been removed
  return false;
}

/**
 * Check if running in web browser environment
 */
export function isWeb(): boolean {
  return typeof window !== 'undefined' && !isTauri();
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return import.meta.env.DEV;
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return import.meta.env.PROD;
}

/**
 * Get platform information
 */
export function getPlatform(): string {
  if (typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)) {
    // In Tauri, we can get platform info from Tauri API
    return 'tauri';
  }

  return 'web';
}

/**
 * Check if running on mobile device
 */
export function isMobile(): boolean {
  if (typeof window === 'undefined') return false;

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}
