import { describe, expect, test } from 'bun:test';
import { compareWatchHistory, fetchWatchHistory } from '../src/lib/watchHistoryQuery';
import { fetchAvatarGallery, selectGalleryCharacters } from '../src/lib/avatarGallery';
import { uploadProfileImage, validateProfileImage } from '../src/lib/profileMedia';
import { createDesktopFullscreenController } from '../src/components/video/desktopFullscreen';

function historyClient(count: number, failPage = -1, serverCap = 500) {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `${index}`.padStart(5, '0'), watched_at: '2026-10-01T00:00:00Z',
    episode_number: index + 1, completed: true, anime_id: 'one-piece',
  })).sort(compareWatchHistory);
  const orders: unknown[] = [];
  let pages = 0;
  const query = {
    select() { return this; },
    eq(key: string, value: string) { expect([key, value]).toEqual(['user_id', 'user-1']); return this; },
    order(key: string, options: unknown) { orders.push([key, options]); return this; },
    range(start: number, end: number) {
      return Promise.resolve(pages++ === failPage
        ? { error: new Error('Page failed'), data: null }
        : { data: rows.slice(start, Math.min(end + 1, start + serverCap)), error: null });
    },
  };
  return { client: { from: () => query } as unknown as Parameters<typeof fetchWatchHistory>[0], orders, rows };
}

describe('complete history', () => {
  for (const count of [0, 500, 1000, 1181, 2000]) {
    test(`loads all ${count} rows`, async () => {
      const { client, rows, orders } = historyClient(count);
      const result = await fetchWatchHistory(client, 'user-1');
      expect(result).toEqual(rows);
      expect(new Set(result.map(row => row.id)).size).toBe(count);
      expect(orders.slice(0, 3)).toEqual([
        ['watched_at', { ascending: false }], ['episode_number', { ascending: false }], ['id', { ascending: true }],
      ]);
    });
  }
  test('explicit limit spans pages and server caps', async () => {
    expect((await fetchWatchHistory(historyClient(2000).client, 'user-1', 1181)).length).toBe(1181);
    expect((await fetchWatchHistory(historyClient(1181, -1, 100).client, 'user-1')).length).toBe(1181);
    expect(await fetchWatchHistory(historyClient(10).client, 'user-1', 0)).toEqual([]);
  });
  test('later-page errors reject the entire result', async () => {
    await expect(fetchWatchHistory(historyClient(1181, 1).client, 'user-1')).rejects.toThrow('Page failed');
  });
  test('timestamp wins; tied timestamps use numeric episode and ID order', () => {
    const rows = [
      { watched_at: '2026-10-01', episode_number: 10, id: 'b' },
      { watched_at: '2026-10-01', episode_number: 10, id: 'a' },
      { watched_at: '2026-10-02', episode_number: 2, id: 'c' },
      { watched_at: '2026-10-01', episode_number: 9, id: 'd' },
    ];
    expect(rows.sort(compareWatchHistory).map(row => row.id)).toEqual(['c', 'a', 'b', 'd']);
  });
});

const characters = [
  { id: 1, gender: 'Male', image: { large: 'male.png' } },
  { id: 2, gender: 'Female', image: { large: 'female.png' } },
  { id: 3, gender: null, image: { large: 'unknown.png' } },
  { id: 1, gender: 'Male', image: { large: 'duplicate.png' } },
];
describe('avatar metadata', () => {
  test('filters metadata, deduplicates, and includes unknowns only in Any', () => {
    expect(selectGalleryCharacters(characters, 'male').map(row => row.id)).toEqual([1]);
    expect(selectGalleryCharacters(characters, 'female').map(row => row.id)).toEqual([2]);
    expect(selectGalleryCharacters(characters, 'any').map(row => row.id)).toEqual([1, 2, 3]);
  });
  test('bounded pages never substitute images from another gender', async () => {
    let pages = 0;
    const fetcher = (async (_url, options) => {
      expect(JSON.parse(options!.body as string).variables.page).toBe(++pages);
      return Response.json({ data: { Page: { characters, pageInfo: { hasNextPage: true } } } });
    }) as typeof fetch;
    const result = await fetchAvatarGallery('https://example.com', 'male', 12, fetcher);
    expect(pages).toBe(5);
    expect(result.map(row => row.url)).toEqual(['male.png']);
  });
  test('HTTP and GraphQL failures reject for retry', async () => {
    await expect(fetchAvatarGallery('x', 'male', 12, (async () => new Response('', { status: 500 })) as typeof fetch)).rejects.toThrow();
    await expect(fetchAvatarGallery('x', 'male', 12, (async () => Response.json({ errors: [{}] })) as typeof fetch)).rejects.toThrow();
  });
});

