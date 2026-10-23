import { streamMetadata, languageLabel } from './metadata';
import { isDebridDirectUrl } from '@/core/player/debrid-url';

export interface StremioManifest {
  id: string; name: string; version: string; description?: string; logo?: string;
  types: string[]; idPrefixes?: string[];
  resources: Array<string | { name: string; types?: string[]; idPrefixes?: string[] }>;
  behaviorHints?: { configurable?: boolean; configurationRequired?: boolean };
}
export function supportsResource(manifest: StremioManifest, resource: string, type: string, id: string): boolean {
  return manifest.resources.some(entry => {
    const r = typeof entry === 'string' ? { name: entry } : entry;
    const types = r.types || manifest.types;
    const prefixes = r.idPrefixes || manifest.idPrefixes;
    return r.name === resource && types.includes(type) && (!prefixes?.length || prefixes.some(prefix => id.startsWith(prefix)));
  });
}
export function stremioResourceUrl(manifestUrl: string, resource: string, type: string, id: string): string {
  const url = new URL(manifestUrl);
  url.pathname = url.pathname.replace(/\/manifest\.json\/?$/, '') + `/${resource}/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`;
  return url.href;
}
export function normalizeStremioStream(stream: any, providerId: string, providerName: string): any | null {
  const hash = typeof stream.infoHash === 'string' && /^[a-f\d]{40}$/i.test(stream.infoHash) ? stream.infoHash : null;
  const trackers = Array.isArray(stream.sources) ? stream.sources.filter((v: unknown) => typeof v === 'string' && v.startsWith('tracker:')).map((v: string) => '&tr=' + encodeURIComponent(v.slice(8))).join('') : '';
  const url = hash ? `magnet:?xt=urn:btih:${hash}${trackers}` : stream.url;
  if (typeof url !== 'string' || !/^(https?:\/\/|magnet:\?)/i.test(url)) return null;
  return { url, originalUrl: url, providerKey: providerId, providerName, source: providerName,
    ...streamMetadata(stream), title: stream.description || stream.title, headers: stream.behaviorHints?.proxyHeaders?.request || {},
      sourceType: hash ? 'torrent' : isDebridDirectUrl(url) ? 'debrid' : /\.m3u8(?:\?|$)/i.test(url) ? 'hls' : 'mp4', isTorrent: !!hash,
    magnetLink: hash ? url : undefined, infoHash: hash || undefined,
    fileIndex: Number.isInteger(stream.fileIdx) && stream.fileIdx >= 0 ? stream.fileIdx : undefined,
    subtitles: (stream.subtitles || []).map((s: any) => ({ url: s.url, language: s.lang, lang: s.lang, label: languageLabel(s.lang) })),
  };
}
