/**
 * src/lib/cache/boundedMap.ts
 * ------------------------------------------------------------------------------
 * Tiny shared helpers to bound the app's in-memory `Map` caches. These caches
 * already TTL-on-read, but nothing capped their *entry count*, so a long session
 * that visits many episodes/chapters/mappings grows them without limit — the
 * "leak-adjacent" growth the memory-profile work targets.
 *
 * Intentionally minimal and side-effecting on a caller-owned `Map` (so existing
 * `.get/.set/.has/.delete` call sites keep working unchanged): call `evictToCap`
 * right after a `set`, and optionally `sweepExpired` from an idle timer.
 *
 * Eviction is insertion-order (FIFO): `Map` preserves insertion order, and the
 * oldest key is the first one iterated. Callers that want LRU semantics can
 * `touch()` a key on read to move it to the newest position.
 */

/** Evict oldest entries until `map.size <= cap`. `cap <= 0` disables the cap. */
export function evictToCap<K, V>(map: Map<K, V>, cap: number): void {
  if (!Number.isFinite(cap) || cap <= 0) return;
  while (map.size > cap) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

/** Move `key` to the newest insertion position (LRU touch). No-op if absent. */
export function touch<K, V>(map: Map<K, V>, key: K): void {
  if (!map.has(key)) return;
  const value = map.get(key) as V;
  map.delete(key);
  map.set(key, value);
}

/**
 * Delete entries whose associated expiry (via `getExpiry`) is at or before
 * `now`. `getExpiry` returns an ms-epoch expiry, or `Infinity`/`0`-less for
 * "never expires" (anything non-finite or `<= 0` is treated as non-expiring).
 * Returns the number of entries removed.
 */
export function sweepExpired<K, V>(
  map: Map<K, V>,
  getExpiry: (value: V, key: K) => number,
  now: number = Date.now(),
): number {
  let removed = 0;
  for (const [key, value] of map) {
    const expiry = getExpiry(value, key);
    if (Number.isFinite(expiry) && expiry > 0 && now > expiry) {
      map.delete(key);
      removed += 1;
    }
  }
  return removed;
}
