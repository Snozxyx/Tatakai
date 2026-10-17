import { describe, expect, test } from 'bun:test';
import { parseM3U } from '../src/core/iptv/m3uParser';
describe('IPTV playlists', () => {
  test('retains metadata, relative URLs and request headers', () => {
    const items = parseM3U('\uFEFF#EXTM3U\r\n#EXTINF:-1 tvg-id="news" tvg-logo="https://example.com/logo.png" group-title="News, World",World News\r\n#EXTVLCOPT:http-user-agent=Tatakai\r\n#EXTHTTP:{"Referer":"https://example.com/"}\r\n/channels/news.m3u8', 'https://example.com/list.m3u');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'World News', tvgId: 'news', group: 'News, World', url: 'https://example.com/channels/news.m3u8', headers: { 'User-Agent': 'Tatakai', Referer: 'https://example.com/' } });
  });
  test('rejects HLS manifests rather than importing segments as channels', () => expect(() => parseM3U('#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\na.ts', 'https://example.com')).toThrow('HLS'));
  test('skips invalid URLs and preserves inline headers', () => {
    const result = parseM3U('#EXTM3U\n#EXTINF:-1,Bad\nfile:///etc/passwd\n#EXTINF:-1,Good\nhttps://example.com/live|User-Agent=TV&Referer=https%3A%2F%2Fexample.com');
    expect(result).toHaveLength(1); expect(result[0].headers).toEqual({ 'User-Agent': 'TV', Referer: 'https://example.com' });
  });
  test('does not leak directives between channels', () => {
    const result = parseM3U('#EXTINF:-1,A\n#EXTHTTP:{"Authorization":"Bearer a"}\nhttps://example.com/a\n#EXTINF:-1,B\nhttps://example.com/b');
    expect(result[1].headers).toEqual({});
  });
});
