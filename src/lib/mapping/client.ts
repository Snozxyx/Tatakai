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

import { evictToCap, sweepExpired } from "@/lib/cache/boundedMap";
import { getProfileKnobs } from "@/lib/memoryProfile";
import { resolveApiV3Base } from "@/lib/api/backendOrigin";

// Resolve the backend `/api/v3` base the same way every other client does
// (VITE_BACKEND_ORIGIN → origin of VITE_TATAKAI_API_URL → http page origin →
// relative "/api/v3" for web dev). The old hardcoded "https://api.tatakai.app"
// fallback pointed at a dead host, so ani.zip episode enrichment silently
// returned null on desktop (app:// origin) and every non-configured build.
const API_BASE = resolveApiV3Base();

const REQUEST_TIMEOUT_MS = 20_000;

interface CacheEntry {
  at: number;
  ttlMs: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Store a cache entry and enforce the memory-profile entry cap. Every write path
 * (hit, 404, error) funnels through here so the map can never outgrow the cap.
 */
function setCache(url: string, entry: CacheEntry): void {
  cache.set(url, entry);
  evictToCap(cache, getProfileKnobs().cacheCaps.mapping);
}

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
        // Only the CORS-safelisted `Accept` header here — no X-Tatakai-Client/
        // Version. Those are non-safelisted, so cross-origin (web → api.tatakai.me,
        // desktop app:// → api) they force a CORS preflight, and the API's
        // preflight only allows Content-Type,Authorization,X-Admin-Secret. The
        // unlisted headers made the browser block the GET → fetch threw → this
        // returned null → ani.zip enrichment vanished (no episode thumbnails, so
        // the list fell back to the numbered-pill layout). A bare GET has no
        // preflight and the API answers with `access-control-allow-origin: *`.
        headers: {
          Accept: "application/json",
        },
        signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      // 404 is the endpoints' way of saying "upstream has no record for this id".
      // It is cached like any other answer so an unmapped title doesn't re-request
      // on every mount.
      if (!res.ok) {
        setCache(url, { at: Date.now(), ttlMs: options.ttlMs, value: null });
        return null;
      }

      const body = (await res.json()) as { success?: boolean; data?: T };
      const value = body?.success === true ? (body.data ?? null) : null;
      setCache(url, { at: Date.now(), ttlMs: options.ttlMs, value });
      return value;
    } catch {
      setCache(url, { at: Date.now(), ttlMs: options.ttlMs, value: null });
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

/** Remove expired mapping entries; called from the idle sweep. Returns count. */
export function sweepMappingCache(now: number = Date.now()): number {
  try {
    return sweepExpired(cache, (e) => e.at + e.ttlMs, now);
  } catch {
    return 0;
  }
}
