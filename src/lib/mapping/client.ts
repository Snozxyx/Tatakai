/**
 * Thin client for TatakaiAPI's `/mapping/*` enrichment endpoints.
 *
 * ani.zip, MangaBaka and Kitsu used to be called straight from the renderer. They
 * are TatakaiAPI services now (`TatakaiAPI/src/services/mapping/*`), which buys
 * three things: one shared cache instead of one per client, one place to absorb
 * each upstream's quirks, and no third-party host in the app's CSP.
 *
 * The renderer keeps a short-lived cache of its own anyway — these responses are
 * read on nearly every page mount, and a same-process hit beats even a local HTTP
 * round trip.
 *
 * Every function here resolves to `null` instead of throwing. All three sources
 * are enrichment on top of AniList data, so a miss must degrade to "no extra
 * detail", never to a failed page render.
 */

const API_BASE = import.meta.env.VITE_TATAKAI_API_URL || "https://api.tatakai.app/api/v3";

const REQUEST_TIMEOUT_MS = 20_000;

interface CacheEntry {
  at: number;
  ttlMs: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * GET a mapping endpoint and unwrap the `{success, data}` envelope.
 *
 * `force` bypasses both caches — the local one here and, via `?force=1`, the
 * server's.
 */
export async function fetchMapping<T>(
  path: string,
  options: { ttlMs: number; signal?: AbortSignal; force?: boolean },
): Promise<T | null> {
  const url = `${API_BASE}${path}${options.force ? (path.includes("?") ? "&" : "?") + "force=1" : ""}`;

  if (!options.force) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < hit.ttlMs) return hit.value as T | null;
    const pending = inFlight.get(url);
    if (pending) return pending as Promise<T | null>;
  }

  const request = (async (): Promise<T | null> => {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Tatakai-Client": "web",
          "X-Tatakai-Version": "6.0.0",
        },
        signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      // 404 is the endpoints' way of saying "upstream has no record for this id".
      // It is cached like any other answer so an unmapped title doesn't re-request
      // on every mount.
      if (!res.ok) {
        cache.set(url, { at: Date.now(), ttlMs: options.ttlMs, value: null });
        return null;
      }

      const body = (await res.json()) as { success?: boolean; data?: T };
      const value = body?.success === true ? (body.data ?? null) : null;
      cache.set(url, { at: Date.now(), ttlMs: options.ttlMs, value });
      return value;
    } catch {
      cache.set(url, { at: Date.now(), ttlMs: options.ttlMs, value: null });
      return null;
    } finally {
      inFlight.delete(url);
    }
  })();

  inFlight.set(url, request);
  return request;
}

/** Drop cached mapping responses whose URL contains `match`, or all of them. */
export function clearMappingCache(match?: string): void {
  if (!match) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.includes(match)) cache.delete(key);
  }
}
