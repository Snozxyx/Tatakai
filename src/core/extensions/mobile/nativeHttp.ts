/**
 * nativeHttp.ts — CapacitorHttp-backed `__tatakai_fetch__` for the in-WebView
 * extension runtime.
 *
 * On desktop, extension bundles fetch through a loopback proxy server (Node),
 * which exists purely to (a) bypass the WebView's CORS and (b) forward the
 * exact `Referer`/`User-Agent` a CDN demands. On mobile there is no such server
 * — but `CapacitorHttp` is a *native* HTTP client that runs outside the WebView,
 * so it has neither CORS restrictions nor forbidden-header limits. It is the
 * mobile equivalent of the desktop proxy, so extension bundles get an identical
 * capability: request any allowed domain with arbitrary headers.
 *
 * The bundle expects a `fetch`-shaped global returning a `Response`-like object
 * with `.status`, `.ok`, `.headers.get()`, `.text()`, `.json()`. We adapt
 * CapacitorHttp's `{ status, headers, data }` back into that shape.
 */

import { CapacitorHttp } from '@capacitor/core';

const unhealthyHosts = new Map<string, number>();
const HOST_COOLDOWN_MS = 90_000;

function networkFailureText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`.toLowerCase();
  try {
    return JSON.stringify(error).toLowerCase();
  } catch {
    return String(error).toLowerCase();
  }
}

function isTransientHostFailure(error: unknown): boolean {
  const text = networkFailureText(error);
  return [
    'unknownhostexception',
    'sockettimeoutexception',
    'unable to resolve host',
    'no address associated with hostname',
    'failed to connect',
    'read timed out',
    'connect timed out',
  ].some((part) => text.includes(part));
}

function unavailableHostError(hostname: string): Error {
  const error = new Error(`Provider host ${hostname} is temporarily unavailable`);
  error.name = 'NetworkUnavailableError';
  return error;
}

/** Minimal Response surface the Toko/Aurora adapters actually use. */
export interface NativeFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface NativeFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Present on standard fetch init; ignored by the native client. */
  signal?: unknown;
}

function toHeaderGetter(headers: Record<string, string> | undefined) {
  const lower = new Map<string, string>();
  for (const [k, v] of Object.entries(headers || {})) lower.set(k.toLowerCase(), String(v));
  return { get: (name: string) => lower.get(String(name).toLowerCase()) ?? null };
}

/**
 * Flatten request headers to a plain object CapacitorHttp understands.
 *
 * Critical: the Toko http helper builds headers as a WHATWG `Headers` instance,
 * whose entries are NOT own-enumerable — `Object.entries(new Headers(...))`
 * returns `[]`. Iterating it that way silently dropped every `Origin`/`Referer`/
 * `User-Agent` a provider set, so header-gated upstreams (justanime 403s
 * "Origin unknown is not allowed", animepahe, watchanimeworld, …) resolved to
 * zero sources on mobile while header-tolerant ones still worked — the exact
 * desktop/mobile provider gap. Handle `Headers`, entry arrays, and plain
 * objects so a bundle's headers always reach the native client intact.
 */
function normalizeHeaders(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  const anyIn = input as any;
  // `Headers`-like (native WebView Headers, or any Map-ish with forEach(value,key)).
  if (typeof anyIn.forEach === 'function' && typeof anyIn.get === 'function') {
    anyIn.forEach((value: string, name: string) => { out[name] = String(value); });
    return out;
  }
  // Array of [name, value] pairs.
  if (Array.isArray(anyIn)) {
    for (const pair of anyIn) {
      if (Array.isArray(pair) && pair.length >= 2) out[String(pair[0])] = String(pair[1]);
    }
    return out;
  }
  // Plain object.
  for (const [k, v] of Object.entries(anyIn)) out[k] = String(v);
  return out;
}

/**
 * Build a domain-gated native fetch for one extension. `allowedDomains` comes
 * from the manifest's `network:domain:<host>` permissions — the same gate the
 * desktop worker enforces. An empty list means "no network permission declared"
 * and every request is refused, matching desktop behavior.
 */
export function createNativeFetch(allowedDomains: string[]) {
  const allow = new Set(allowedDomains.map((d) => d.toLowerCase()));

  return async function nativeFetch(
    url: string,
    init: NativeFetchInit = {},
  ): Promise<NativeFetchResponse> {
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      const err = new Error(`PermissionDeniedError: invalid URL "${url}"`);
      err.name = 'PermissionDeniedError';
      throw err;
    }

    // Allow exact host or any parent-domain grant (`network:domain:example.com`
    // also covers `cdn.example.com`), mirroring how CDNs rotate subdomains.
    const permitted =
      allow.has(hostname) ||
      [...allow].some((d) => hostname === d || hostname.endsWith(`.${d}`));
    if (!permitted) {
      const err = new Error(
        `PermissionDeniedError: hostname "${hostname}" is not in the extension's allowed domain list`,
      );
      err.name = 'PermissionDeniedError';
      throw err;
    }

    const unhealthyUntil = unhealthyHosts.get(hostname) || 0;
    if (unhealthyUntil > Date.now()) throw unavailableHostError(hostname);
    if (unhealthyUntil) unhealthyHosts.delete(hostname);

    const headers = normalizeHeaders(init.headers);

    // Honor the bundle's AbortSignal (timeouts/retries). The native client has
    // no cancellation API, so an abort races the request: the bundle moves on
    // immediately while the orphaned native call is ignored. Without this a
    // bundle timeout never fired on mobile and every stalled provider burned
    // the full native timeout — the "servers appear very slowly" gap vs
    // desktop, where Node fetch aborts on schedule.
    const signal = init.signal as AbortSignal | undefined;
    const abortError = () => {
      try {
        return new DOMException(String((signal as { reason?: unknown })?.reason || 'Aborted'), 'AbortError');
      } catch {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        return err;
      }
    };
    if (signal?.aborted) throw abortError();

    // Shorter than the old 30s/30s: scrape requests that stall this long are
    // dead weight on mobile radio, and the bundle's own (now honored) signal
    // still governs providers that set tighter timeouts.
    const request = CapacitorHttp.request({
      url,
      method: (init.method || 'GET').toUpperCase(),
      headers,
      data: init.body as any,
      // Keep the raw payload so `.text()` and `.json()` both work regardless of
      // content type; CapacitorHttp otherwise pre-parses JSON into an object.
      responseType: 'text',
      connectTimeout: 6_000,
      readTimeout: 10_000,
    } as any);

    let res: Awaited<typeof request>;
    try {
      if (signal && typeof signal.addEventListener === 'function') {
        let onAbort: (() => void) | null = null;
        try {
          res = await Promise.race([
            request,
            new Promise<never>((_, reject) => {
              onAbort = () => reject(abortError());
              signal.addEventListener('abort', onAbort, { once: true });
            }),
          ]);
        } finally {
          if (onAbort) {
            try {
              signal.removeEventListener('abort', onAbort);
            } catch {
              /* ignore */
            }
          }
        }
      } else {
        res = await request;
      }
    } catch (error) {
      if (!signal?.aborted && isTransientHostFailure(error)) {
        unhealthyHosts.set(hostname, Date.now() + HOST_COOLDOWN_MS);
        throw unavailableHostError(hostname);
      }
      throw error;
    }

    const status = Number(res.status) || 0;
    const rawData = (res as any).data;
    const bodyText = typeof rawData === 'string' ? rawData : JSON.stringify(rawData ?? '');

    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: '',
      url: (res as any).url || url,
      headers: toHeaderGetter((res as any).headers),
      text: async () => bodyText,
      json: async () => {
        try {
          return JSON.parse(bodyText);
        } catch {
          return rawData;
        }
      },
    };
  };
}
