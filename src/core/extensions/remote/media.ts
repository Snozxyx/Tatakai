import { Capacitor } from '@capacitor/core';
import { isDebridDirectUrl } from '@/core/player/debrid-url';

export function unwrapLegacyMediaUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.pathname !== '/' || !parsed.searchParams.has('password')) return url;
    const target = parsed.searchParams.get('url');
    if (target && /^https?:\/\//i.test(target)) return target;
  } catch {}
  return url;
}

export async function proxyCustomSources(sources: any[]): Promise<any[]> {
  return Promise.all(sources.map(async source => {
    if (source.sourceType === 'custom' || source.isEmbed || !source.url) return source;
    const target = unwrapLegacyMediaUrl(source.url);
    if (target === source.url) return source;
    return { ...source, url: await proxyRemoteUrl(target, source.headers || {}, true), originalUrl: target };
  }));
}

export async function proxyRemoteUrl(url: string, headers: Record<string, string> = {}, force = false): Promise<string> {
  const target = unwrapLegacyMediaUrl(url);
  force ||= target !== url; url = target;
  if (isDebridDirectUrl(url)) return url;
  if (!/^https?:\/\//i.test(url) || (!force && !Object.keys(headers).length)) return url;
  const proxy = (window as any).electron?.proxyExtensionSource;
  if (proxy) return await proxy({ url, headers });
  if (Capacitor.isNativePlatform()) {
    const { registerMobileSource } = await import('../mobile/mobileProxy');
    return registerMobileSource({ url, headers });
  }
  return url;
}

export async function proxyRemoteSources(sources: any[]): Promise<any[]> {
  const settled = await Promise.allSettled(sources.map(async source => {
    if (typeof source.url !== 'string' || !/^(https?:\/\/|magnet:\?)/i.test(source.url)) throw Error('Invalid source URL');
    const tracks = await Promise.allSettled((source.subtitles || []).filter((track: any) => typeof track.url === 'string' && /^https?:\/\//i.test(track.url)).map(async (track: any) => ({ ...track,
      url: await proxyRemoteUrl(track.url, track.headers || source.headers, source.forceProxy === true), originalUrl: unwrapLegacyMediaUrl(track.url),
    })));
    const original = unwrapLegacyMediaUrl(source.originalUrl || source.url);
    return { ...source, originalUrl: original,
      ...(unwrapLegacyMediaUrl(source.url) !== source.url ? { sourceType: /\.m3u8(?:\?|$)/i.test(original) ? 'hls' : 'mp4' } : {}),
      ...(isDebridDirectUrl(original) ? { sourceType: 'debrid' } : {}),
      url: await proxyRemoteUrl(source.url, source.headers, source.forceProxy === true),
      subtitles: tracks.flatMap(r => r.status === 'fulfilled' ? [r.value] : []),
    };
  }));
  return settled.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
}
