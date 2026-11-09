import { expect, test } from 'bun:test';
import { buildVidstackPlaybackUrls, canUseVidstackSource, getVidstackSourceType } from '../src/lib/video/vidstackSource';

test('registered extension streams keep their URL and full header replay', () => {
  const source = { url: 'http://127.0.0.1:8099/stream/fixture', isM3U8: true, headers: { Cookie: 'fixture-session' } };
  expect(canUseVidstackSource(source)).toBe(true);
  expect(buildVidstackPlaybackUrls(source)).toEqual([source.url]);
  expect(canUseVidstackSource({ ...source, url: 'https://cdn.example/episode.m3u8' })).toBe(false);
});

test('extension header overrides are case insensitive when building playback proxies', () => {
  const source = { url: 'https://cdn.example/episode.m3u8', isM3U8: true, headers: { referer: 'https://provider.example/', 'user-agent': 'ExtensionPlayer' } };
  const urls = buildVidstackPlaybackUrls(source, { Referer: 'https://old.example/', 'User-Agent': 'OldPlayer' });
  expect(new URL(urls[0]).searchParams.get('referer')).toBe('https://provider.example/');
  expect(new URL(urls[0]).searchParams.get('userAgent')).toBe('ExtensionPlayer');
});

test('opaque native streams and torrents keep the built-in path', () => {
  expect(canUseVidstackSource({ url: 'mobile-proxy://stream/fixture', isM3U8: true })).toBe(false);
  expect(canUseVidstackSource({ url: 'https://cdn.example/episode.mp4', isM3U8: false, sourceType: 'torrent' })).toBe(false);
});

test('opaque HTTP proxy paths retain the upstream HLS or DASH media type', () => {
  const source = { url: 'http://127.0.0.1:8099/stream/fixture', isM3U8: false };
  expect(getVidstackSourceType({ ...source, originalUrl: 'https://cdn.example/episode.m3u8?token=fixture' })).toBe('application/x-mpegurl');
  expect(getVidstackSourceType({ ...source, sourceType: 'dash' })).toBe('application/dash+xml');
  expect(getVidstackSourceType({ ...source, originalUrl: 'https://cdn.example/episode.webm' })).toBe('video/webm');
});
