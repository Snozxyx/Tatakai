/**
 * Toko stream provider shape tests.
 *
 * Imports each provider module from the Toko extension source and asserts it
 * exports a default object with the required StreamProvider surface (`name` +
 * `single()`). Also sanity-checks the result mapping with a stubbed
 * __tatakai_fetch__ so that no real network is used.
 */
import { describe, it, expect, vi } from 'vitest';

// Providers are ESM TypeScript; import the source directly.
import reanime from '../../extension/toko/src/providers/stream/reanime.js';
import animepahe from '../../extension/toko/src/providers/stream/animepahe.js';
import anikoto from '../../extension/toko/src/providers/stream/anikoto.js';
import mkissa from '../../extension/toko/src/providers/stream/mkissa.js';
import anizone from '../../extension/toko/src/providers/stream/anizone.js';
import animesalt from '../../extension/toko/src/providers/stream/animesalt.js';
import senshi from '../../extension/toko/src/providers/stream/senshi.js';
import watchaw from '../../extension/toko/src/providers/stream/watchanimeworld.js';
import desidub from '../../extension/toko/src/providers/stream/desidub.js';
import hindidubbed from '../../extension/toko/src/providers/stream/hindidubbed.js';
import aniworld from '../../extension/toko/src/providers/stream/aniworld.js';
import animeya from '../../extension/toko/src/providers/stream/animeya.js';
import toonstream from '../../extension/toko/src/providers/stream/toonstream.js';
import fouranime from '../../extension/toko/src/providers/stream/fouranime.js';
import animelok from '../../extension/toko/src/providers/stream/animelok.js';

const providers = {
  reanime, animepahe, anikoto, mkissa, anizone, animesalt, senshi,
  watchanimeworld: watchaw, desidub, hindidubbed, aniworld, animeya,
  toonstream, fouranime, animelok,
};

const VALID_SOURCE_TYPES = new Set(['torrent', 'hls', 'mp4', 'custom', undefined]);

describe('Toko stream providers', () => {
  for (const [key, provider] of Object.entries(providers)) {
    describe(key, () => {
      it('exposes a non-empty string name', () => {
        expect(typeof provider.name).toBe('string');
        expect(provider.name.length).toBeGreaterThan(0);
      });

      it('implements single() returning a Promise', () => {
        expect(typeof provider.single).toBe('function');
        const ret = provider.single({
          anilistId: 21, titles: ['One Piece'], episode: 1, resolution: '1080p',
        } as any);
        expect(ret).toBeInstanceOf(Promise);
        // Swallow network errors — we only care that it returns a promise.
        ret.catch(() => {});
      });
    });
  }

  it('Reanime maps the /api/flix server shape to SourceResult[]', async () => {
    const flixResponse = {
      success: true,
      servers: [
        { $id: 'hd1-x-sub', serverName: 'HD-1', dataLink: 'https://flixcloud.cc/e/abc?v=1', dataType: 'sub' },
        { $id: 'hd1-x-dub', serverName: 'HD-1', dataLink: 'https://flixcloud.cc/e/abc?v=1', dataType: 'dub' },
      ],
    };
    const fetchStub = vi.fn(async (url: string) => {
      if (String(url).includes('/api/flix/')) {
        return new Response(JSON.stringify(flixResponse), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      // FlixCloud embed returns a plain page with no m3u8 → resolver returns null,
      // so the provider falls back to the embed url as a 'custom' source.
      return new Response('<html><body>player</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    });
    // Temporarily install the global the module reads via `declare const`.
    (globalThis as any).__tatakai_fetch__ = fetchStub;

    const results = await reanime.single({
      anilistId: 21, titles: ['One Piece'], episode: 1, resolution: '1080p',
    } as any);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    const first = results[0];
    expect(first.source).toBe('reanime');
    expect(first.url).toMatch(/^https?:\/\//);
    expect(VALID_SOURCE_TYPES.has(first.sourceType)).toBe(true);
    expect(first.headers).toBeDefined();
    expect(Array.isArray(first.subtitles)).toBe(true);

    fetchStub.mockRestore();
    delete (globalThis as any).__tatakai_fetch__;
  });

  it('detectSourceType classifies m3u8/mp4/custom correctly', async () => {
    const mod = await import('../../extension/toko/src/utils/quality.js');
    expect(mod.detectSourceType('https://cdn/x.m3u8')).toBe('hls');
    expect(mod.detectSourceType('https://cdn/x.mp4')).toBe('mp4');
    expect(mod.detectSourceType('https://embed/abc')).toBe('custom');
  });
});
