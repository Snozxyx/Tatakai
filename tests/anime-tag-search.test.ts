import { expect, test } from 'bun:test';
import { searchAnimeTags } from '../src/core/content/anime-tag-search';

const originalFetch = globalThis.fetch;
async function withProxy(response: Response, run: (requests: any[]) => Promise<void>) {
  const requests: any[] = [];
  globalThis.fetch = (async (url, init) => {
    requests.push({ url: String(url), ...JSON.parse(String(init?.body)) });
    return response;
  }) as typeof fetch;
  try { await run(requests); } finally { globalThis.fetch = originalFetch; }
}

test('anime tag-only browsing uses the complete proxy catalog and preserves card IDs and pagination', () => withProxy(Response.json({ data: { Page: {
  pageInfo: { currentPage: 2, perPage: 24, hasNextPage: true, lastPage: 4, total: 90 },
  media: [{ id: 21355, idMal: 31240, title: { romaji: 'Re:Zero', english: 'Re:ZERO' },
    coverImage: { large: 'https://example.com/cover.jpg' }, format: 'TV', isAdult: false,
    genres: ['Fantasy'], tags: [{ id: 244, name: 'Isekai' }] }],
} } }), async requests => {
  const result = await searchAnimeTags({ query: '', tags: [' Isekai ', 'Isekai'], page: 2, perPage: 24, isAdult: false });
  expect(requests[0].url).toEndWith('/anilist/graphql');
  expect(requests[0].forceUpstream).toBe(true);
  expect(requests[0].query).toContain('type: ANIME');
  expect(requests[0].query).toContain('tag_in: $tags');
  expect(requests[0].variables).toMatchObject({ tags: ['Isekai'], page: 2, perPage: 24, adult: false, sort: ['POPULARITY_DESC'] });
  expect(requests[0].variables.search).toBeUndefined();
  expect(result.media[0]).toMatchObject({ anilistId: 21355, malId: 31240, titleEnglish: 'Re:ZERO', coverImageLarge: 'https://example.com/cover.jpg' });
  expect(result.pageInfo).toMatchObject({ currentPage: 2, hasNextPage: true, lastPage: 4 });
}));

test('tag browsing keeps text, genre, format, status, season, sort and inclusive numeric filters', () => withProxy(Response.json({ data: { Page: {
  media: [], pageInfo: { currentPage: 1, perPage: 24, hasNextPage: false, lastPage: 1, total: 0 },
} } }), async requests => {
  await searchAnimeTags({ query: ' dragon ', tags: ['Magic'], genres: ['Fantasy'], format: ['MOVIE'],
    status: ['FINISHED'], season: ['SPRING'], sortBy: 'SCORE_DESC', isAdult: false,
    rating: { min: 70, max: 95 }, year: { min: 2020, max: 2026 }, episodes: { min: 1, max: 24 } });
  expect(requests[0].variables).toMatchObject({ search: 'dragon', tags: ['Magic'], genres: ['Fantasy'],
    formats: ['MOVIE'], statuses: ['FINISHED'], season: 'SPRING', sort: ['SCORE_DESC'],
    adult: false, scoreMin: 69, scoreMax: 96, startMin: 20199999, startMax: 20270000, epMin: 0, epMax: 25 });
}));

test('proxy failures remain errors instead of successful empty result pages', async () => {
  for (const response of [new Response('', { status: 503 }), Response.json({ errors: [{ message: 'Unavailable' }] }), Response.json({ data: null })]) {
    await withProxy(response, async () => {
      await expect(searchAnimeTags({ tags: ['Isekai'] })).rejects.toThrow('temporarily unavailable');
    });
  }
});
