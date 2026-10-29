import { isAnyProxyUrl, resolveMobileProxy } from '@/core/extensions/mobile/mobileProxy';
import { isDebridDirectUrl, isLoopbackProxyUrl } from './stream-resolver';
import { isWatchPartyShareUrl } from './watch-party-url';
import { isServerMediaUrl } from './server-media-url';

export const HOKO_STREAM_PROXY = 'https://hoko.tatakai.me/api/v1/streamingProxy';

/** Build only; callers honor the mobile cloud-proxy preference before use. */
export function buildMobileCloudProxyUrl(source: {
  url: string; originalUrl?: string; sourceType?: string; headers?: Record<string, string>;
}, headers: Record<string, string | undefined> = {}, resourceType: 'video' | 'image' = 'video'): string | null {
  if (['torrent', 'debrid', 'offline', 'embed'].includes(source.sourceType || '')) return null;
  const entry = resolveMobileProxy(source.url);
  let upstream = entry?.url || source.originalUrl || source.url;
  const replay = { ...entry?.headers, ...headers, ...source.headers };
  // The hosted endpoint exposes Referer and User-Agent replay. Manga sources
  // with session/custom headers must retain their complete local replay path.
  if (resourceType === 'image' && Object.entries(replay).some(([key, value]) =>
    value && !['referer', 'user-agent', 'accept', 'accept-language'].includes(key.toLowerCase()),
  )) return null;
  try {
    let parsed = new URL(upstream);
    // Recover the upstream of an older cached hosted-proxy row.
    if (parsed.pathname.endsWith('/streamingProxy') && parsed.searchParams.has('url')) {
      replay.Referer ||= parsed.searchParams.get('referer') || undefined;
      replay['User-Agent'] ||= parsed.searchParams.get('userAgent') || undefined;
      upstream = parsed.searchParams.get('url')!;
      parsed = new URL(upstream);
    }
    if (!/^https?:$/.test(parsed.protocol) || isAnyProxyUrl(upstream) || isLoopbackProxyUrl(upstream)
      || isDebridDirectUrl(upstream) || isWatchPartyShareUrl(upstream) || isServerMediaUrl(upstream)) return null;
    const proxy = new URL(HOKO_STREAM_PROXY);
    proxy.searchParams.set('url', parsed.href);
    if (resourceType === 'image') proxy.searchParams.set('type', 'image');
    const header = (name: string) => Object.entries(replay).find(([key]) => key.toLowerCase() === name)?.[1];
    const referer = header('referer');
    const userAgent = header('user-agent');
    if (referer) proxy.searchParams.set('referer', referer);
    if (userAgent) proxy.searchParams.set('userAgent', userAgent);
    const password = String(import.meta.env.VITE_STREAM_PROXY_PASSWORD || import.meta.env.VITE_PROXY_PASSWORD || '').trim();
    if (password) proxy.searchParams.set('password', password);
    return proxy.href;
  } catch { return null; }
}

export function buildMobileCloudImageProxyUrl(page: {
  imageUrl: string; proxiedImageUrl?: string | null; originalUrl?: string | null;
  headers?: Record<string, string> | null;
}): string | null {
  const url = page.proxiedImageUrl || page.imageUrl;
  // Downloaded pages can retain their remote imageUrl alongside a blob/file
  // override. Use the downloaded bytes instead of fetching the original again.
  if (!/^(https?:|mobile-proxy:)/i.test(url)) return null;
  return buildMobileCloudProxyUrl({
    url,
    originalUrl: page.originalUrl || page.imageUrl,
    headers: page.headers || undefined,
  }, {}, 'image');
}
