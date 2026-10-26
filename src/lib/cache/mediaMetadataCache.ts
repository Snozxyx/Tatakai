import type { QueryClient, QueryKey } from '@tanstack/react-query';

/** Metadata only. Release lists, searches, user data and playable URLs stay live. */
export const MEDIA_METADATA_STALE_TIME = 24 * 60 * 60 * 1000;
const RETENTION = 7 * MEDIA_METADATA_STALE_TIME;
const MAX_ENTRIES = 100;
const MAX_BYTES = 5 * 1024 * 1024;
const VERSION = 1;
const STATIC_KEYS = new Set(['anime', 'manga-detail', 'novel-detail']);
const LIVE_FIELDS = new Set([
  'nextAiringEpisode', 'nextEpisode', 'nextEpisodeSchedule', 'streamingEpisodes',
  'latestChapter', 'lastUpdatedAt', 'airingSchedule',
]);

interface Entry { key: QueryKey; data: unknown; updatedAt: number }
interface Snapshot { version: number; entries: Entry[] }
export interface MetadataStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
}

export function isStaticMediaKey(key: QueryKey): boolean {
  return key.length === 2 && STATIC_KEYS.has(String(key[0])) &&
    (typeof key[1] === 'string' || typeof key[1] === 'number') && String(key[1]).length > 0;
}

function metadataOnly(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(metadataOnly);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, LIVE_FIELDS.has(key) ? null : metadataOnly(item)]));
  }
  return value;
}

/** Hydrate before mounting routes; preserve timestamps so stale data refetches. */
export async function startMediaMetadataCache(client: QueryClient, storage: MetadataStorage) {
  const entries = new Map<string, Entry>();
  let writes = Promise.resolve();
  let generation = 0;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function persist() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (!dirty) return writes;
    dirty = false;
    const revision = generation;
    writes = writes.then(async () => {
      if (revision === generation) await storage.write(snapshot());
    }).catch(() => { /* Disk full/private mode: keep the in-memory cache. */ });
    return writes;
  }
  const valid = (entry: Entry) => isStaticMediaKey(entry.key) && entry.data != null &&
    Number.isFinite(entry.updatedAt) && entry.updatedAt <= Date.now() &&
    entry.updatedAt > Date.now() - RETENTION;

  function snapshot(): string {
    const newest = [...entries.values()].filter(valid)
      .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_ENTRIES);
    const retained: Entry[] = [];
    let bytes = 0;
    for (const entry of newest) {
      const size = new TextEncoder().encode(JSON.stringify(entry)).byteLength;
      if (size > MAX_BYTES || bytes + size > MAX_BYTES) continue;
      bytes += size;
      retained.push(entry);
    }
    entries.clear();
    retained.forEach(entry => entries.set(JSON.stringify(entry.key), entry));
    return JSON.stringify({ version: VERSION, entries: retained } satisfies Snapshot);
  }

  try {
    const raw = await storage.read();
    const saved = raw ? JSON.parse(raw) as Snapshot : null;
    if (saved?.version === VERSION && Array.isArray(saved.entries)) {
      // Apply the same limits and filtering to disk data before hydration.
      for (const entry of saved.entries) {
        if (!entry || !Array.isArray(entry.key) || !valid(entry)) continue;
        entries.set(JSON.stringify(entry.key), { ...entry, data: metadataOnly(entry.data) });
      }
      snapshot();
      for (const entry of entries.values()) {
        const current = client.getQueryState(entry.key);
        if (!current || current.dataUpdatedAt < entry.updatedAt) {
          client.setQueryData(entry.key, entry.data, { updatedAt: entry.updatedAt });
        }
      }
    }
  } catch { /* Storage unavailable/corrupt: normal network requests still work. */ }

  const unsubscribe = client.getQueryCache().subscribe(event => {
    if (event.type !== 'updated' || event.action.type !== 'success' ||
        !isStaticMediaKey(event.query.queryKey) || event.query.state.data == null) return;
    const entry: Entry = {
      key: event.query.queryKey, data: metadataOnly(event.query.state.data),
      updatedAt: event.query.state.dataUpdatedAt,
    };
    entries.set(JSON.stringify(entry.key), entry);
    dirty = true;
    // Collapse bursts into one snapshot instead of serializing up to 5 MB for
    // every metadata response. A fixed window also flushes during steady traffic.
    timer ??= setTimeout(persist, 250);
  });

  const onPageHide = () => { void persist(); };
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);

  return {
    flush: persist,
    stop() {
      unsubscribe();
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
      void persist();
    },
    async clear() {
      generation++;
      dirty = false;
      if (timer) clearTimeout(timer);
      timer = undefined;
      entries.clear();
      // Remove matching memory queries as well, so revisits fetch fresh metadata.
      client.removeQueries({ predicate: query => isStaticMediaKey(query.queryKey) });
      writes = writes.then(() => storage.remove()).catch(() => {});
      await writes;
    },
  };
}
