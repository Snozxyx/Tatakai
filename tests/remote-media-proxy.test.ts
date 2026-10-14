import { it, expect } from 'bun:test';
import { proxyRemoteSources } from '../src/core/extensions/remote/media';

it('keeps playable sources when one subtitle proxy fails and rejects invalid source URLs', async () => {
  const previous = (globalThis as any).window;
  (globalThis as any).window = { electron: { proxyExtensionSource: async ({ url }: any) => { if (url.includes('broken')) throw Error('Subtitle unavailable'); return url; } } };
  try {
    const sources = await proxyRemoteSources([{ url: 'https://fixture.test/video.m3u8', headers: { Referer: 'fixture' }, subtitles: [
      { url: 'https://fixture.test/broken.vtt' }, { url: 'https://fixture.test/working.vtt' },
    ] }, { url: 'javascript:bad' }]);
    expect(sources).toHaveLength(1); expect(sources[0].subtitles).toHaveLength(1); expect(sources[0].subtitles[0].url).toContain('working');
  } finally { if (previous === undefined) delete (globalThis as any).window; else (globalThis as any).window = previous; }
});

it('repairs legacy loopback media URLs using the current native proxy', async () => {
  const previous = (globalThis as any).window;
  const calls: any[] = [];
  (globalThis as any).window = { electron: { proxyExtensionSource: async (input: any) => { calls.push(input); return 'http://127.0.0.1:1234/stream/token'; } } };
  try {
    const { proxyCustomSources, unwrapLegacyMediaUrl } = await import('../src/core/extensions/remote/media');
    const url = 'http://127.0.0.1:8099/?url=https%3A%2F%2Ffixture.test%2Fvideo.mp4&password=legacy';
    const sources = await proxyCustomSources([{ url, sourceType: 'mp4' }]);
    expect(calls).toEqual([{ url: 'https://fixture.test/video.mp4', headers: {} }]);
    expect(sources[0].url).toContain('/stream/token');
    expect(sources[0].originalUrl).toBe('https://fixture.test/video.mp4');
    expect(unwrapLegacyMediaUrl('https://public.test/?url=https://fixture.test/video.mp4&password=legacy')).toContain('public.test');
    expect(unwrapLegacyMediaUrl('http://127.0.0.1:1234/stream/token')).toContain('/stream/token');
  } finally { if (previous === undefined) delete (globalThis as any).window; else (globalThis as any).window = previous; }
});

it('repairs legacy URLs returned by Stremio custom streams without request headers', async () => {
  const previous = (globalThis as any).window;
  const calls: any[] = [];
  (globalThis as any).window = { electron: { proxyExtensionSource: async (input: any) => { calls.push(input); return 'http://127.0.0.1:1234/stream/token'; } } };
  try {
    const sources = await proxyRemoteSources([{ url: 'http://127.0.0.1:8099/?url=https%3A%2F%2Ffixture.test%2Fvideo.m3u8&password=legacy', sourceType: 'mp4' }]);
    expect(calls[0].url).toBe('https://fixture.test/video.m3u8');
    expect(sources[0].sourceType).toBe('hls');
    expect(sources[0].url).toContain('/stream/token');
  } finally { if (previous === undefined) delete (globalThis as any).window; else (globalThis as any).window = previous; }
});
