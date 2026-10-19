import { describe, expect, it } from 'bun:test';
import { selectPreferredSource, parseQualityScore } from '../src/lib/video/preferredSource';

type Source = { url: string; isM3U8?: boolean; quality?: string; server?: string; providerName?: string; providerKey?: string };

describe('selectPreferredSource', () => {
  it('auto keeps the actively selected server entry', () => {
    const sources: Source[] = [
      { url: 'a-720.m3u8', quality: '720p', server: 'zoro' },
      { url: 'b-1080.m3u8', quality: '1080p', server: 'hiAnime' },
    ];
    expect(selectPreferredSource(sources, 'auto')).toBe(sources[0]);
  });

  it('a fixed quality never leaves the explicitly selected server', () => {
    const sources: Source[] = [
      { url: 'a-720.m3u8', quality: '720p', server: 'zoro' },
      { url: 'b-1080.m3u8', quality: '1080p', server: 'hiAnime' },
      { url: 'c-1080p.m3u8', quality: '1080p', server: 'gogo' },
    ];
    // 1080p is closest on other servers — must NOT jump to them.
    expect(selectPreferredSource(sources, '1080p')?.url).toBe('a-720.m3u8');
  });

  it('picks the same-server source with the closest quality tag', () => {
    const sources: Source[] = [
      { url: 'a-360.m3u8', quality: '360p', server: 'zoro' },
      { url: 'a-720.m3u8', quality: '720p', server: 'zoro' },
      { url: 'b-1080.m3u8', quality: '1080p', server: 'hiAnime' },
    ];
    expect(selectPreferredSource(sources, '1080p')?.url).toBe('a-720.m3u8');
    expect(selectPreferredSource(sources, '720p')?.url).toBe('a-720.m3u8');
    expect(selectPreferredSource(sources, '480p')?.url).toBe('a-360.m3u8');
  });

  it('resolves the picked server by providerName/providerKey too', () => {
    const sources: Source[] = [
      { url: 'a-720.m3u8', quality: '720p', providerKey: 'zoro' },
      { url: 'b-1080.m3u8', quality: '1080p', providerName: 'zoro' },
      { url: 'c-1080.m3u8', quality: '1080p', server: 'other' },
    ];
    expect(selectPreferredSource(sources, '1080p')?.url).toBe('b-1080.m3u8');
  });

  it('falls back to the selected source without server metadata', () => {
    const sources: Source[] = [
      { url: 'a-720.m3u8', quality: '720p' },
      { url: 'b-1080.m3u8', quality: '1080p' },
    ];
    expect(selectPreferredSource(sources, '1080p')?.url).toBe('a-720.m3u8');
  });

  it('when nothing is parseable it returns the selected source', () => {
    const sources: Source[] = [
      { url: 'a.m3u8', quality: 'unknown', server: 'zoro' },
      { url: 'b.m3u8', server: 'zoro' },
    ];
    expect(selectPreferredSource(sources, '1080p')?.url).toBe('a.m3u8');
  });

  it('keeps the picked entry on quality ties (stable order)', () => {
    const sources: Source[] = [
      { url: 'a-1080.m3u8', quality: '1080p', server: 'zoro' },
      { url: 'a-1080-alt.m3u8', quality: '1080p', server: 'zoro' },
    ];
    expect(selectPreferredSource(sources, '1080p')?.url).toBe('a-1080.m3u8');
  });

  it('parseQualityScore reads common tags', () => {
    expect(parseQualityScore('1080p')).toBe(1080);
    expect(parseQualityScore('720P HD')).toBe(720);
    expect(parseQualityScore('auto')).toBeNull();
    expect(parseQualityScore(undefined)).toBeNull();
  });
});
