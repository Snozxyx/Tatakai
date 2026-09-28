/**
 * src/lib/cache/extensionResultCache.ts
 * ------------------------------------------------------------------------------
 * Persistent, union-merging list cache for extension-loaded results (anime
 * source servers, manga chapters). Purpose: revisiting a previously-loaded
 * episode/chapter should display **instantly** instead of blanking and
 * re-streaming, while newly-arriving results are unioned in — never dropped.
 *
 * Two tiers so revisits are synchronous within a session:
 *   - In-memory `Map` — synchronous instant reads (`readCachedItemsSync`).
 *   - Dexie `db.kv` (present since schema v1, no bump) — survives app restart,
 *     warmed into the Map on mount via `hydrateCachedItems`.
 *
 * ADDITIVE / REVERSIBLE by design: gated behind `VITE_ENABLE_EXT_RESULT_CACHE`
 * (default ON, mirrors the existing `VITE_ENABLE_COMBINED_SOURCE_CACHE` pattern).
 * When off, every function is a no-op / passthrough and behavior reverts exactly
 * to today. Every storage op is wrapped in try/catch — a storage failure is
 * silent and non-fatal, never breaking playback or reading.
 */

import { db } from "@/core/db/tatakai-db";
import { evictToCap, sweepExpired } from "@/lib/cache/boundedMap";
import { getProfileKnobs } from "@/lib/memoryProfile";

// ── Kill-switch ────────────────────────────────────────────────────────────────
const ENABLED =
  String((import.meta as any)?.env?.VITE_ENABLE_EXT_RESULT_CACHE ?? "true").toLowerCase() !==
  "false";

export function isExtResultCacheEnabled(): boolean {
  return ENABLED;
}

// Generous, union-only TTLs. Dead sources are demoted at *selection* time by the
// existing blocked/health/failure machinery, so the cache never needs to prune.
export const STREAM_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const MANGA_CHAPTERS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d

/** Namespaced key so this cache can never collide with other `kv` consumers. */
const K = (key: string) => `xrc::${key}`;

interface MemEntry {
  items: any[];
  expiresAt: number; // ms epoch; Infinity when no TTL
}

const mem = new Map<string, MemEntry>();

// Debounced Dexie writers, coalesced per key so a burst of per-event writes
// during streaming collapses into one IndexedDB put.
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEXIE_DEBOUNCE_MS = 400;

function expiryFrom(ttlMs: number): number {
  return ttlMs > 0 ? Date.now() + ttlMs : Number.POSITIVE_INFINITY;
}

function scheduleDexieWrite(key: string, items: any[], ttlMs: number): void {
  if (typeof setTimeout !== "function") return;
  const existing = pendingTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingTimers.delete(key);
    try {
      void db.kv.put({
        key: K(key),
        value: JSON.stringify(items),
        ttl: ttlMs > 0 ? Math.floor(ttlMs / 1000) : 0,
        createdAt: new Date().toISOString(),
      });
    } catch {
      /* storage failure is non-fatal */
    }
  }, DEXIE_DEBOUNCE_MS);
  pendingTimers.set(key, timer);
}

/**
 * Synchronous read from the in-memory tier only. Returns `null` when the cache
 * is disabled, missing, or expired. Used to *seed* a view instantly on revisit.
 */
export function readCachedItemsSync<T = any>(key: string): T[] | null {
  if (!ENABLED) return null;
  try {
    const entry = mem.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== Number.POSITIVE_INFINITY && Date.now() > entry.expiresAt) {
      mem.delete(key);
      return null;
    }
    return entry.items as T[];
  } catch {
    return null;
  }
}

/**
 * Warm the Map from Dexie (post-restart the Map is empty). Returns the hydrated
 * items, or `null` when absent/expired/disabled. Honors TTL via `createdAt+ttl`.
 */
export async function hydrateCachedItems<T = any>(key: string): Promise<T[] | null> {
  if (!ENABLED) return null;
  try {
    const row = await db.kv.get(K(key));
    if (!row) return null;
    const ttlMs = (row.ttl ?? 0) * 1000;
    const createdAt = row.createdAt ? new Date(row.createdAt).getTime() : 0;
    if (ttlMs > 0 && createdAt > 0 && Date.now() > createdAt + ttlMs) {
      try {
        await db.kv.delete(K(key));
      } catch {
        /* noop */
      }
      return null;
    }
    const items = JSON.parse(row.value) as T[];
    if (!Array.isArray(items)) return null;
    // Only seed the Map if we don't already hold a fresher in-session value.
    if (!mem.has(key)) {
      mem.set(key, { items, expiresAt: ttlMs > 0 ? createdAt + ttlMs : Number.POSITIVE_INFINITY });
    }
    return items as T[];
  } catch {
    return null;
  }
}

/**
 * Write-through: update the Map synchronously (so the next `readCachedItemsSync`
 * sees it immediately) and schedule a debounced Dexie persist. Fire-and-forget.
 */
export function writeCachedItems<T = any>(key: string, items: T[], ttlMs: number): void {
  if (!ENABLED) return;
  try {
    if (!Array.isArray(items)) return;
    mem.set(key, { items: items as any[], expiresAt: expiryFrom(ttlMs) });
    evictToCap(mem, getProfileKnobs().cacheCaps.extResult);
    scheduleDexieWrite(key, items as any[], ttlMs);
  } catch {
    /* non-fatal */
  }
}

/**
 * Drop the in-memory tier entirely (Dexie persistence is untouched, so a later
 * `hydrateCachedItems` still works). Used by the "Free memory now" reclaim and
 * the idle-reclaim provider to shed RAM without losing the durable cache.
 */
export function clearExtensionResultMem(): void {
  try {
    mem.clear();
  } catch {
    /* non-fatal */
  }
}

/** Remove expired in-memory entries; called from the idle sweep. Returns count. */
export function sweepExtensionResultMem(now: number = Date.now()): number {
  try {
    return sweepExpired(mem, (e) => e.expiresAt, now);
  } catch {
    return 0;
  }
}
