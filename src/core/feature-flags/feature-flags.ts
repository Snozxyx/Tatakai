/**
 * Feature Flag Service
 *
 * Lightweight, zero-dependency feature flag system for Tatakai.
 * Flags are defined statically and can be overridden at runtime via:
 *   1. localStorage  ("tatakai:ff:<flag>" = "true" | "false")
 *   2. URL search params  (?ff_<flag>=1)
 *   3. Remote config (future Unleash / Supabase integration)
 *
 * Usage:
 *   import { isEnabled, FeatureFlag } from '@/core/feature-flags/feature-flags';
 *   if (isEnabled(FeatureFlag.TORRENT_ENGINE)) { ... }
 */

// ── Flag definitions ──────────────────────────────────────────────────────────

export enum FeatureFlag {
  /** Phase 1 – Content Graph powered browsing (AniList + Jikan) */
  CONTENT_GRAPH = 'content_graph',

  /** Phase 1 – Virtualized grids for large browse results */
  VIRTUAL_GRID = 'virtual_grid',

  /** Phase 1 – BlurHash placeholders for cover images */
  BLURHASH_IMAGES = 'blurhash_images',

  /** Phase 2 – Faceted search with advanced filters */
  FACETED_SEARCH = 'faceted_search',

  /** Phase 2 – Voice search via Web Speech API */
  VOICE_SEARCH = 'voice_search',

  /** Phase 2 – On-device AI recommendations (ONNX / TF.js) */
  TATAKAI_NEURAL = 'tatakai_neural',

  /** Phase 3 – Smart download manager for offline viewing */
  DOWNLOAD_MANAGER = 'download_manager',

  /** Phase 3 – AI subtitle translation (ONNX opus-mt) */
  AI_SUBTITLE_TRANSLATION = 'ai_subtitle_translation',

  /** Phase 4 – Extension local scraping sandbox */
  EXTENSION_SCRAPING = 'extension_scraping',

  /** Phase 4 – 1.1.1.1 WARP tunnel integration */
  WARP_TUNNEL = 'warp_tunnel',

  /** Phase 5 – First-party torrent engine (desktop only) */
  TORRENT_ENGINE = 'torrent_engine',

  /** Phase 5 – Anime calendar with airing notifications */
  ANIME_CALENDAR = 'anime_calendar',

  /** Phase 5 – Tatakai Wrapped (Spotify-style stats) */
  TATAKAI_WRAPPED = 'tatakai_wrapped',

  /** Phase 6 – Watch2Together v2 (WebRTC rooms) */
  WATCH_TOGETHER = 'watch_together',

  /** Phase 6 – Clip & share system */

  /** Phase 7 – Cross-device sync */
  CROSS_DEVICE_SYNC = 'cross_device_sync',

  /** Phase 7 – Character database + OST player */
  CHARACTER_DB = 'character_db',

  /** Phase 8 – Smart theme creator */
  SMART_THEME_CREATOR = 'smart_theme_creator',

  /** Phase 8 – Anime news feed */
  ANIME_NEWS_FEED = 'anime_news_feed',

  /** Phase 4 – Desktop local runtime bridge (reserved) */
  TATAKAI_RUNTIME = 'tatakai_runtime',

  /** Web: encourage full watch experience in the desktop/mobile app (soft gate + CTAs). */
  WEB_WATCH_GATED = 'web_watch_gated',
}

// ── Default state (all new features start disabled) ───────────────────────────

const FLAG_DEFAULTS: Record<FeatureFlag, boolean> = {
  [FeatureFlag.CONTENT_GRAPH]: true,
  [FeatureFlag.VIRTUAL_GRID]: true,
  [FeatureFlag.BLURHASH_IMAGES]: true,
  [FeatureFlag.FACETED_SEARCH]: false,
  [FeatureFlag.VOICE_SEARCH]: false,
  [FeatureFlag.TATAKAI_NEURAL]: false,
  [FeatureFlag.DOWNLOAD_MANAGER]: true,
  [FeatureFlag.AI_SUBTITLE_TRANSLATION]: false,
  [FeatureFlag.EXTENSION_SCRAPING]: false,
  [FeatureFlag.WARP_TUNNEL]: false,
  [FeatureFlag.TORRENT_ENGINE]: false,
  [FeatureFlag.ANIME_CALENDAR]: false,
  [FeatureFlag.TATAKAI_WRAPPED]: false,
  [FeatureFlag.WATCH_TOGETHER]: false,
  [FeatureFlag.CROSS_DEVICE_SYNC]: false,
  [FeatureFlag.CHARACTER_DB]: false,
  [FeatureFlag.SMART_THEME_CREATOR]: false,
  [FeatureFlag.ANIME_NEWS_FEED]: false,
  [FeatureFlag.TATAKAI_RUNTIME]: false,
  /** Default on so production web funnels to the app; disable locally via `?ff_web_watch_gated=0`. */
  [FeatureFlag.WEB_WATCH_GATED]: true,
};

