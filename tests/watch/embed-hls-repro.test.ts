import { describe, expect, test } from 'bun:test';
import {
  applyMobileProxyToSource,
  resolveStreamKind,
  setNativeProxyBaseUrl,
} from '../../src/core/extensions/mobile/mobileProxy';

// Exact copies of the classifiers in useCombinedSources.ts
// (mapRawSourcesToStreamingData — not exported, so mirrored here).
const isEmbedSource = (src: any): boolean => {
  const t = String(src.sourceType || src.type || '').toLowerCase();
  if (t === 'custom' || t === 'embed') return true;
  if (typeof src.isEmbed === 'boolean') return src.isEmbed;
  if (t === 'hls' || t === 'mp4') return false;
  return !/\.m3u8($|[?#/])/i.test(String(src.url || ''));
};
const isM3U8Source = (src: any): boolean =>
  !!src.isM3U8 || src.sourceType === 'hls' || /\.m3u8/i.test(String(src.url || ''));

const H = { Referer: 'https://megaplay.buzz/', 'User-Agent': 'Mozilla/5.0' };

function classify(raw: any) {
  const proxied: any = applyMobileProxyToSource({ ...raw }, { tokenize: false });
  return {
    url: String(proxied.url),
    sourceType: proxied.sourceType,
    type: proxied.type,
    isM3U8: proxied.isM3U8,
    isEmbed: proxied.isEmbed,
    isTorrent: proxied.isTorrent,
    mappedEmbed: isEmbedSource(proxied),
    mappedM3U8: isM3U8Source(proxied),
    kind: resolveStreamKind(proxied),
  };
}

describe('hls vs embed classification (mobile local-proxy watch path)', () => {
  test('bare .m3u8 url stays hls, url untouched without tokenize', () => {
    const c = classify({ url: 'https://cdn.example.com/master.m3u8', headers: H, quality: '1080p' });
    expect(c.url).toBe('https://cdn.example.com/master.m3u8');
    expect(c.sourceType).toBe('hls');
    expect(c.mappedEmbed).toBe(false);
    expect(c.mappedM3U8).toBe(true);
  });

  test('explicit sourceType hls with extractor-style url stays hls', () => {
    const c = classify({ url: 'https://mega.example.com/watch/abc123', sourceType: 'hls', headers: H, quality: '1080p' });
    expect(c.sourceType).toBe('hls');
    expect(c.isEmbed).toBe(false);
    expect(c.mappedEmbed).toBe(false);
  });

  test('explicit type hls (no sourceType) with extractor-style url is hls, not embed', () => {
    const c = classify({ url: 'https://mega.example.com/watch/abc123', type: 'hls', headers: H, quality: '1080p' });
    expect(c.sourceType).toBe('hls');
    expect(c.isM3U8).toBe(true);
    expect(c.isEmbed).toBe(false);
    expect(c.mappedEmbed).toBe(false);
    expect(c.mappedM3U8).toBe(true);
  });

  test('explicit isM3U8 with opaque url yields consistent hls flags', () => {
    const c = classify({ url: 'https://mega.example.com/watch/abc123', isM3U8: true, headers: H, quality: '1080p' });
    expect(c.sourceType).toBe('hls');
    expect(c.isM3U8).toBe(true);
    expect(c.isEmbed).toBe(false);
    expect(c.mappedEmbed).toBe(false);
  });

  test('contract custom stays embed', () => {
    const c = classify({ url: 'https://ok.ru/video/123', sourceType: 'custom', headers: H });
    expect(c.mappedEmbed).toBe(true);
    expect(c.kind).toBe('embed');
  });

  test('magnet without sourceType is torrent (never proxied as media)', () => {
    const c = classify({ url: 'magnet:?xt=urn:btih:abc123', title: 'Show S01E01' });
    expect(c.kind).toBe('torrent');
    expect(c.sourceType).toBe('torrent');
    expect((c as any).isTorrent).toBe(true);
    expect(c.mappedEmbed).toBe(false);
  });

  test('tokenize:true still mints tokens for gated hls (reader/downloader path)', () => {
    const out: any = applyMobileProxyToSource(
      { url: 'https://cdn.example.com/master.m3u8', headers: H },
      { tokenize: true },
    );
    expect(String(out.url)).toStartWith('mobile-proxy://stream/');
    expect(String(out.originalUrl)).toBe('https://cdn.example.com/master.m3u8');
    expect(out.sourceType).toBe('hls');
  });

  test('default mobile watch routing tokenizes open HLS without hosted fallback', () => {
    const out: any = applyMobileProxyToSource({
      url: 'https://cdn.example.com/open/master.m3u8',
      sourceType: 'hls',
    });
    expect(String(out.url)).toStartWith('mobile-proxy://stream/');
    expect(out.originalUrl).toBe('https://cdn.example.com/open/master.m3u8');
  });

  test('native loopback urls are never re-registered (originalUrl survives)', () => {
    setNativeProxyBaseUrl('http://127.0.0.1:43127');
    try {
      const once: any = applyMobileProxyToSource(
        { url: 'https://cdn.example.com/master.m3u8', sourceType: 'hls', headers: H },
        { tokenize: true },
      );
      expect(String(once.url)).toStartWith('http://127.0.0.1:43127/stream/');
      const originalUrl = once.originalUrl;
      const twice: any = applyMobileProxyToSource({ ...once }, { tokenize: true });
      expect(String(twice.url)).toBe(String(once.url));
      expect(twice.originalUrl).toBe(originalUrl);
    } finally {
      setNativeProxyBaseUrl(null);
    }
  });
});
