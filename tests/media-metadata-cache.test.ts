import { describe, expect, test } from 'bun:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { startMediaMetadataCache, MEDIA_METADATA_STALE_TIME, type MetadataStorage } from '../src/lib/cache/mediaMetadataCache';

function disk() {
  let value: string | null = null;
  const storage: MetadataStorage = {
    read: async () => value,
    write: async next => { value = next; },
    remove: async () => { value = null; },
  };
  return { storage, value: () => value };
}
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

describe('persistent static media metadata', () => {
  test('metadata bursts persist one snapshot containing the latest data', async () => {
    const first = client();
    let count = 0;
    let saved = '';
    const cache = await startMediaMetadataCache(first, {
      read: async () => null, remove: async () => {},
      write: async value => { count++; saved = value; },
    });
    for (let id = 0; id < 100; id++) first.setQueryData(['anime', id], { title: id });
    await cache.flush();
    expect(count).toBe(1);
    expect(JSON.parse(saved).entries).toHaveLength(100);
    cache.stop();
  });
  test('a fresh app instance shows all three metadata types without server requests', async () => {
    const saved = disk();
    const first = client();
    const cache = await startMediaMetadataCache(first, saved.storage);
    for (const type of ['anime', 'manga-detail', 'novel-detail']) {
      first.setQueryData([type, '42'], { title: type, description: 'synopsis' });
    }
    await cache.flush();
    cache.stop();
    const next = client();
    const reopened = await startMediaMetadataCache(next, saved.storage);
    let calls = 0;
    for (const type of ['anime', 'manga-detail', 'novel-detail']) {
      expect(await next.fetchQuery({
        queryKey: [type, '42'], staleTime: MEDIA_METADATA_STALE_TIME,
        queryFn: async () => { calls++; return {}; },
      })).toEqual({ title: type, description: 'synopsis' });
    }
    expect(calls).toBe(0);
    expect(next.getQueryData(['anime', '43'])).toBeUndefined();
    reopened.stop();
  });

  test('live queries are excluded, and nested schedules and streaming links are removed', async () => {
    const saved = disk();
    const first = client();
    const cache = await startMediaMetadataCache(first, saved.storage);
    first.setQueryData(['anime', '1'], { info: { name: 'Title' }, moreInfo: {
      nextAiringEpisode: { episode: 7 }, streamingEpisodes: [{ url: 'signed-link' }],
    } });
    for (const key of ['next-episode-schedule', 'episodes', 'sources', 'servers',
      'manga-read', 'novel-content', 'manga-chapters', 'novel-chapters', 'home', 'profile']) {
      first.setQueryData([key, '1'], { secret: 'live' });
    }
    await cache.flush();
    expect(saved.value()).not.toContain('signed-link');
    expect(saved.value()).not.toContain('secret');
    // Sanitizing the disk copy must not mutate the current live response.
    expect(first.getQueryData<any>(['anime', '1']).moreInfo.nextAiringEpisode.episode).toBe(7);
    const next = client();
    const reopened = await startMediaMetadataCache(next, saved.storage);
    expect(next.getQueryData<any>(['anime', '1']).moreInfo.nextAiringEpisode).toBeNull();
    expect(next.getQueryData(['sources', '1'])).toBeUndefined();
    cache.stop(); reopened.stop();
  });

  test('stale metadata renders immediately and refreshes in the background', async () => {
    const saved = disk();
    const first = client();
    const cache = await startMediaMetadataCache(first, saved.storage);
    const timestamp = Date.now() - 2 * MEDIA_METADATA_STALE_TIME;
    first.setQueryData(['novel-detail', '1'], { title: 'old' }, { updatedAt: timestamp });
    await cache.flush();
    const next = client();
    const reopened = await startMediaMetadataCache(next, saved.storage);
    let release!: (value: { title: string }) => void;
    const observer = new QueryObserver(next, { queryKey: ['novel-detail', '1'],
      staleTime: MEDIA_METADATA_STALE_TIME, queryFn: () => new Promise<{ title: string }>(resolve => { release = resolve; }) });
    const off = observer.subscribe(() => {});
    expect(observer.getCurrentResult().data).toEqual({ title: 'old' });
    expect(observer.getCurrentResult().isFetching).toBe(true);
    expect(next.getQueryState(['novel-detail', '1'])?.dataUpdatedAt).toBe(timestamp);
    release({ title: 'new' });
    await next.fetchQuery({ queryKey: ['novel-detail', '1'] });
    expect(next.getQueryData(['novel-detail', '1'])).toEqual({ title: 'new' });
    off(); cache.stop(); reopened.stop();
  });

  test('storage is bounded and clear does not let queued writes restore deleted data', async () => {
    const saved = disk();
    const first = client();
    const cache = await startMediaMetadataCache(first, saved.storage);
    for (let id = 0; id < 110; id++) first.setQueryData(['manga-detail', String(id)], { title: id });
    await cache.flush();
    expect(JSON.parse(saved.value()!).entries).toHaveLength(100);
    first.setQueryData(['anime', 'new'], { title: 'queued' });
    await cache.clear();
    expect(saved.value()).toBeNull();
    expect(first.getQueryData(['anime', 'new'])).toBeUndefined();
    cache.stop();
  });

  test('expired records and unavailable/corrupt storage never block fetching', async () => {
    const saved = disk();
    await saved.storage.write(JSON.stringify({ version: 1, entries: [{ key: ['anime', '1'], data: {},
      updatedAt: Date.now() - 8 * MEDIA_METADATA_STALE_TIME }] }));
    const first = client();
    const cache = await startMediaMetadataCache(first, saved.storage);
    expect(first.getQueryData(['anime', '1'])).toBeUndefined();
    cache.stop();
    for (const read of [async () => '{bad json', async () => { throw new Error('private mode'); }]) {
      const next = client();
      const handle = await startMediaMetadataCache(next, { read,
        write: async () => { throw new Error('quota'); }, remove: async () => {} });
      expect(await next.fetchQuery({ queryKey: ['anime', '1'], queryFn: async () => ({ title: 'live' }) }))
        .toEqual({ title: 'live' });
      await handle.flush();
      handle.stop();
    }
  });
});
