import { EXTENSION_INSTALLED_EVENT } from '../ecosystems';

/** Bounded identity strings only: no HTML, images, streams, headers or failures. */
export class LookupCache {
  private rows = new Map<string, { value: string; expires: number }>();
  private characters = 0;
  constructor(private capacity = 128, private maxCharacters = 65536, private ttl = 120000, private now = () => Date.now()) {}
  get(key: string): string | undefined {
    const row = this.rows.get(key);
    if (!row) return;
    if (row.expires <= this.now()) { this.delete(key); return; }
    this.rows.delete(key); this.rows.set(key, row);
    return row.value;
  }
  set(key: string, value: string) {
    this.delete(key);
    if (key.length + value.length > this.maxCharacters) return;
    for (const [id, row] of this.rows) if (row.expires <= this.now()) this.delete(id);
    this.rows.set(key, { value, expires: this.now() + this.ttl }); this.characters += key.length + value.length;
    while (this.rows.size > this.capacity || this.characters > this.maxCharacters) this.delete(this.rows.keys().next().value!);
  }
  delete(key: string) { const row = this.rows.get(key); if (row) { this.characters -= key.length + row.value.length; this.rows.delete(key); } }
  clear() { this.rows.clear(); this.characters = 0; }
}

export class LookupOrder {
  private rows = new Map<string, { ok: boolean; ms: number; expires: number }>();
  constructor(private now = () => Date.now()) {}
  record(id: string, ok: boolean, ms: number) {
    this.rows.delete(id); this.rows.set(id, { ok, ms, expires: this.now() + 3600000 });
    while (this.rows.size > 128) this.rows.delete(this.rows.keys().next().value!);
  }
  sort<T extends { id: string }>(sources: T[]): T[] {
    for (const [id, row] of this.rows) if (row.expires <= this.now()) this.rows.delete(id);
    const score = (id: string) => { const row = this.rows.get(id); return row ? row.ok ? [0, row.ms] : [2, row.ms] : [1, 0]; };
    return [...sources].sort((a, b) => { const left = score(a.id), right = score(b.id); return left[0] - right[0] || left[1] - right[1]; });
  }
  clear() { this.rows.clear(); }
}

const caches = new WeakMap<object, { titles: LookupCache; episodes: LookupCache; order: LookupOrder }>();
export function watchLookupCache() {
  const owner = typeof window !== 'undefined' ? window : globalThis;
  let cache = caches.get(owner);
  if (!cache) {
    cache = { titles: new LookupCache(), episodes: new LookupCache(32, 262144), order: new LookupOrder() };
    caches.set(owner, cache);
    owner.addEventListener?.(EXTENSION_INSTALLED_EVENT, () => { cache!.titles.clear(); cache!.episodes.clear(); cache!.order.clear(); });
  }
  return cache;
}
export function clearWatchLookupCache() { const cache = watchLookupCache(); cache.titles.clear(); cache.episodes.clear(); }
