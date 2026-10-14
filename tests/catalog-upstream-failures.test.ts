import { it, expect, mock, afterEach } from 'bun:test';
const originalFetch = globalThis.fetch;
let detailCalls = 0;
mock.module('../TatakaiAPI/src/lib/supabase', () => ({ getSupabase: () => null }));
mock.module('../TatakaiAPI/src/providers/anilist/client', () => ({ anilistClient: { query: async () => { detailCalls++; return { Media: { externalLinks: [] } }; } } }));
mock.module('../TatakaiAPI/src/config/env', () => ({ env: { JIKAN_BASE_URL: 'https://metadata.fixture/v4' } }));
mock.module('../TatakaiAPI/src/config/logger', () => ({ log: { warn() {} } }));
mock.module('../TatakaiAPI/src/lib/rateLimiter', () => ({ jikanLimiter: { acquire: async () => {} } }));
const { attachMappingToMedia } = await import('../TatakaiAPI/src/services/mapping/mappingResolver');
const { JikanClient } = await import('../TatakaiAPI/src/providers/jikan/client');
afterEach(() => { globalThis.fetch = originalFetch; detailCalls = 0; });
it('search mapping avoids per-title upstream detail requests while detail pages retain enrichment', async () => {
  globalThis.fetch = async () => Response.json([{ anilist_id: 20, mal_id: 1735 }]);
  const list = await Promise.all(Array.from({ length: 24 }, () => attachMappingToMedia({ anilistId: 20 }, { fetchMissingLinks: false })));
  expect(list).toHaveLength(24); expect(detailCalls).toBe(0);
  expect(list[0].mapping?.mal_id).toBe(1735);
  await attachMappingToMedia({ anilistId: 20 }); expect(detailCalls).toBe(1);
});
it('reports unavailable Jikan metadata as upstream failures rather than an internal server error', async () => {
  globalThis.fetch = async (_input, init) => { expect(init?.signal).toBeInstanceOf(AbortSignal); throw Error('network unavailable'); };
  await expect(new JikanClient().getMangaFull(157232)).rejects.toMatchObject({ status: 503 });
  globalThis.fetch = async () => new Response('upstream error', { status: 500 });
  await expect(new JikanClient().getMangaFull(157232)).rejects.toMatchObject({ status: 502 });
  globalThis.fetch = async () => new Response('not found', { status: 404 });
  await expect(new JikanClient().getMangaFull(157232)).rejects.toMatchObject({ status: 404 });
});

it('falls back to basic manga metadata when Jikan full enrichment fails', async () => {
  globalThis.fetch = async input => String(input).endsWith('/full')
    ? new Response('full metadata failed', { status: 500 })
    : Response.json({ data: { mal_id: 157232, title: 'Fixture manga', chapters: 171 } });
  expect(await new JikanClient().getMangaFull(157232)).toMatchObject({ mal_id: 157232, chapters: 171 });
});
