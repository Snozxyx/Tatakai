/**
 * src/core/cache/query-cache.ts
 * TTL-based cache using localStorage for lightweight in-tab persistence.
 * Falls back to an in-memory Map when localStorage is unavailable (SSR, private browsing).
 *
 * For heavier persistent caching (IndexedDB) this will be extended in Phase 1b.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class QueryCache {
  private mem = new Map<string, CacheEntry<unknown>>();
  private readonly prefix = 'tatakai:cache:';

  // ── Write ────────────────────────────────────────────────────────────────

  set<T>(key: string, value: T, ttlMs: number): void {
    const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };

    // Memory (always)
    this.mem.set(key, entry as CacheEntry<unknown>);

    // localStorage (best-effort)
    try {
      localStorage.setItem(
        this.prefix + key,
        JSON.stringify(entry),
      );
    } catch {
      // Quota exceeded or unavailable — mem only is fine
    }
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  get<T>(key: string): T | null {
    // Memory first
    const memEntry = this.mem.get(key) as CacheEntry<T> | undefined;
    if (memEntry) {
      if (Date.now() < memEntry.expiresAt) return memEntry.value;
      this.mem.delete(key);
    }

    // localStorage fallback
    try {
      const raw = localStorage.getItem(this.prefix + key);
      if (raw) {
        const entry = JSON.parse(raw) as CacheEntry<T>;
        if (Date.now() < entry.expiresAt) {
          // Warm memory
          this.mem.set(key, entry as CacheEntry<unknown>);
          return entry.value;
        }
        localStorage.removeItem(this.prefix + key);
      }
    } catch {
      // Unavailable
    }

    return null;
  }

  // ── Invalidate ────────────────────────────────────────────────────────────

  delete(key: string): void {
    this.mem.delete(key);
    try { localStorage.removeItem(this.prefix + key); } catch { /* noop */ }
  }

  invalidatePrefix(prefix: string): void {
    for (const key of [...this.mem.keys()]) {
      if (key.startsWith(prefix)) this.mem.delete(key);
    }
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(this.prefix + prefix)) localStorage.removeItem(k);
      }
    } catch { /* noop */ }
  }

  clear(): void {
    this.mem.clear();
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(this.prefix)) localStorage.removeItem(k);
      }
    } catch { /* noop */ }
  }
}

// Singleton — shared across the whole app
export const queryCache = new QueryCache();

// TTL presets
export const TTL = {
  /** 5 minutes — hot data (currently airing, trending) */
  HOT: 5 * 60_000,
  /** 1 hour — warm data (seasonal lists, top-rated) */
  WARM: 60 * 60_000,
  /** 24 hours — cold data (finished series metadata) */
  COLD: 24 * 60 * 60_000,
} as const;
