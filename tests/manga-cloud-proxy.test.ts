import { expect, test } from 'bun:test';
import { buildMobileCloudImageProxyUrl } from '../src/core/player/mobile-cloud-proxy';

test('manga cloud URLs recover the original image and replay CDN headers', () => {
  const url = buildMobileCloudImageProxyUrl({
    imageUrl: 'https://cdn.example/page%201.webp',
    proxiedImageUrl: 'http://127.0.0.1:43210/stream/' + 'a'.repeat(32),
    originalUrl: 'https://cdn.example/page%201.webp',
    headers: { referer: 'https://manga.example/chapter/1', 'user-agent': 'MangaReader/1' },
  });
  const result = new URL(url!);
  expect(result.origin).toBe('https://hoko.tatakai.me');
  expect(result.searchParams.get('type')).toBe('image');
  expect(result.searchParams.get('url')).toBe('https://cdn.example/page%201.webp');
  expect(result.searchParams.get('referer')).toBe('https://manga.example/chapter/1');
  expect(result.searchParams.get('userAgent')).toBe('MangaReader/1');
});

test('offline images and unrecoverable local tokens stay local', () => {
  for (const imageUrl of ['blob:offline-page', 'data:image/png;base64,a', 'file:///page.png', 'asset://page.png', 'mobile-proxy://stream/unknown']) {
    expect(buildMobileCloudImageProxyUrl({ imageUrl })).toBeNull();
  }
  expect(buildMobileCloudImageProxyUrl({ imageUrl: 'https://cdn.example/page.png', proxiedImageUrl: 'blob:downloaded-page' })).toBeNull();
});

test('session and custom-header images retain complete local header replay', () => {
  for (const headers of [{ Cookie: 'session=test' }, { Authorization: 'Bearer test' }, { Origin: 'https://manga.example' }, { 'X-Source-Token': 'test' }]) {
    expect(buildMobileCloudImageProxyUrl({ imageUrl: 'https://cdn.example/page.png', headers })).toBeNull();
  }
});

test('cached hosted image URLs are unwrapped instead of nesting proxies', () => {
  const url = buildMobileCloudImageProxyUrl({
    imageUrl: 'https://hoko.tatakai.me/api/v1/streamingProxy?url=https%3A%2F%2Fcdn.example%2Fpage.png&referer=https%3A%2F%2Fmanga.example',
  });
  const result = new URL(url!);
  expect(result.searchParams.get('url')).toBe('https://cdn.example/page.png');
  expect(result.searchParams.get('referer')).toBe('https://manga.example');
});
