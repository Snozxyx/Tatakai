import { expect, it } from 'bun:test';
import { LookupCache, LookupOrder } from '../src/core/extensions/compatibility/lookup-cache';

it('bounds identity storage by size and LRU count, expires reads and rejects oversized payloads', () => {
  let now = 0; const cache = new LookupCache(2, 12, 100, () => now);
  cache.set('a', '111'); cache.set('b', '222'); expect(cache.get('a')).toBe('111');
  cache.set('c', '333'); expect(cache.get('b')).toBeUndefined();
  cache.set('d', '1234567'); expect(cache.get('a')).toBeUndefined(); expect(cache.get('c')).toBe('333');
  cache.set('oversized', '123456789'); expect(cache.get('oversized')).toBeUndefined();
  now = 101; expect(cache.get('c')).toBeUndefined(); expect(cache.get('d')).toBeUndefined();
});
it('tries recent fast working providers first and retains unknown/failed providers', () => {
  let now = 0; const order = new LookupOrder(() => now);
  const sources = ['failed', 'unknown', 'slow', 'fast'].map(id => ({ id }));
  order.record('failed', false, 1000); order.record('slow', true, 2000); order.record('fast', true, 50);
  expect(order.sort(sources).map(source => source.id)).toEqual(['fast', 'slow', 'unknown', 'failed']);
  expect(sources.map(source => source.id)).toEqual(['failed', 'unknown', 'slow', 'fast']);
  now = 3600001; expect(order.sort(sources)).toEqual(sources);
});
