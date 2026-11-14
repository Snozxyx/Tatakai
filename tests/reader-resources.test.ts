import { afterEach, expect, test } from 'bun:test';
import { acquireReaderImageResource, readerDimensions, releaseInactiveReaderImages } from '../src/lib/reader/imageResources';
import { scheduleReaderImage } from '../src/lib/reader/loading';
import { migrateReaderSettings } from '../src/lib/reader/settingsMigration';
import { DEFAULT_SETTINGS } from '../src/lib/reader/settings';
import { readerPageIsEager } from '../src/components/reader/readerImageStyles';
import { ReaderTapTracker } from '../src/lib/reader/interactions';
import { normalizeReaderKeybinds } from '../src/lib/reader/keybindings';
import { QueryClient } from '@tanstack/react-query';
import { fetchReaderChapter } from '../src/lib/reader/fetchChapter';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
afterEach(releaseInactiveReaderImages);

test('background preparation reserves a foreground slot and cancellation clears the queue', async () => {
  const controllers = Array.from({ length: 4 }, () => new AbortController());
  const starts: number[] = [], finishes: Array<() => void> = [];
  const tasks = controllers.map((controller, index) => scheduleReaderImage(() => new Promise<void>(resolve => {
    starts.push(index); finishes[index] = resolve;
  }), controller.signal, index === 3 ? 20 : -10, index !== 3).catch(() => undefined));
  await tick();
  expect(starts).toEqual([3, 0, 1]);
  controllers[2].abort();
  finishes.forEach(finish => finish?.());
  await Promise.all(tasks);
  expect(starts).not.toContain(2);
});

test('a prepared blob is adopted without another fetch and cancellation retains another consumer', async () => {
  let calls = 0, finish!: () => void;
  const loader = async () => { calls++; await new Promise<void>(resolve => { finish = resolve; }); return { src: 'blob:shared', owned: false }; };
  const prefetch = new AbortController(), viewer = new AbortController();
  const prepared = acquireReaderImageResource('shared', loader, prefetch.signal, -10, true, true);
  const adopted = acquireReaderImageResource('shared', loader, viewer.signal, 20);
  const cancelled = prepared.promise.catch(error => error.name);
  await tick();
  prefetch.abort(); finish();
  expect(await cancelled).toBe('AbortError');
  expect((await adopted.promise).src).toBe('blob:shared');
  expect(calls).toBe(1);
  viewer.abort();
});

test('an uncancellable late owned blob is released after its reader exits', async () => {
  const original = URL.revokeObjectURL;
  const revoked: string[] = [];
  URL.revokeObjectURL = value => { revoked.push(value); };
  try {
    let finish!: (value: { src: string; owned: boolean }) => void;
    const controller = new AbortController();
    const lease = acquireReaderImageResource('late', () => new Promise(resolve => { finish = resolve; }), controller.signal);
    const cancelled = lease.promise.catch(error => error.name);
    await tick(); controller.abort();
    expect(await cancelled).toBe('AbortError');
    finish({ src: 'blob:late', owned: true }); await tick();
    expect(revoked).toEqual(['blob:late']);
  } finally { URL.revokeObjectURL = original; }
});

test('failed preparation remains retryable and different sources do not share resources', async () => {
  let calls = 0;
  const loader = async () => { if (++calls === 1) throw new Error('temporary'); return { src: 'new', owned: false }; };
  const one = new AbortController(), two = new AbortController();
  const first = acquireReaderImageResource('retryable', loader, one.signal);
  await expect(first.promise).rejects.toThrow('temporary'); one.abort();
  const retry = acquireReaderImageResource('retryable', loader, two.signal);
  expect((await retry.promise).src).toBe('new');
  expect(calls).toBe(2); two.abort();
});

test('shared chapter preparation survives one caller cancelling, then navigation hits the cache', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let calls = 0, finish!: (value: { pages: number[] }) => void;
  const query = { queryKey: ['read', 'chapter'], staleTime: 60000, gcTime: 60000,
    queryFn: async () => { calls++; return new Promise<{ pages: number[] }>(resolve => { finish = resolve; }); } };
  const one = new AbortController(), two = new AbortController();
  const first = fetchReaderChapter(client, query, one.signal).catch(error => error.name);
  const second = fetchReaderChapter(client, query, two.signal);
  one.abort(); finish({ pages: [1, 2] });
  expect(await first).toBe('AbortError');
  expect((await second).pages).toEqual([1, 2]);
  await fetchReaderChapter(client, query, new AbortController().signal);
  expect(calls).toBe(1); client.clear();
});

test('only complete, untouched legacy defaults migrate, and the marker prevents repeating it', () => {
  const { tapBehavior, hideCursorWhileReading, cursorWakeDistance, autoScrollMode, autoScrollInterval, ...old } = DEFAULT_SETTINGS;
  const legacy = { ...old, preloading: 'partial' as const };
  expect(migrateReaderSettings(legacy).preloading).toBe('full');
  expect(migrateReaderSettings(legacy, 10).preloading).toBe('partial');
  expect(migrateReaderSettings({ ...legacy, __updatedAt: 10 }).preloading).toBe('partial');
  expect(migrateReaderSettings({ ...legacy, widthPercent: 90 }).preloading).toBe('partial');
  expect(migrateReaderSettings({ ...legacy, __defaultsVersion: 1 }).preloading).toBe('partial');
  expect(migrateReaderSettings({ preloading: 'partial' }).preloading).toBe('partial');
});

test('Data Saver overrides both Full and Eager while retaining the current page window', () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => key === 'tatakai_mobile_config' ? '{"dataSaver":true}' : null } as Storage;
  try {
    const settings = { ...DEFAULT_SETTINGS, loadingStrategy: 'eager' as const };
    expect(readerPageIsEager(settings, 18, 0, false)).toBe(false);
    expect(readerPageIsEager(settings, 0, 0, false)).toBe(true);
  } finally { globalThis.localStorage = original; }
});

test('new keyboard defaults preserve keys previously assigned by the reader', () => {
  const existing = normalizeReaderKeybinds({ nextChapter: 's', reload: 'k' });
  expect(existing.nextChapter).toBe('s'); expect(existing.reload).toBe('k');
  expect(existing.toggleSettings).toBe(''); expect(existing.toggleAutoScroll).toBe('');
});

test('scrolling, returning drags, and two-finger gestures cannot become taps', () => {
  const tracker = new ReaderTapTracker();
  tracker.down(1, 0, 0); tracker.move(1, 40, 0);
  expect(tracker.up(1, 0, 0)).toBe(false);
  tracker.down(1, 0, 0); tracker.down(2, 30, 0);
  expect(tracker.up(1, 0, 0)).toBe(false); expect(tracker.up(2, 30, 0)).toBe(false);
  tracker.down(1, 0, 0); tracker.cancel(); expect(tracker.up(1, 0, 0)).toBe(false);
  tracker.down(1, 0, 0); expect(tracker.up(1, 1, 1)).toBe(true);
});
