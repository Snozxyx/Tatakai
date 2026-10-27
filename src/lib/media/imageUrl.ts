/// <reference types="vite/client" />

// Cards, avatars and backgrounds revisit the same URLs on every React render.
// Bound retained strings so long feeds cannot grow this cache indefinitely.
const imageUrls = new Map<string, string>();
const IMAGE_URL_CACHE_LIMIT = 512;

/** Public display URLs only. Persist the original URL in the database. */
export function publicImageUrl(value?: string | null, width: number | null = 1920, base?: string): string | undefined {
  if (!value) return value ?? undefined;
  const cacheKey = value.length <= 2048 && (!base || base.length <= 2048)
    ? JSON.stringify([value, String(width), base]) : undefined;
  if (cacheKey) {
    const cached = imageUrls.get(cacheKey);
    if (cached !== undefined) return cached;
  }
  const result = buildPublicImageUrl(value, width, base);
  if (cacheKey) {
    if (imageUrls.size >= IMAGE_URL_CACHE_LIMIT) imageUrls.delete(imageUrls.keys().next().value!);
    imageUrls.set(cacheKey, result);
  }
  return result;
}

function buildPublicImageUrl(value: string, width: number | null, base?: string): string {
  try {
    const url = new URL(value, base);
    const host = url.hostname.toLowerCase();
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return value;
    if (host === 'localhost' || !host.includes('.') || host.endsWith('.localhost') ||
        host.endsWith('.local') || host.endsWith('.internal') || host.includes(':') ||
        /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return value;
    if (host === 'wsrv.nl' || host === 'images.weserv.nl') return value;
    // Signed storage, header-replay proxies and API endpoints must never be shared.
    if (/\/api\//i.test(url.pathname) || /\/storage\/v1\/object\/(?!public\/)/i.test(url.pathname) ||
        [...url.searchParams.keys()].some(key => /token|sign|credential|authorization|password|expires|^sig$|^key$|^auth$|^url$|^referer$/i.test(key))) return value;
    // Keep vectors sharp and never accidentally send video/audio through an image service.
    if (/\.(svg|ico|mp4|webm|m3u8|mpd|mov|mkv|mp3|ogg|wav|m4a)$/i.test(url.pathname)) return value;
    const params = new URLSearchParams({
      url: url.href, output: 'webp', q: '80',
      fit: 'inside', we: '', n: '-1', maxage: '7d', default: '1',
    });
    if (width !== null) params.set('w', String(Math.max(1, Math.min(2560, Math.round(width) || 1920))));
    return `https://wsrv.nl/?${params}`;
  } catch {
    return value;
  }
}

export function optimizedImageUrl(value?: string | null, width: number | null = 1920): string | undefined {
  // Relative assets stay local in development and packaged/offline builds.
  const location = (globalThis as { window?: { location: { href: string } } }).window?.location;
  return publicImageUrl(value, width, import.meta.env.VITE_PACKAGED_BUILD !== 'true' ? location?.href : undefined);
}

/** Recover the source when a caller passes a cached thumbnail into the viewer. */
export function originalImageUrl(value: string): string {
  let original = value;
  for (let depth = 0; depth < 3; depth++) {
    try {
      const url = new URL(original);
      if (!['wsrv.nl', 'images.weserv.nl'].includes(url.hostname)) break;
      const nested = url.searchParams.get('url');
      if (!nested || !/^https?:\/\//i.test(nested)) break;
      original = nested;
    } catch { break; }
  }
  return original;
}

/** Also works for multiple layers, leaving gradients and data URLs intact. */
export function optimizedBackground(value: string): string {
  return value.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (match, _quote, source: string) => {
    const optimized = optimizedImageUrl(source.trim());
    return optimized && optimized !== source.trim() ? `url("${optimized}")` : match;
  });
}
