import { expect, test } from 'bun:test';
import { getNovelDetail, searchNovels } from '../src/core/content/novel-client';

test('MangaBaka-only novels have local metadata without an AniList identity', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async input => {
    calls.push(String(input));
    return Response.json({ success: true, data: {
      title: 'Shadow Slave', type: 'novel', anilistId: null, malId: null,
      cover: { large: 'https://example.com/cover.jpg' }, aliases: ['Shadow Slave'],
      genres: ['Fantasy'], authors: ['Guiltythree'], artists: [], links: [],
      contentRating: 'safe', totalChapters: 3000,
    } });
  }) as typeof fetch;
  try {
    const result = await getNovelDetail('mangabaka:531343');
    expect(result.detail.canonicalTitle).toBe('Shadow Slave');
    expect(result.detail.format).toBe('NOVEL');
    expect(result.detail.anilistId).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/mapping/mangabaka/series/531343');
  } finally { globalThis.fetch = original; }
});

test('novel search merges catalogs and retains web novels when AniList fails', async () => {
  const original = globalThis.fetch;
  let failPrimary = false;
  globalThis.fetch = (async (_input, init) => {
    if (init?.method === 'POST') return failPrimary ? new Response('', { status: 503 }) : Response.json({ data: { Page: {
      media: [{ id: 42, title: { english: 'Existing' }, format: 'NOVEL' }],
      pageInfo: { currentPage: 1, hasNextPage: false },
    } } });
    return Response.json({ pagination: { count: 2, next: null }, data: [
      { id: 1, title: 'Existing', type: 'novel', source: { anilist: { id: 42 } } },
      { id: 2, title: 'Web novel', type: 'novel', source: {} },
    ] });
  }) as typeof fetch;
  try {
    const merged = await searchNovels('novel');
    expect(merged.results.map(item => item.id)).toEqual(['42', 'mangabaka:2']);
    expect(merged.results.every(item => item.mediaType === 'novel')).toBe(true);
    failPrimary = true;
    const fallback = await searchNovels('novel');
    expect(fallback.results).toHaveLength(2);
    expect(fallback.partial).toBe(true);
    expect(fallback.failedProviders).toContain('anilist');
  } finally { globalThis.fetch = original; }
});
