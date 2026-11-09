import { buildProxyCandidateUrls, isLoopbackProxyUrl } from '@/core/player/stream-resolver';
import { isAnyProxyUrl } from '@/core/extensions/mobile/mobileProxy';
import type { PlaybackHeaders, PlaybackSource } from '@/components/video/VideoPlayer.types';

const PROXY_HEADERS = new Set(['referer', 'user-agent', 'origin', 'accept', 'accept-language']);

export function canUseVidstackSource(source: PlaybackSource | undefined, headers?: PlaybackHeaders): boolean {
  if (!source || !/^(https?:|blob:)/i.test(source.url) || ['torrent', 'embed', 'offline'].includes(source.sourceType || '')) return false;
  // Registered proxy URLs already replay all extension headers. A raw URL
  // requiring cookies or authorization still needs the built-in native path.
  return isAnyProxyUrl(source.url) || isLoopbackProxyUrl(source.url)
    || !Object.keys({ ...headers, ...source.headers }).some(name => !PROXY_HEADERS.has(name.toLowerCase()));
}

export function buildVidstackPlaybackUrls(source: PlaybackSource, headers?: PlaybackHeaders): string[] {
  if (isAnyProxyUrl(source.url) || isLoopbackProxyUrl(source.url) || source.sourceType === 'debrid' || !/^https?:/i.test(source.url)) {
    return [source.url];
  }
  const replay = new Map<string, string>();
  for (const values of [headers, source.headers]) {
    for (const [name, value] of Object.entries(values || {})) replay.set(name.toLowerCase(), value);
  }
  const candidates = buildProxyCandidateUrls(source.url, replay.get('referer'), replay.get('user-agent'));
  return candidates.length ? candidates : [source.url];
}

export function getVidstackSourceType(source: PlaybackSource): 'application/x-mpegurl' | 'application/dash+xml' | 'video/webm' | 'video/mp4' {
  const url = source.originalUrl || source.url;
  if (source.isM3U8 || ['hls', 'm3u8'].includes(source.sourceType || '') || /\.m3u8(?:[?#]|$)/i.test(url)) return 'application/x-mpegurl';
  if (source.sourceType === 'dash' || /\.mpd(?:[?#]|$)/i.test(url)) return 'application/dash+xml';
  return /\.webm(?:[?#]|$)/i.test(url) ? 'video/webm' : 'video/mp4';
}
