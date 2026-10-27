import { isAnyProxyUrl, resolveMobileProxy } from '@/core/extensions/mobile/mobileProxy';
import { isDebridDirectUrl, isLoopbackProxyUrl } from './stream-resolver';
import { isWatchPartyShareUrl } from './watch-party-url';
import { isServerMediaUrl } from './server-media-url';

export const HOKO_STREAM_PROXY = 'https://hoko.tatakai.me/api/v1/streamingProxy';

/** Build only; callers must obtain consent before requesting this URL. */
export function buildMobileCloudProxyUrl(source: {
  url: string; originalUrl?: string; sourceType?: string; headers?: Record<string, string>;
}, headers: Record<string, string | undefined> = {}): string | null {
  if (['torrent', 'debrid', 'offline', 'embed'].includes(source.sourceType || '')) return null;
  const entry = resolveMobileProxy(source.url);
  let upstream = entry?.url || source.originalUrl || source.url;
  const replay = { ...entry?.headers, ...headers, ...source.headers };
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
