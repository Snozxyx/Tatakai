import { describe, expect, test } from 'bun:test';
import { createSourceRequestCache } from '../src/lib/cache/sourceRequestCache';
import { spawnSync } from 'node:child_process';

test('progressive SSE integration runs with an isolated watch cache', () => {
  const result = spawnSync(process.execPath, ['test', 'scripts/download-source-stream.test.ts'], { encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
}, 35_000);

describe('download source request cache', () => {
  test('concurrent consumers share a request and receive progressive results', async () => {
    const cache = createSourceRequestCache<string[]>();
    let finish!: (value: string[]) => void;
    let publish!: (value: string[]) => void;
    let calls = 0;
    const load = (emit: typeof publish) => { calls++; publish = emit; return new Promise<string[]>(resolve => { finish = resolve; }); };
    const first: string[][] = [], second: string[][] = [];
    const a = cache.get('episode', load, value => value.length > 0, value => first.push(value));
    await Promise.resolve();
    publish(['first-server']);
    expect(cache.peek('episode')).toEqual(['first-server']);
    const b = cache.get('episode', load, value => value.length > 0, value => second.push(value));
    expect(second).toEqual([['first-server']]);
    publish(['first-server', 'slow-server']);
    finish(['first-server', 'slow-server']);
    expect(await a).toEqual(await b);
    expect(calls).toBe(1);
    expect(first.length).toBe(2);
    expect(second.length).toBe(2);
    expect(await cache.get('episode', load, () => true)).toEqual(['first-server', 'slow-server']);
    expect(calls).toBe(1);
  });
  test('empty results and errors remain retryable; clear forces a fresh request', async () => {
    const cache = createSourceRequestCache<string[]>();
    let calls = 0;
    const load = async () => { calls++; return []; };
    await cache.get('empty', load, value => value.length > 0);
    await cache.get('empty', load, value => value.length > 0);
    expect(calls).toBe(2);
    await expect(cache.get('failed', async () => { throw new Error('offline'); }, () => true)).rejects.toThrow('offline');
    expect(await cache.get('failed', async () => ['recovered'], () => true)).toEqual(['recovered']);
    cache.clear();
    expect(cache.has('failed')).toBe(false);
  });
  test('expired URLs and bounded eviction require re-resolution', async () => {
    const cache = createSourceRequestCache<string[]>(0, 1);
    await cache.get('expired', async () => ['url'], () => true);
    expect(cache.has('expired')).toBe(false);
    expect(await cache.get('expired', async () => ['new-url'], () => true)).toEqual(['new-url']);
    const bounded = createSourceRequestCache<string[]>(300_000, 1);
    await bounded.get('first', async () => ['a'], () => true);
    await bounded.get('second', async () => ['b'], () => true);
    expect(bounded.has('first')).toBe(false);
    expect(bounded.has('second')).toBe(true);
  });
});