// ── Runtime override cache ────────────────────────────────────────────────────

const LS_PREFIX = 'tatakai:ff:';
const URL_PREFIX = 'ff_';

/** Resolved overrides (populated once on first access). */
let _overrides: Map<string, boolean> | null = null;

function resolveOverrides(): Map<string, boolean> {
  if (_overrides) return _overrides;
  _overrides = new Map();

  // 1. localStorage overrides
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(LS_PREFIX)) {
        const flag = key.slice(LS_PREFIX.length);
        _overrides.set(flag, localStorage.getItem(key) === 'true');
      }
    }
  } catch {
    // localStorage may be unavailable (e.g. sandboxed iframe)
  }

  // 2. URL param overrides (higher priority)
  try {
    const params = new URLSearchParams(window.location.search);
    params.forEach((value, key) => {
      if (key.startsWith(URL_PREFIX)) {
        const flag = key.slice(URL_PREFIX.length);
        _overrides!.set(flag, value === '1' || value === 'true');
      }
    });
  } catch {
    // SSR or non-browser context
  }

  return _overrides;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check if a feature flag is enabled.
 * Resolution order: URL param > localStorage > default.
 */
export function isEnabled(flag: FeatureFlag): boolean {
  const overrides = resolveOverrides();
  if (overrides.has(flag)) return overrides.get(flag)!;
  return FLAG_DEFAULTS[flag] ?? false;
}

/**
 * Programmatically set a flag override (persists to localStorage).
 * Useful for admin panels and dev tooling.
 */
export function setFlag(flag: FeatureFlag, enabled: boolean): void {
  try {
    localStorage.setItem(`${LS_PREFIX}${flag}`, String(enabled));
  } catch {
    // ignore storage errors
  }
  // Update runtime cache
  resolveOverrides().set(flag, enabled);
}

/**
 * Remove a flag override (reverts to default).
 */
export function clearFlag(flag: FeatureFlag): void {
  try {
    localStorage.removeItem(`${LS_PREFIX}${flag}`);
  } catch {
    // ignore
  }
  resolveOverrides().delete(flag);
}

/**
 * Get all flags with their current resolved values.
 * Useful for admin/debug panels.
 */
export function getAllFlags(): Record<string, { enabled: boolean; source: 'default' | 'localStorage' | 'url' }> {
  const overrides = resolveOverrides();
  const result: Record<string, { enabled: boolean; source: 'default' | 'localStorage' | 'url' }> = {};

  for (const flag of Object.values(FeatureFlag)) {
    let source: 'default' | 'localStorage' | 'url' = 'default';
    let enabled = FLAG_DEFAULTS[flag] ?? false;

    // Check localStorage
    try {
      const lsVal = localStorage.getItem(`${LS_PREFIX}${flag}`);
      if (lsVal !== null) {
        enabled = lsVal === 'true';
        source = 'localStorage';
      }
    } catch { /* ignore */ }

    // Check URL (highest priority)
    try {
      const params = new URLSearchParams(window.location.search);
      const urlVal = params.get(`${URL_PREFIX}${flag}`);
      if (urlVal !== null) {
        enabled = urlVal === '1' || urlVal === 'true';
        source = 'url';
      }
    } catch { /* ignore */ }

    result[flag] = { enabled, source };
  }

  return result;
}

/**
 * Reset the override cache. Call this if you programmatically changed
 * localStorage outside of setFlag/clearFlag.
 */
export function resetFlagCache(): void {
  _overrides = null;
}
