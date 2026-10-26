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
import { registerNativeSource, prepareNativeRequestHeaders } from '@/core/mobile/localProxyNative';
import { loadMobileConfig } from '@/hooks/ui/useMobileConfig';
import { hasIosExtensionHttp, requestIosExtensionHttp } from './iosExtensionHttp';

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
  rawHeaders?: Record<string, string[]>;
  cookies?: Record<string, string>;
  url: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface NativeFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Aborts iOS native text requests; other native paths race their result. */
  signal?: unknown;
}

function toHeaderGetter(headers: Record<string, string> | undefined) {
  const lower = new Map<string, string>();
  for (const [k, v] of Object.entries(headers || {})) lower.set(k.toLowerCase(), String(v));
  return { get: (name: string) => lower.get(String(name).toLowerCase()) ?? null };
}

/**
 * Novel/manga scraping proxy — the mobile twin of the desktop worker-pool
 * `__tatakai_fetch__` forwarding (`/proxy?url=` on the loopback proxy).
 *
 * WAF-walled novel origins (webnovel / royalroad / novelfull /
 * justlightnovels / …) answer a direct device fetch with 403 "access
 * blocked" but succeed through the native loopback, which replays headers
 * and runs the on-device Cloudflare solver before answering. Any HTTP status
 * out of the loopback is a real answer (challenges are already retried
 * server-side); only a network failure returns null so the caller falls
 * back to the direct CapacitorHttp path.
 *
 * Register a token and use `/stream/<token>`, supported on Android and iOS.
 * Registration carries all provider headers; CapacitorHttp reads the loopback
 * outside WebView mixed-content restrictions. POSTs remain native HTTP calls.
 */
async function fetchViaLoopbackProxy(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal | null,
): Promise<{ status: number; headers: Record<string, string>; data: string; url: string } | null> {
  try {
    const proxyUrl = await registerNativeSource(url, headers);
    if (!proxyUrl || !/^http:\/\/127\.0\.0\.1:\d+\/stream\/[a-f0-9]{32}$/i.test(proxyUrl)) return null;
    if (signal?.aborted) return null;
    const response = await CapacitorHttp.request({ url: proxyUrl, method: 'GET', responseType: 'text', connectTimeout: 6000, readTimeout: 65000 });
    return { ...response, data: typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? ''), url };
  } catch {
    return null;
  }
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
      allow.has("*") || allow.has(hostname) ||
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
    const binaryBody = init.body instanceof ArrayBuffer ? new Uint8Array(init.body)
      : ArrayBuffer.isView(init.body) ? new Uint8Array(init.body.buffer, init.body.byteOffset, init.body.byteLength) : null;
    const binaryResponse = Boolean(binaryBody) || Object.entries(headers).some(([key, value]) => key.toLowerCase() === 'accept' && /grpc|octet-stream/.test(value));
    let requestData = init.body;
    if (binaryBody) {
      let encoded = '';
      for (let offset = 0; offset < binaryBody.length; offset += 8192) encoded += String.fromCharCode(...binaryBody.subarray(offset, offset + 8192));
      requestData = btoa(encoded);
    }

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
    const request = (async () => {
      // Native HTTP already supports provider headers and avoids CORS. Only
      // blocked hosts need the loopback solver; proxying every API/search first
      // adds token registration and consumes the proxy's playback connections.
      const isProxyableGet = (init.method || 'GET').toUpperCase() === 'GET' && init.body == null && !binaryBody;
      const directHeaders = await prepareNativeRequestHeaders(url, headers);
      if (signal?.aborted) throw abortError();
      const iosText = hasIosExtensionHttp() && !binaryResponse && (requestData == null || typeof requestData === 'string');
      const initial = iosText ? await requestIosExtensionHttp(url, { method: init.method || 'GET', headers: directHeaders, body: requestData as string | undefined, signal }).then(response => ({ status: response.status, headers: response.headers, data: response.body, url: response.url, cookies: response.cookies })) : await CapacitorHttp.request({
      url,
      method: (init.method || 'GET').toUpperCase(),
      headers: directHeaders,
      data: requestData as any,
      ...(binaryBody ? { dataType: 'file' } : {}),
      // Keep the raw payload so `.text()` and `.json()` both work regardless of
      // content type; CapacitorHttp otherwise pre-parses JSON into an object.
      responseType: binaryResponse ? 'arraybuffer' : 'text',
      connectTimeout: 6_000,
      readTimeout: 10_000,
      } as any);
      // Provider searches use CapacitorHttp too. Hand a detected GET challenge
      // to the native proxy so metadata and playback share the same solver.
      const text = typeof initial.data === 'string' ? initial.data.slice(0, 65536).toLowerCase() : '';
      const challenged = [200, 403, 503, 429].includes(initial.status)
        && ['cf-browser-verification', 'cf_chl_', 'cf-chl-', 'challenge-platform', 'turnstile', 'just a moment', '__cf_chl_tk'].some((marker) => text.includes(marker));
      if (isProxyableGet && ([403, 503].includes(initial.status) || (loadMobileConfig().cloudflareBypass && challenged))) {
        if (signal?.aborted) throw abortError();
        const loopback = await fetchViaLoopbackProxy(url, headers, signal);
        if (loopback) return loopback;
      }
      return initial;
    })();

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
    const bytes = binaryResponse
      ? Uint8Array.from(atob(typeof rawData === 'string' ? rawData : ''), char => char.charCodeAt(0))
      : new TextEncoder().encode(typeof rawData === 'string' ? rawData : JSON.stringify(rawData ?? ''));
    const bodyText = new TextDecoder().decode(bytes);

    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: '',
      url: (res as any).url || url,
      headers: toHeaderGetter((res as any).headers),
      rawHeaders: Object.fromEntries(Object.entries((res as any).headers || {}).map(([k, v]) => [k.toLowerCase(), [String(v)]])),
      cookies: { ...(res as any).cookies, ...Object.fromEntries(String((res as any).headers?.['set-cookie'] || '').split(/,(?=[^;,]+=)/).map(pair => pair.split(';')[0].split('=')).filter(pair => pair.length > 1)) },
      text: async () => bodyText,
      arrayBuffer: async () => bytes.slice().buffer,
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
