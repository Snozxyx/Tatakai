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
    'http://localhost:3000/api/v1/streamingProxy'
).trim();

// Local API base for subtitle proxying — avoids CORS issues with the external streaming proxy.
// The local API sets Access-Control-Allow-Origin: * so subtitle <track> elements always load.
const LOCAL_API_BASE = String(
  import.meta.env.VITE_TATAKAI_API_URL || 'http://localhost:8090/api/v3'
).trim().replace(/\/api\/v3\/?$/, '');

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
  return url
    .replace('/cover/medium/', '/cover/large/')
    .replace('/banner/small/', '/banner/large/')
    .replace('/banner/medium/', '/banner/large/');
}

function buildProxyUrl(rawUrl: string, referer?: string, userAgent?: string, type: 'video' | 'subtitle' = 'video'): string {
  const url = unwrapProxyUrl(rawUrl);
  if (!url || isLocalLike(url) || !/^https?:/i.test(url)) return url;

  const base = STREAM_PROXY_BASE;
  const params = new URLSearchParams({ url, type });
  if (referer) params.set('referer', referer);
  if (userAgent) params.set('userAgent', userAgent);
  if (STREAM_PROXY_PASSWORD) params.set('password', STREAM_PROXY_PASSWORD);
  return `${base}?${params.toString()}`;
}

export function getProxiedVideoUrl(rawUrl: string, referer?: string, userAgent?: string): string {
  return buildProxyUrl(rawUrl, referer, userAgent, 'video');
}

export function getProxiedSubtitleUrl(rawUrl: string, referer?: string, userAgent?: string): string {
  const url = unwrapProxyUrl(rawUrl);
  if (!url || isLocalLike(url) || !/^https?:/i.test(url)) return url;

  // Route subtitles through the local API (/api/proxy/subtitle) which sets
  // Access-Control-Allow-Origin: * — avoids the CORS block that happens when
  // the browser loads <track> elements directly from the external streaming proxy.
  const params = new URLSearchParams({ url });
  if (referer) params.set('referer', referer);
  if (userAgent) params.set('userAgent', userAgent);
  return `${LOCAL_API_BASE}/api/proxy/subtitle?${params.toString()}`;
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

