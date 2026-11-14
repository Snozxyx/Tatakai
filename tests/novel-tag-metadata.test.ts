import { afterEach, expect, test } from 'bun:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { getNovelDetail, novelDetailStaleTime, searchNovels } from '../src/core/content/novel-client';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('novel detail retains tags from the mapped API envelope without another metadata request', async () => {
  const tags = [{ id: 244, name: 'Isekai', rank: 95, isGeneralSpoiler: false, isMediaSpoiler: false }];
  const media = { anilistId: 85470, titleEnglish: 'Mushoku Tensei', format: 'NOVEL', tags };
  const calls: string[] = [];
  globalThis.fetch = (async input => {
    calls.push(String(input));
    return Response.json({ success: true, data: { id: '85470', mapping: null, media } });
  }) as typeof fetch;

  const result = await getNovelDetail('85470');
  expect(result.detail.tags).toEqual(tags);
  expect(result.detail.tagSource).toBe('anilist');
  expect(result.metadata.tags).toEqual(tags);
  expect(result.metadata.titleEnglish).toBe('Mushoku Tensei');
  expect(calls).toHaveLength(1);
});

test('an AniList novel tag opens a novel-only catalog search with no text query', async () => {
  const bodies: any[] = [];
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    return Response.json({ data: { Page: {
      media: [{ id: 85470, title: { english: 'Mushoku Tensei' }, format: 'NOVEL' }],
      pageInfo: { currentPage: 2, total: 40, lastPage: 2, hasNextPage: false },
    } } });
  }) as typeof fetch;

  const result = await searchNovels('', 2, 20, { tags: ['Isekai'], tagSource: 'anilist', adult: false });
  expect(bodies).toHaveLength(1);
  expect(bodies[0].variables).toMatchObject({ tags: ['Isekai'], page: 2, adult: false });
  expect(bodies[0].query).toContain('format: NOVEL');
  expect(result.results.map(row => row.id)).toEqual(['85470']);
  expect(result.currentPage).toBe(2);
  expect(result.hasNextPage).toBe(false);
});

test('web novels preserve their MangaBaka tags and taxonomy without an AniList identity', async () => {
  const tags = [{ id: 31, name: 'Cultivation', isSpoiler: false, weight: 'defining' }];
  globalThis.fetch = (async () => Response.json({ success: true, data: {
    mangaBakaId: 731343, title: 'Web novel', type: 'novel', anilistId: null, malId: null,
    cover: {}, aliases: [], genres: ['Fantasy'], authors: [], artists: [], links: [],
    contentRating: 'safe', tags,
  } })) as typeof fetch;

  const result = await getNovelDetail('mangabaka:731343');
  expect(result.detail.tags).toEqual(tags);
  expect(result.detail.tagSource).toBe('mangabaka');
  expect(result.detail.anilistId).toBeNull();
});

test('a fresh persisted novel from an older client refetches once to recover tag metadata', async () => {
  const client = new QueryClient();
  const key = ['novel-detail', '85470'];
  client.setQueryData(key, { detail: { canonicalTitle: 'Cached novel' } });
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return Response.json({ success: true, data: { media: {
      anilistId: 85470, titleEnglish: 'Cached novel', format: 'NOVEL', tags: [{ id: 244, name: 'Isekai' }],
    } } });
  }) as typeof fetch;
  const options = {
    queryKey: key, queryFn: () => getNovelDetail('85470'),
    staleTime: (query: any) => novelDetailStaleTime(query.state.data),
  };
  const observer = new QueryObserver(client, options);
  let finish!: () => void;
  const ready = new Promise<void>(resolve => { finish = resolve; });
  const unsubscribe = observer.subscribe(result => { if (result.data?.metadata) finish(); });
  try {
    await ready;
    expect(calls).toBe(1);
    expect(observer.getCurrentResult().data?.detail.tags).toEqual([{ id: 244, name: 'Isekai' }]);
    unsubscribe();
    const next = new QueryObserver(client, options);
    const stop = next.subscribe(() => {});
    expect(next.getCurrentResult().isFetching).toBe(false);
    expect(calls).toBe(1);
    stop();
  } finally { unsubscribe(); client.clear(); }
});
