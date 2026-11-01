const KEY = "tatakai:release-feeds:v1";
const FRESH_MS = 5 * 60_000;
const MAX_AGE_MS = 24 * 60 * 60_000;
type CachedFeed = { at: number; value: { results: unknown[] } };

/** Public release data; cache keys include provider, date window, page and adult preference. */
export async function cachedCalendarFeed<
  T extends { results: unknown[]; stale?: boolean }
>(
  key: string,
  load: () => Promise<T>,
  storage?: Pick<Storage, "getItem" | "setItem">,
  now = Date.now()
): Promise<T> {
  if (!storage && typeof localStorage !== "undefined") storage = localStorage;
  let cache: Record<string, CachedFeed> = {};
  try {
    cache = JSON.parse(storage?.getItem(KEY) || "{}");
  } catch {
    /* unavailable/full storage */
  }
  const hit = cache?.[key];
  const valid =
    hit &&
    Number.isFinite(hit.at) &&
    Array.isArray(hit.value?.results) &&
    now - hit.at <= MAX_AGE_MS;
  if (valid && now - hit.at < FRESH_MS) return hit.value as T;
  try {
    const value = await load();
    const entries = Object.entries(cache || {}).filter(
      ([entryKey, row]) =>
        entryKey !== key &&
        Number.isFinite(row?.at) &&
        now - row.at <= MAX_AGE_MS
    );
    entries.push([key, { at: now, value }]);
    const retained = Object.fromEntries(
      entries.sort((a, b) => b[1].at - a[1].at).slice(0, 64)
    );
    try {
      storage?.setItem(KEY, JSON.stringify(retained));
    } catch {
      /* in-memory query cache still works */
    }
    return value;
  } catch (error) {
    if (
      valid &&
      !(error instanceof DOMException && error.name === "AbortError")
    )
      return { ...hit.value, stale: true } as T;
    throw error;
  }
}
