/**
 * dataSaver.ts — single gate for the mobile Data Saver bundle.
 *
 * Reads `tatakai_mobile_config.dataSaver` directly (no React) so HLS adapters,
 * the reader, and poster helpers can honor it without hook cycles.
 * When on: force the `low` memory profile, cap preferred quality to 720p,
 * disable autoplay / heavy preload, and prefer smaller posters.
 */
import { DEFAULT_MOBILE_CONFIG } from '@/hooks/ui/useMobileConfig';
import type { MemoryProfile } from '@/lib/memoryProfile';
import { getMemoryProfile } from '@/lib/memoryProfile';

const STORAGE_KEY = 'tatakai_mobile_config';

export function isDataSaverEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MOBILE_CONFIG.dataSaver;
    return (JSON.parse(raw) as { dataSaver?: boolean }).dataSaver === true;
  } catch {
    return false;
  }
}

/** Effective memory profile: data-saver forces `low` regardless of user profile. */
export function getEffectiveMemoryProfile(): MemoryProfile {
  if (isDataSaverEnabled()) return 'low';
  try {
    return getMemoryProfile();
  } catch {
    return 'balanced';
  }
}

/** Cap a preferred quality string when data-saver is on (720p max, auto stays auto). */
export function capQualityForDataSaver(
  preferred: 'auto' | '1080p' | '720p' | '480p' | '360p',
): 'auto' | '1080p' | '720p' | '480p' | '360p' {
  if (!isDataSaverEnabled()) return preferred;
  if (preferred === '1080p') return '720p';
  return preferred;
}

/** Autoplay gate: data-saver disables ambient autoplay (explicit taps still play). */
export function shouldAutoplayVideo(explicitAutoplay: boolean): boolean {
  if (!explicitAutoplay) return false;
  if (isDataSaverEnabled()) return false;
  return true;
}

/** Reader preload override: data-saver forces minimal preloading. */
export function getReaderPreloadOverride(
  configured: 'none' | 'partial' | 'full',
): 'none' | 'partial' | 'full' {
  if (isDataSaverEnabled()) return 'none';
  return configured;
}

/**
 * Downgrade a poster/banner URL to its smaller variant when data-saver is on.
 * Covers AniList cover/banner sizes and Jikan image URLs; anything else passes
 * through untouched. Called by the `getHighQuality*` poster helpers so every
 * card rail shrinks without touching ~100 call sites.
 */
export function downgradePosterForDataSaver(url: string): string {
  const raw = String(url || '').trim();
  if (!raw || !isDataSaverEnabled()) return raw;
  return raw
    .replace('/cover/large/', '/cover/medium/')
    .replace('/banner/large/', '/banner/medium/')
    .replace(/\/webp\/large_image_url/, '/webp/image_url')
    .replace(/\/jpg\/large_image_url/, '/jpg/image_url');
}

/** Metered-link hint via NetworkInformation (best-effort, no Capacitor dep). */
export function isLikelyMeteredConnection(): boolean {
  try {
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string; type?: string };
    }).connection;
    if (!conn) return false;
    if (conn.saveData === true) return true;
    const type = String(conn.type || '').toLowerCase();
    if (type.includes('cellular')) return true;
    return false;
  } catch {
    return false;
  }
}
