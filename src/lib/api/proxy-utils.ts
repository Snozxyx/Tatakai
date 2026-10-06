import { getActiveStreamingProxySnapshot } from '@/hooks/user/useProxySettings';
import { resolveBackendOrigin } from '@/lib/api/backendOrigin';
import { isMobileProxyUrl } from '@/core/extensions/mobile/mobileProxy';
import { downgradePosterForDataSaver, isDataSaverEnabled } from '@/lib/mobile/dataSaver';

const STREAM_PROXY_PASSWORD = String(
  import.meta.env.VITE_STREAM_PROXY_PASSWORD || import.meta.env.VITE_PROXY_PASSWORD || ''
).trim();

// Hardcoding `localhost:3000` here meant every proxied playback URL pointed at a
// server nobody runs (ERR_CONNECTION_REFUSED in the renderer) while the actual
// proxy address sat unused in VITE_STREAM_PROXY_URL. Prefer the configured proxy;
// keep the local default only as the last resort.
const STREAM_PROXY_BASE = String(
  import.meta.env.VITE_STREAM_PROXY_URL ||
    import.meta.env.VITE_PROXY_NODE_URL ||
    import.meta.env.VITE_PROXY_CF_URL ||
    'https://hoko.tatakai.me/api/v1/streamingProxy'
).trim();

// Backend origin for subtitle proxying — avoids CORS issues with the external
// streaming proxy (the local API sets Access-Control-Allow-Origin: * so subtitle
// <track> elements always load). Resolved via the shared helper (VITE_BACKEND_ORIGIN
// → origin of VITE_TATAKAI_API_URL → page origin) so the desktop app:// build hits
// api.tatakai.me instead of a dead localhost fallback.
const LOCAL_API_BASE = (
  resolveBackendOrigin() ||
  String(import.meta.env.VITE_TATAKAI_API_URL || '').trim().replace(/\/api\/v3\/?$/, '')
);

function isLocalLike(url: string): boolean {
  return (
    url.startsWith('asset://') ||
    url.startsWith('file://') ||
    url.startsWith('blob:') ||
    url.startsWith('data:') ||
    url.includes('asset.localhost') ||
    url.includes('127.0.0.1') ||
    url.includes('localhost:')
  );
}

function unwrapProxyUrl(rawUrl: string): string {
  let current = String(rawUrl || '').trim();

  for (let index = 0; index < 3; index += 1) {
    const snapshot = readProxyQuerySnapshot(current);
    const nestedUrl = String(snapshot.streamUrl || '').trim();
    if (!nestedUrl) break;
    current = nestedUrl;
  }

  return current;
}

export function getProxiedImageUrl(rawUrl?: string): string {
  const url = String(rawUrl || '').trim();
  if (!url) return '/placeholder.svg';
  return url;
}

/**
 * Get the highest quality image URL available
 * Tries to upgrade to large_image_url if possible
 * Used for trending, spotlight, and hero sections
 */
export function getHighQualityImage(rawUrl?: string, _anilistId?: number): string {
  const url = String(rawUrl || '').trim();
  if (!url) return '/placeholder.svg';

  // Data-saver: serve the medium variant instead of upgrading to large.
  try {
    if (isDataSaverEnabled()) return downgradePosterForDataSaver(url);
  } catch {
    /* storage unavailable — fall through to the upgrade path */
  }

  // Upgrade to larger versions if available
  return url
    .replace('/cover/small/', '/cover/large/')
    .replace('/cover/medium/', '/cover/large/')
    .replace('/banner/small/', '/banner/large/')
    .replace('/banner/medium/', '/banner/large/')
    // Also try to upgrade Jikan URLs to webp large format
    .replace(/\/jpg\/large_image_url/, '/webp/large_image_url')
    .replace(/image_url$/, 'large_image_url');
}

/**
 * Get high-quality poster specifically - prefers large images
 * Used for cards where we show the cover art
 */
