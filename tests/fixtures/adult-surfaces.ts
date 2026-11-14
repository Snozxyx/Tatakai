import { expect } from 'bun:test';
import { requestAdultMode, confirmAdultMode, disableAdultMode, contentModePath } from '../../src/lib/adultMode';
import { queryCache } from '../../src/core/cache/query-cache';
import { resolvePornhwaIdentity, pornhwaSeriesHref } from '../../src/lib/pornhwaIdentity';
import { pornhwaChapterAppearances } from '../../src/lib/pornhwaChapters';
import { chapterTitleText } from '../../src/lib/chapterTitle';
import { GalleryImageCache } from '../../src/lib/galleryImageCache';

const original = { localStorage: globalThis.localStorage, fetch: globalThis.fetch, Image: globalThis.Image };
const values = new Map<string, string>();
globalThis.localStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), key: (index: number) => [...values.keys()][index] ?? null, get length() { return values.size; }, clear: () => values.clear() } as Storage;
const canonical = 'ba6e8317-26cf-4d00-ba2d-fac786895a8c';
const sourceOnly = '00000000-0000-4000-8000-000000000098';
const novelId = '00000000-0000-4000-8000-000000000099';
const base = { id: canonical, tatakaiId: canonical, anilistId: 138564, titleEnglish: 'Catalog fixture', titleRomaji: 'Catalog fixture', format: 'MANGA', mediaType: 'manga', isAdult: true, adultCategory: 'explicit', sourceIds: { pornhwadb: '137' }, genres: ['Fixture'], status: 'RELEASING', coverImageLarge: 'https://images.example/fixture.png' };
const requests: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'https://tatakai.test');
  requests.push(url.pathname);
  let data: unknown;
  if (url.pathname.includes('/adult/media/')) {
    const id = decodeURIComponent(url.pathname.split('/').at(-1)!);
    data = id === sourceOnly ? { ...base, id: sourceOnly, tatakaiId: sourceOnly, anilistId: undefined, sourceIds: { pornhwadb: '98' } }
      : id === novelId ? { ...base, id: novelId, tatakaiId: novelId, anilistId: 99, mediaType: 'novel', format: 'NOVEL', sourceIds: {} }
      : { ...base, sourceIds: id === '999' ? {} : base.sourceIds };
  } else if (url.pathname.includes('/manga/by-anilist/')) data = { media: { ...base, authors: ['Stored author'], characters: [{ id: 7, name: 'Stored character' }], titleEnglish: 'Stored operator title' } };
  else if (url.pathname.includes('/adult/home')) data = { spotlight: [base], trending: [base], popular: [base], latest: [base], top: [base], pornhwa: [base], trendingSource: 'anilist' };
  else data = { newChapters: [], manhwa: [], manhua: [] };
  return Response.json({ success: true, data });
}) as typeof fetch;
try {
  disableAdultMode();
  expect(contentModePath('/browse', 'adult')).toBe('/adult/anime');
  expect(contentModePath('/adult/anime', 'sfw')).toBe('/browse');
  expect(contentModePath('/adult/manga/read/42', 'sfw')).toBe('/manga/read/42');
  queryCache.set('fixture:home', 'sfw', 60000);
  requestAdultMode(); confirmAdultMode();
  expect(queryCache.get('fixture:home')).toBeNull();
  queryCache.set('fixture:home', 'adult', 60000);
  localStorage.setItem('tatakai_content_safety', JSON.stringify({ adultCategories: { explicit: false, ecchi: true, mature: true } }));
  expect(queryCache.get('fixture:home')).toBeNull();
  localStorage.setItem('tatakai_content_safety', '{}');
  expect(queryCache.get('fixture:home')).toBe('adult');
  disableAdultMode();
  expect(queryCache.get('fixture:home')).toBe('sfw');
  requestAdultMode(); confirmAdultMode();
  const identity = await resolvePornhwaIdentity('138564');
  expect(identity?.pornhwaId).toBe('137');
  expect(requests.at(-1)).toEndWith('/adult/media/138564');
  expect((await resolvePornhwaIdentity('pornhwadb:137', { sourceIds: { pornhwadb: '99' } }))?.pornhwaId).toBe('137');
  expect(await resolvePornhwaIdentity('999')).toBeNull();
  expect(pornhwaSeriesHref(identity!)).toBe('/adult/manga/138564');
  expect(pornhwaSeriesHref({ pornhwaId: '98' })).toBe('/adult/manga/pornhwadb%3A98');
  const { getMangaDetail } = await import('../../src/core/content/manga-client');
  const mapped = await getMangaDetail('pornhwadb:137');
  expect(mapped.detail.anilistId).toBe(138564);
  expect(mapped.detail.sourceIds?.pornhwadb).toBe('137');
  expect(mapped.detail.canonicalTitle).toBe('Stored operator title');
  const independent = await getMangaDetail(sourceOnly);
  expect(independent.detail.anilistId).toBeUndefined();
  expect(independent.detail.tatakaiId).toBe(sourceOnly);
  expect(independent.detail.matchedBy).toBe('provider');
  const { getNovelDetail } = await import('../../src/core/content/novel-client');
  const novel = await getNovelDetail(novelId);
  expect(novel.detail.authors).toEqual(['Stored author']);
  expect(novel.detail.characters[0].name).toBe('Stored character');
  const series = { id: 137, identity: identity!, characters: [{ id: 1, name: 'Character fixture', image: 'https://images.example/character.png' }], chapters: [{ chapterStart: 26, chapterEnd: 28, characters: [1], tags: ['Scene fixture'] }] };
  expect(pornhwaChapterAppearances(series, 27)?.characters[0].image).toBe(series.characters[0].image);
  expect(pornhwaChapterAppearances(series, 29)).toBeNull();
  expect(chapterTitleText(32, 'Chapter 32 - Final')).toBe('Final');
  expect(chapterTitleText(32, 'Chapter 320 - Extra')).toBe('Chapter 320 - Extra');
  const { readAdultHome, adultAnimeHomeBundle } = await import('../../src/lib/adultHome');
  const home = adultAnimeHomeBundle(await readAdultHome('anime'));
  expect(home.spotlight).toHaveLength(1);
  expect(home.catalogRankings).toBe(true);
  expect(home.top10.today[0].anilistId).toBe(138564);
  let created = 0;
  globalThis.Image = class {
    onload?: () => void; onerror?: () => void; decoding = '';
    constructor() { created++; }
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    decode() { return Promise.resolve(); }
  } as unknown as typeof Image;
  const cache = new GalleryImageCache();
  await cache.prepare('https://images.example/next.png');
  await cache.prepare('https://images.example/next.png');
  expect(created).toBe(1);
  console.log('ADULT_IDENTITIES_CACHE_CHAPTERS_HOME_IMAGES_OK');
} finally {
  disableAdultMode(); queryCache.clear();
  Object.assign(globalThis, original);
}
