import { expect, mock, test } from 'bun:test';
const registrations: Array<{ token: string; url: string; headers: unknown }> = [];
mock.module('../src/core/mobile/localProxyNative', () => ({ mirrorTokenToNative: (token: string, url: string, headers: unknown) => registrations.push({ token, url, headers }) }));
const proxy = await import('../src/core/extensions/mobile/mobileProxy');
proxy.setNativeProxyBaseUrl('http://127.0.0.1:45259');

test('restores old-port video and subtitle tokens without nesting local URLs', () => {
  const restored = proxy.applyMobileProxyToSource({
    url: 'http://127.0.0.1:43047/stream/' + 'a'.repeat(32), originalUrl: 'https://cdn.example/master.m3u8',
    sourceType: 'hls', headers: { Referer: 'https://player.example/' },
    subtitles: [{ url: 'http://127.0.0.1:43047/stream/' + 'b'.repeat(32), originalUrl: 'https://cdn.example/en.vtt', headers: { Cookie: 'subtitle=session' } }],
  });
  expect(restored.url).toStartWith('http://127.0.0.1:45259/stream/');
  expect(restored.subtitles[0].url).toStartWith('http://127.0.0.1:45259/stream/');
  expect(proxy.resolveMobileProxy(restored.url)?.url).toBe('https://cdn.example/master.m3u8');
  expect(proxy.resolveMobileProxy(restored.subtitles[0].url)?.headers.Cookie).toBe('subtitle=session');
  expect(proxy.applyMobileProxyToSource(restored).url).toBe(restored.url);
  expect(registrations.every((item) => !item.url.includes('127.0.0.1'))).toBe(true);
});

test('drops an unrecoverable cached token instead of requesting the previous server', () => {
  const restored = proxy.applyMobileProxyToSource({ url: 'http://127.0.0.1:43047/stream/' + 'c'.repeat(32), sourceType: 'hls' });
  expect(restored.url).toBe('');
});
test('moves hosted-proxy cache rows to local header replay', () => {
  const restored = proxy.applyMobileProxyToSource({ url: 'https://hoko.tatakai.me/api/v1/streamingProxy?url=https%3A%2F%2Fcdn.example%2Fmaster.m3u8&referer=https%3A%2F%2Fplayer.example%2F', sourceType: 'hls' });
  const upstream = proxy.resolveMobileProxy(restored.url);
  expect(upstream?.url).toBe('https://cdn.example/master.m3u8');
  expect(upstream?.headers.Referer).toBe('https://player.example/');
});