export function getHighQualityPoster(rawUrl?: string, anilistId?: number): string {
  const url = String(rawUrl || '').trim();
  if (!url) return '/placeholder.svg';
  try {
    if (isDataSaverEnabled()) return downgradePosterForDataSaver(url);
  } catch {
    /* storage unavailable — fall through to the upgrade path */
  }
  return url
    .replace('/cover/medium/', '/cover/large/')
    .replace('/banner/small/', '/banner/large/')
    .replace('/banner/medium/', '/banner/large/');
}

// Debrid CDN links are IP-pinned/expiring: the proxy's IP != the device IP, so
// wrapping them returns 403 and leaks the token via the proxy logs. Play direct.
const DEBRID_DIRECT_HOST_SUFFIXES = [
  'real-debrid.com',
  'torbox.app',
  'torboxcdn.com',
];

export function isDebridDirectUrl(value: string): boolean {
  try {
    const host = new URL(String(value || '')).hostname.toLowerCase();
    return DEBRID_DIRECT_HOST_SUFFIXES.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function buildProxyUrl(rawUrl: string, referer?: string, userAgent?: string, type: 'video' | 'subtitle' = 'video'): string {
  const url = unwrapProxyUrl(rawUrl);
  // Already the in-app proxy (mobile token, desktop loopback): wrapping it in
  // the remote proxy would strip the replay headers that make it work.
  if (isMobileProxyUrl(url)) return url;
  if (!url || isLocalLike(url) || !/^https?:/i.test(url)) return url;
  // Debrid direct links must never go through the shared proxy.
  if (type === 'video' && isDebridDirectUrl(url)) return url;

  const snapshot = getActiveStreamingProxySnapshot();
  const base = snapshot.url || STREAM_PROXY_BASE;
  const password = snapshot.password !== undefined ? snapshot.password : STREAM_PROXY_PASSWORD;

  const params = new URLSearchParams({ url, type });
  if (referer) params.set('referer', referer);
  if (userAgent) params.set('userAgent', userAgent);
  if (password) params.set('password', password);
  return `${base}?${params.toString()}`;
}

export function getProxiedVideoUrl(rawUrl: string, referer?: string, userAgent?: string): string {
  return buildProxyUrl(rawUrl, referer, userAgent, 'video');
}

export function getProxiedSubtitleUrl(rawUrl: string, referer?: string, userAgent?: string): string {
  const url = unwrapProxyUrl(rawUrl);
  // In-app proxy tracks resolve natively with header replay (see
  // MobileVideoPlayer); routing them through the backend would lose the token.
  if (isMobileProxyUrl(url)) return url;
  if (!url || isLocalLike(url) || !/^https?:/i.test(url)) return url;

  // Route subtitles through the local API (/api/proxy/subtitle) which sets
  // Access-Control-Allow-Origin: * — avoids the CORS block that happens when
  // the browser loads <track> elements directly from the external streaming proxy.
  const params = new URLSearchParams({ url });
  if (referer) params.set('referer', referer);
  if (userAgent) params.set('userAgent', userAgent);
  return `${LOCAL_API_BASE}/api/proxy/subtitle?${params.toString()}`;
}

/**
 * Route a small public JSON API (waifu.im / nekosia.cat) through the local API's
 * /api/proxy/json passthrough. Direct cross-origin fetches to these hosts get
 * blocked (403/CORS) from the desktop renderer and spam the console; the proxy
 * makes the request server-side and returns the JSON with Access-Control-Allow-Origin: *.
 */
export function getProxiedJsonUrl(rawUrl: string): string {
  const url = String(rawUrl || '').trim();
  if (!url || !/^https?:/i.test(url)) return url;
  return `${LOCAL_API_BASE}/api/proxy/json?url=${encodeURIComponent(url)}`;
}

export function readProxyQuerySnapshot(rawUrl: string): {
  streamUrl?: string;
  referer?: string;
  userAgent?: string;
  password?: string;
} {
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    return {
      streamUrl: parsed.searchParams.get('url') || undefined,
      referer: parsed.searchParams.get('referer') || undefined,
      userAgent: parsed.searchParams.get('userAgent') || undefined,
      password: parsed.searchParams.get('password') || undefined,
    };
  } catch {
    return {};
  }
}

