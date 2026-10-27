import { expect, mock, test } from 'bun:test';
mock.module('../src/core/mobile/localProxyNative', () => ({ mirrorTokenToNative() {} }));
const { buildMobileCloudProxyUrl, HOKO_STREAM_PROXY } = await import('../src/core/player/mobile-cloud-proxy');
const { registerMobileSource, setNativeProxyBaseUrl } = await import('../src/core/extensions/mobile/mobileProxy');

test('unwraps device-local tokens and preserves upstream header metadata', () => {
  setNativeProxyBaseUrl('http://127.0.0.1:45454');
  const url = registerMobileSource({ url: 'https://cdn.example/master.m3u8?token=one&part=two', headers: { Referer: 'https://player.example/', 'User-Agent': 'Test Player' } });
  const cloud = new URL(buildMobileCloudProxyUrl({ url })!);
  expect(cloud.origin + cloud.pathname).toBe(HOKO_STREAM_PROXY);
  expect(cloud.searchParams.get('url')).toBe('https://cdn.example/master.m3u8?token=one&part=two');
  expect(cloud.searchParams.get('referer')).toBe('https://player.example/');
  expect(cloud.searchParams.get('userAgent')).toBe('Test Player');
});

test('recovers expired tokens only with an upstream URL', () => {
  const dead = 'http://127.0.0.1:40000/stream/' + 'a'.repeat(32);
  expect(buildMobileCloudProxyUrl({ url: dead })).toBeNull();
  expect(new URL(buildMobileCloudProxyUrl({ url: dead, originalUrl: 'https://cdn.example/video.mp4' })!).searchParams.get('url')).toBe('https://cdn.example/video.mp4');
});

test('does not send offline files, debrid or torrents through a remote server', () => {
  for (const url of ['file:///offline.mp4', 'blob:https://tatakai.me/a', 'http://127.0.0.1:40000/video.mp4', 'https://download.real-debrid.com/stream.mp4', 'magnet:?xt=urn:btih:test']) {
    expect(buildMobileCloudProxyUrl({ url })).toBeNull();
  }
  for (const sourceType of ['torrent', 'debrid', 'offline', 'embed']) {
    expect(buildMobileCloudProxyUrl({ url: 'https://cdn.example/video.mp4', sourceType })).toBeNull();
  }
});

test('unwraps cached hosted proxy rows instead of nesting cloud proxies', () => {
  const cloud = new URL(buildMobileCloudProxyUrl({ url: HOKO_STREAM_PROXY + '?url=https%3A%2F%2Fcdn.example%2Fmaster.m3u8&referer=https%3A%2F%2Fplayer.example%2F' })!);
  expect(cloud.searchParams.get('url')).toBe('https://cdn.example/master.m3u8');
  expect(cloud.searchParams.get('referer')).toBe('https://player.example/');
});
