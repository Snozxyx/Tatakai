import { expect, test } from 'bun:test';
import { searchNovels } from '../src/core/content/novel-client';

const requests: { url: string; query?: string; variables?: any }[] = [];
const original = globalThis.fetch;
async function withCatalog(run: () => Promise<void>) {
  requests.length = 0;
  globalThis.fetch = (async (input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const url = String(input);
    requests.push({ url, query: body.query, variables: body.variables });
    if (body.query?.includes('MediaTagCollection')) return Response.json({ data: { MediaTagCollection: [
      { id: 1, name: 'Isekai' }, { id: 2, name: 'Historical' }, { id: 3, name: 'Martial Arts' },
    ] } });
    if (init?.method === 'POST') return Response.json({ data: { Page: {
      media: [{ id: 42, title: { english: 'Novel' }, format: 'NOVEL', isAdult: body.variables?.adult === true }],
      pageInfo: { currentPage: 1, hasNextPage: false },
    } } });
    if (url.endsWith('/tags')) return Response.json({ data: [] });
    return Response.json({ data: [], pagination: { count: 0, next: null } });
  }) as typeof fetch;
  try { await run(); } finally { globalThis.fetch = original; }
}
const searchRequest = () => requests.findLast(request => request.query?.includes('query NovelSearch'))!;

test('novel route slugs become canonical AniList genres and MangaBaka genre slugs', () => withCatalog(async () => {
  for (const [slug, label, mangaBaka] of [['fantasy', 'Fantasy', 'fantasy'], ['sci-fi', 'Sci-Fi', 'sci_fi'], ['slice-of-life', 'Slice of Life', 'slice_of_life']]) {
    const result = await searchNovels('', 1, 24, { genre: slug, adult: false });
    expect(result.results).toHaveLength(1);
    expect(searchRequest().variables.genre).toBe(label);
    expect(requests.some(request => new URL(request.url, 'https://tatakai.app').searchParams.get('genre') === mangaBaka)).toBe(true);
  }
}));

test('Isekai, Historical and Martial Arts browse links use tags instead of invalid genre names', () => withCatalog(async () => {
  for (const [slug, tag] of [['isekai', 'Isekai'], ['historical', 'Historical'], ['martial-arts', 'Martial Arts']]) {
    await searchNovels('', 1, 24, { genre: slug, adult: false });
    expect(searchRequest().variables.genre).toBeUndefined();
    expect(searchRequest().variables.tags).toEqual([tag]);
  }
  expect(requests.every(request => Boolean(request.query))).toBe(true);
}));

test('the adult genre respects the opt-in and requests only adult novels from both catalogs', () => withCatalog(async () => {
  expect((await searchNovels('', 1, 24, { genre: 'hentai', adult: false })).results).toEqual([]);
  expect(requests).toHaveLength(0);
  await searchNovels('', 1, 24, { genre: 'hentai', adult: true });
  expect(searchRequest().variables.genre).toBeUndefined();
  expect(searchRequest().variables.adult).toBe(true);
  const request = requests.find(request => request.url.includes('/search?'))!;
  expect(new URL(request.url, 'https://tatakai.app').searchParams.getAll('content_rating')).toEqual(['erotica', 'pornographic']);
}));
