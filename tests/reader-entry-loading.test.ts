import { describe, expect, test } from 'bun:test';
import { abortableReaderTask, readerDelay, readerEntryPages, readerEntryReady, scheduleReaderImage } from '../src/lib/reader/loading';

describe('manga reader entry', () => {
  const pages = Array.from({ length: 100 }, (_, i) => ({ pageNumber: i + 1 }));
  test('opens once the first page settles, without waiting for 99 distant pages', () => {
    expect(readerEntryReady(pages, new Set([1]), 0)).toBe(true);
    expect(readerEntryReady(pages, new Set([2, 3]), 0)).toBe(false);
  });
  test('waits for the saved starting page, or both pages of a spread', () => {
    expect(readerEntryReady(pages, new Set([1, 2]), 49)).toBe(false);
    expect(readerEntryReady(pages, new Set([50]), 49)).toBe(true);
    expect(readerEntryReady(pages, new Set([50]), 49, true)).toBe(false);
    expect(readerEntryReady(pages, new Set([50, 51]), 49, true)).toBe(true);
    expect(readerEntryReady(pages, new Set([100]), 1000, true)).toBe(true);
    expect(readerEntryPages(pages, NaN)).toEqual([pages[0]]);
    expect(readerEntryReady([], new Set(), 0)).toBe(false);
  });
  test('cancels promptly while native provider work finishes independently', async () => {
    const controller = new AbortController();
    let complete!: (value: string) => void;
    const provider = new Promise<string>(resolve => { complete = resolve; });
    const subscriber = abortableReaderTask(provider, controller.signal);
    controller.abort();
    await expect(subscriber).rejects.toHaveProperty('name', 'AbortError');
    complete('late result');
    expect(await provider).toBe('late result');
  });
  test('a cancelled subscriber cannot cancel another consumer of shared work', async () => {
    const controller = new AbortController();
    let complete!: (value: number) => void;
    const shared = new Promise<number>(resolve => { complete = resolve; });
    const first = abortableReaderTask(shared, controller.signal);
    const second = abortableReaderTask(shared);
    controller.abort();
    await expect(first).rejects.toHaveProperty('name', 'AbortError');
    complete(42);
    expect(await second).toBe(42);
  });
  test('cancellation clears an outstanding retry delay', async () => {
    const controller = new AbortController();
    const waiting = readerDelay(30000, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toHaveProperty('name', 'AbortError');
  });

  test('blob work stays bounded and cancelled queued pages never start', async () => {
    const active: string[] = [];
    const release: Array<() => void> = [];
    const running = ['a', 'b', 'c'].map(name => scheduleReaderImage(async () => {
      active.push(name);
      await new Promise<void>(resolve => release.push(resolve));
    }, new AbortController().signal));
    const controller = new AbortController();
    const cancelled = scheduleReaderImage(async () => { active.push('cancelled'); }, controller.signal);
    const starting = scheduleReaderImage(async () => { active.push('starting'); }, new AbortController().signal, 10);
    expect(active).toEqual(['a', 'b', 'c']);
    controller.abort();
    await expect(cancelled).rejects.toHaveProperty('name', 'AbortError');
    release[0]();
    await starting;
    expect(active).toEqual(['a', 'b', 'c', 'starting']);
    release[1](); release[2]();
    await Promise.all(running);
  });
});