describe('profile uploads', () => {
  test('validates formats and size including boundary', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
      expect(() => validateProfileImage({ type, size: 8388608 })).not.toThrow();
    }
    expect(() => validateProfileImage({ type: 'image/svg+xml', size: 10 })).toThrow('Choose a PNG');
    expect(() => validateProfileImage({ type: 'image/png', size: 8388609 })).toThrow('8MB');
  });
  for (const category of ['avatar', 'banner'] as const) {
    test(`${category} uses the canonical owned folder, never upserts`, async () => {
      const calls: string[] = [];
      const client = { storage: { from(bucket: string) {
        calls.push(bucket);
        return { upload: async (path: string, _file: File, options: unknown) => {
          expect(path).toMatch(new RegExp(`^user-1/${category}/[a-f0-9-]+\\.png$`));
          expect(options).toEqual({ cacheControl: '3600', upsert: false, contentType: 'image/png' });
          return { error: null };
        }, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }) };
      } } } as unknown as Parameters<typeof uploadProfileImage>[0];
      const result = await uploadProfileImage(client, new File(['image'], 'test.png', { type: 'image/png' }), 'user-1', category);
      expect(calls).toEqual(['user-media']);
      expect(result.url).toBe(`https://cdn/${result.path}`);
    });
  }
  test('RLS and missing-bucket failures propagate without fallback', async () => {
    for (const message of ['new row violates row-level security policy', 'Bucket not found']) {
      const calls: string[] = [];
      const client = { storage: { from(bucket: string) { calls.push(bucket); return {
        upload: async () => ({ error: new Error(message) }),
      }; } } } as unknown as Parameters<typeof uploadProfileImage>[0];
      await expect(uploadProfileImage(client, new File(['x'], 'a.png', { type: 'image/png' }), 'user-1', 'avatar')).rejects.toThrow(message);
      expect(calls).toEqual(['user-media']);
    }
  });
});

describe('desktop fullscreen transitions', () => {
  test('first click paints immediately; rapid clicks and delayed exit notifications do not undo entry', async () => {
    let resolve!: (value: { success: boolean }) => void;
    const calls: boolean[] = [];
    const paint: boolean[] = [];
    const controller = createDesktopFullscreenController({ setFullscreen(enabled) {
      calls.push(enabled); return new Promise(done => { resolve = done; });
    } }, enabled => paint.push(enabled));
    const entering = controller.toggle();
    expect(paint).toEqual([true]);
    controller.nativeChanged(false);
    await controller.toggle();
    expect(calls).toEqual([true]);
    expect(controller.active).toBe(true);
    resolve({ success: true }); await entering;
    controller.nativeChanged(false);
    expect(paint).toEqual([true, false]);
  });
  test('structured and rejected IPC failures preserve CSS fallback', async () => {
    for (const setFullscreen of [async () => ({ success: false }), async () => { throw new Error('IPC'); }]) {
      const paint: boolean[] = [];
      const controller = createDesktopFullscreenController({ setFullscreen }, value => paint.push(value));
      await controller.toggle(); expect(controller.active).toBe(true);
      await controller.exit(); expect(controller.active).toBe(false);
      expect(paint).toEqual([true, false]);
    }
  });
  test('Escape during entry clears styles immediately and exits native once entry completes', async () => {
    let resolve!: (value: { success: boolean }) => void;
    const calls: boolean[] = [];
    const controller = createDesktopFullscreenController({ setFullscreen(enabled) {
      calls.push(enabled);
      return enabled ? new Promise(done => { resolve = done; }) : Promise.resolve({ success: true });
    } }, () => {});
    const entering = controller.toggle(); await controller.exit();
    expect(controller.active).toBe(false);
    resolve({ success: true }); await entering;
    expect(calls).toEqual([true, false]);
  });
  test('repeated cycles and unmount release fullscreen', async () => {
    const calls: boolean[] = [];
    const paint: boolean[] = [];
    const controller = createDesktopFullscreenController({ async setFullscreen(enabled) {
      calls.push(enabled); return { success: true };
    } }, value => paint.push(value));
    for (let i = 0; i < 4; i++) await controller.toggle();
    await controller.toggle(); controller.dispose(); await Promise.resolve();
    expect(calls).toEqual([true, false, true, false, true, false]);
    expect(paint).toEqual(calls);
  });
});
