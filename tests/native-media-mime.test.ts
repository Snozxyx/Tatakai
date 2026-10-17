import { expect, test } from 'bun:test';
import { nativeMediaMime } from '../src/core/player/mobile/mediaMime';
test('proxied HLS and DASH keep the explicit transport instead of being parsed as progressive files', () => {
  const proxy = 'http://127.0.0.1:43127/stream/12345678901234567890123456789012';
  expect(nativeMediaMime(proxy, 'application/x-mpegURL')).toBe('application/x-mpegURL');
  expect(nativeMediaMime(proxy, 'application/dash+xml')).toBe('application/dash+xml');
});
test('original playlist URLs infer their transport while direct files keep normal sniffing', () => {
  expect(nativeMediaMime('https://example.test/master.M3U8?auth=token')).toBe('application/x-mpegURL');
  expect(nativeMediaMime('https://example.test/video.mpd')).toBe('application/dash+xml');
  expect(nativeMediaMime('https://example.test/movie.mp4')).toBeUndefined();
  expect(nativeMediaMime('https://example.test/movie.mkv')).toBeUndefined();
});
