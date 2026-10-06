/**
 * mobileProxy.ts — in-app proxy for the Capacitor extension runtime.
 *
 * Mobile counterpart to `desktop/runtime/proxy/local-proxy-server.cjs`
 * (`LocalProxyServer`) + the `applyProxy` step in
 * `desktop/runtime/extension-api-host/host-server.cjs`.
 *
 * Desktop registers every header-gated media URL (HLS/MP4 + subtitle tracks +
 * manga page images) with a loopback HTTP server and hands the renderer a
 * `http://127.0.0.1:<port>/stream/<token>` URL. The server replays the exact
 * `Referer`/`User-Agent` the CDN demands, rewrites `.m3u8` child references to
 * fresh tokens, and answers with `Access-Control-Allow-Origin: *` so the
 * WebView can load everything.
 *
 * There is no Node server inside the Capacitor WebView, so this module provides
 * the same registry semantics in-process:
 *
 *   registerMobileSource({ url, headers }) -> `mobile-proxy://stream/<token>`
 *
 * The token URL is opaque — it is never fetched over the network. Each consumer
 * resolves it through this module with the native HTTP client (CapacitorHttp,
 * CORS-free with real header replay, i.e. the mobile equivalent of the desktop
 * proxy fetch):
 *
 *   HLS playlists/segments/keys -> nativeHlsLoader (rewrites child refs to
 *                                   fresh tokens, like `_rewritePlaylistUrls`)
 *   manga / cover images         -> getMobileProxyImageBlobUrl (blob: URL for <img>)
 *   MP4 direct files             -> getMobileProxyMediaBlobUrl (blob: URL for <video>)
 *   subtitles (.vtt/.srt/.ass)   -> fetchMobileProxyText (+ normalize to VTT)
 *
 * Sources keep their original URL in `originalUrl` (mirroring desktop), so a
 * dead token (15-minute expiry, app restart) can be re-registered from the
 * source's own `headers`, and downloaders can always recover the real URL.
 */

import { CapacitorHttp } from '@capacitor/core';
import { mirrorTokenToNative } from '@/core/mobile/localProxyNative';
import {
  UPSTREAM_TIMEOUT_MS,
  UPSTREAM_RETRY_DELAY_MS,
  buildProxyOutboundHeaders,
  headerCacheKey,
  isHlsPlaylist,
  proxyDelay,
  rewriteProxyPlaylist,
  shouldRetryUpstream,
} from '@/core/proxy/proxyShared';

export const MOBILE_PROXY_SCHEME = 'mobile-proxy://stream/';

/**
 * Native loopback base (e.g. `http://127.0.0.1:43127`), set once
 * `ensureNativeProxy()` resolves in `bootstrapMobile()`. When present,
 * `registerMobileSource` returns native `/stream/<token>` URLs — the exact
 * desktop `LocalProxyServer` shape — so `<video>` / `<img>` / HLS / subtitles /
 * downloads load with a plain HTTP request (headers replayed natively, Range +
 * playlist rewrite on the server). Falls back to `mobile-proxy://` otherwise.
 */
let nativeProxyBaseUrl: string | null = null;

export function setNativeProxyBaseUrl(baseUrl: string | null): void {
  const clean = String(baseUrl || '').replace(/\/$/, '');
  nativeProxyBaseUrl = /^http:\/\/127\.0\.0\.1:\d+$/i.test(clean) ? clean : null;
}

export function getNativeProxyBaseUrl(): string | null {
  return nativeProxyBaseUrl;
}

/** True for native loopback stream URLs (`http://127.0.0.1:<port>/stream/<token>`). */
export function isNativeProxyUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (nativeProxyBaseUrl && value.startsWith(`${nativeProxyBaseUrl}/stream/`)) return true;
  return /^http:\/\/127\.0\.0\.1:\d+\/stream\/[a-f0-9]{32}/i.test(value);
}

/** True for any proxied URL (native loopback OR in-memory token). */
export function isAnyProxyUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return value.startsWith(MOBILE_PROXY_SCHEME) || isNativeProxyUrl(value);
}

function tokenOfNativeProxyUrl(proxyUrl: string): string {
  const tail = proxyUrl.split('/stream/', 2)[1] || '';
  return tail.split(/[?#]/, 1)[0].toLowerCase();
}

/** Same default UA the desktop proxy sends when a source has none. */
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/** Token lifetime mirrors the desktop `_tokenMap` 15-minute sweep. */
const TOKEN_TTL_MS = 15 * 60 * 1000;

interface MobileProxyEntry {
  url: string;
  headers: Record<string, string>;
  createdAt: number;
}

const tokenMap = new Map<string, MobileProxyEntry>();

/** Blob URLs minted from proxy payloads (dedupe + bounded cache).
 *
 * Two independent LRU buckets: image pages and full-file media share one
 * budget, so a single large MP4 blob (a `media:` entry is 100–800 MB) evicted
 * every reader page the user had already viewed — that's exactly the "images
 * only reappear after closing the app" symptom. Reader pages stay resident in
 * their own 250-slot bucket, so back-scrolling stays instant; media blobs
 * have a much smaller slot count because a given session almost never has
 * more than a handful of direct files open.
 */
const blobCache = new Map<string, string>();
const blobInflight = new Map<string, Promise<string | null>>();
const MAX_BLOB_ENTRIES = 250;
const MAX_MEDIA_BLOB_ENTRIES = 16;

const isMediaKey = (key: string): boolean => key.startsWith('media:');

function mintToken(): string {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return `${Date.now().toString(16)}${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
  }
}

function sweepTokens(): void {
  const cutoff = Date.now() - TOKEN_TTL_MS;
  for (const [token, entry] of tokenMap) {
    if (entry.createdAt < cutoff) tokenMap.delete(token);
  }
  // Two independent LRU budgets so a large media blob cannot evict reader
  // pages the user has already scrolled through — the "images only reappear
  // after closing the app" symptom. Map iteration order is insertion order,
  // so the oldest entries of a bucket are evicted first.
  const evictBucket = (limit: number, matches: (key: string) => boolean): void => {
    let count = 0;
    for (const key of blobCache.keys()) if (matches(key)) count += 1;
    let toDrop = count - limit;
    if (toDrop <= 0) return;
    for (const key of Array.from(blobCache.keys())) {
      if (toDrop <= 0) break;
      if (!matches(key)) continue;
      const url = blobCache.get(key);
      blobCache.delete(key);
      if (url) {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      }
      toDrop -= 1;
    }
  };
  evictBucket(MAX_BLOB_ENTRIES, (key) => !isMediaKey(key));
  evictBucket(MAX_MEDIA_BLOB_ENTRIES, isMediaKey);
}

export function isMobileProxyUrl(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(MOBILE_PROXY_SCHEME);
}

function tokenOf(proxyUrl: string): string {
  return proxyUrl.slice(MOBILE_PROXY_SCHEME.length).split(/[?#]/, 1)[0];
}

/**
 * Resolve a proxy URL to its stored `{ url, headers }`, or null when the
 * token is unknown/expired (mirrors the desktop 410 "stream token expired").
 * Handles both `mobile-proxy://` tokens and native loopback
 * `http://127.0.0.1:<port>/stream/<token>` URLs (same token space).
 */
export function resolveMobileProxy(proxyUrl: string): MobileProxyEntry | null {
  const token = isMobileProxyUrl(proxyUrl)
    ? tokenOf(proxyUrl)
    : isNativeProxyUrl(proxyUrl)
      ? tokenOfNativeProxyUrl(proxyUrl)
      : null;
  if (!token) return null;
  const entry = tokenMap.get(token);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TOKEN_TTL_MS) {
    tokenMap.delete(token);
    return null;
  }
  return entry;
}

/**
 * Recover the real upstream URL for a proxy URL without needing the token to
 * be alive: live tokens resolve from the map, otherwise fall back to the
 * source-carried `originalUrl` (desktop parity — proxied sources always carry
 * it). Returns the input unchanged when it is not a proxy URL.
 */
export function unwrapMobileProxyUrl(
  proxyUrl: string,
  fallback?: { originalUrl?: string },
): string {
  if (!isMobileProxyUrl(proxyUrl) && !isNativeProxyUrl(proxyUrl)) return proxyUrl;
  const live = resolveMobileProxy(proxyUrl);
  if (live) return live.url;
  const original = String(fallback?.originalUrl || '').trim();
  return original || proxyUrl;
}

/** Flatten `Headers`-instances / entry arrays / plain objects (same gap the
 *  native fetch shim had to close: WHATWG `Headers` entries are not
 *  own-enumerable, so `Object.entries()` silently drops them). */
export function normalizeMobileHeaders(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  const anyIn = input as any;
  if (typeof anyIn.forEach === 'function' && typeof anyIn.get === 'function') {
    try {
      anyIn.forEach((value: string, name: string) => {
        out[String(name)] = String(value);
      });
    } catch {
      /* ignore malformed header bags */
    }
    return out;
  }
  if (Array.isArray(anyIn)) {
    for (const pair of anyIn) {
      if (Array.isArray(pair) && pair.length >= 2) out[String(pair[0])] = String(pair[1]);
    }
    return out;
  }
  if (typeof anyIn === 'object') {
    for (const [k, v] of Object.entries(anyIn)) {
      if (v != null) out[k] = String(v);
    }
  }
  return out;
}

function withDefaultHeaders(headers: Record<string, string>): Record<string, string> {
  const out = { ...headers };
  const hasUA = Object.keys(out).some((k) => k.toLowerCase() === 'user-agent');
  if (!hasUA) out['User-Agent'] = DEFAULT_USER_AGENT;
  return out;
}

/**
 * Register an upstream URL + its required headers.
 *
 * When the native loopback proxy is running, returns a desktop-shaped
 * `http://127.0.0.1:<port>/stream/<token>` URL (plain HTTP load, headers
 * replayed natively — anime HLS/MP4, subtitles, manga images, download assets
 * all share this path). Otherwise returns the opaque
 * `mobile-proxy://stream/<token>` URL resolved via CapacitorHttp.
 * Mirrors `LocalProxyServer.registerSource` (random token, header capture,
 * 15-minute sweep). Never throws — falls back to the raw URL.
 */
export function registerMobileSource(input: {
  url: string;
  headers?: unknown;
}): string {
  const url = String(input?.url || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return url;
  const headers = withDefaultHeaders(normalizeMobileHeaders(input?.headers));
  try {
    sweepTokens();
    const token = mintToken().toLowerCase();
    tokenMap.set(token, { url, headers, createdAt: Date.now() });
    if (nativeProxyBaseUrl) {
      // Dispatch the native registration immediately. This used to sit behind
      // a dynamic import, so the WebView could start fetching the returned
      // loopback URL before the import chunk/Capacitor call had even run. On
      // slower phones that produced an initial 410 and sent hls.js into its
      // multi-second retry ladder. localProxyNative has no dependency on this
      // module, so a direct import is safe and removes that race window.
      try {
        mirrorTokenToNative(token, url, headers);
      } catch {
        /* JS fallback below still works */
      }
      return `${nativeProxyBaseUrl}/stream/${token}`;
    }
    return `${MOBILE_PROXY_SCHEME}${token}`;
  } catch {
    return url;
  }
}

/**
 * Re-register when a token died but the source still carries its own
 * `originalUrl` + `headers` (e.g. a Dexie-seeded cache row from before a
 * restart). Returns a live proxy URL, or the best-effort raw URL.
 */
export function reregisterMobileSource(input: {
  url?: string;
  originalUrl?: string;
  headers?: unknown;
}): string {
  const raw = String(input?.originalUrl || input?.url || '').trim();
  if (!raw) return String(input?.url || '');
  if (!/^https?:\/\//i.test(raw)) return raw;
  return registerMobileSource({ url: raw, headers: input?.headers });
}

function resolveTarget(
  proxyOrUrl: string,
  fallback?: { originalUrl?: string; headers?: unknown },
): { url: string; headers: Record<string, string>; nativeDirect?: boolean } {
  // Native loopback URLs already carry their headers server-side: fetch them
  // directly (plain HTTP load, desktop parity) instead of unwrapping to the
  // upstream and replaying headers from JS.
  if (isNativeProxyUrl(proxyOrUrl)) {
    return { url: proxyOrUrl, headers: {}, nativeDirect: true };
  }
  if (isMobileProxyUrl(proxyOrUrl)) {
    const live = resolveMobileProxy(proxyOrUrl);
    if (live) return { url: live.url, headers: live.headers };
    const raw = String(fallback?.originalUrl || '').trim();
    if (raw) {
      return { url: raw, headers: withDefaultHeaders(normalizeMobileHeaders(fallback?.headers)) };
    }
    return { url: proxyOrUrl, headers: {} };
  }
  const stored = normalizeMobileHeaders(fallback?.headers);
  return { url: proxyOrUrl, headers: withDefaultHeaders(stored) };
}

function headerValue(headers: Record<string, string> | undefined, name: string): string | null {
  if (!headers) return null;
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) return String(v);
  }
  return null;
}

function mergeHeaders(
  base: Record<string, string>,
  extra?: Record<string, string>,
  range?: string,
): Record<string, string> {
  // Desktop `_handleRequest` outbound block — kept identical via the shared
  // module (default UA, identity encoding, Range passthrough).
  return buildProxyOutboundHeaders(base, extra, range);
}

/** Chunked base64 → ArrayBuffer (a single `atob` on a multi-MB segment blows
 *  the stack / OOMs the WebView — this is the HLS segment path). */
export function base64ToArrayBufferChunked(base64: string): ArrayBuffer {
  const clean = String(base64 || '').replace(/\s/g, '');
  if (!clean) return new ArrayBuffer(0);
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const byteLen = Math.floor((clean.length * 3) / 4) - padding;
  const bytes = new Uint8Array(Math.max(0, byteLen));
  // Split on 4-char boundaries only (atob rejects partial quanta).
  const CHUNK = 32768;
  let offset = 0;
  for (let i = 0; i < clean.length; i += CHUNK) {
    const slice = clean.slice(i, i + CHUNK);
    const bin = atob(slice);
    for (let j = 0; j < bin.length && offset < bytes.length; j += 1) {
      bytes[offset] = bin.charCodeAt(j);
      offset += 1;
    }
  }
  return bytes.buffer;
}

/** Copy any buffer/view into a plain `ArrayBuffer` (newer DOM libs type
 *  `SharedArrayBuffer` slices separately, which `Blob`/hls reject). */
export function copyToArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const out = new Uint8Array(view.byteLength);
  out.set(bytes);
  return out.buffer;
}

function toArrayBuffer(raw: unknown): ArrayBuffer | null {
  if (raw == null) return null;
  if (raw instanceof ArrayBuffer) return raw;
  if (ArrayBuffer.isView(raw)) {
    return copyToArrayBuffer(raw as ArrayBufferView);
  }
  if (typeof raw === 'string') {
    // Heuristic: CapacitorHttp `arraybuffer` responses arrive base64-encoded;
    // plain text (error pages) decodes to garbage — only decode when it looks
    // like base64 and is long enough to be binary.
    const compact = raw.replace(/\s/g, '');
    if (compact.length > 64 && /^[A-Za-z0-9+/=_-]+$/.test(compact)) {
      try {
        return base64ToArrayBufferChunked(compact);
      } catch {
        return null;
      }
    }
    return new TextEncoder().encode(raw).buffer;
  }
  try {
    return new TextEncoder().encode(JSON.stringify(raw)).buffer;
  } catch {
    return null;
  }
}

export interface MobileProxyFetchResult {
  ok: boolean;
  status: number;
  url: string;
  contentType: string;
  headers: Record<string, string>;
  data: ArrayBuffer | null;
  text: string | null;
}

async function capacitorRequest(
  url: string,
  headers: Record<string, string>,
  responseType: 'text' | 'arraybuffer',
  timeoutMs: number,
): Promise<{ status: number; headers: Record<string, string>; data: unknown; url?: string }> {
  const res = (await CapacitorHttp.request({
    url,
    method: 'GET',
    headers,
    responseType: responseType === 'text' ? 'text' : 'arraybuffer',
    connectTimeout: Math.min(timeoutMs, 30000),
    readTimeout: timeoutMs,
  } as any)) as any;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(res?.headers || {})) flat[String(k)] = String(v);
  return { status: Number(res?.status) || 0, headers: flat, data: res?.data, url: res?.url };
}

/**
 * Fetch through the in-app proxy: resolves `mobile-proxy://` tokens to their
 * stored URL + replay headers (the desktop `/stream/<token>` fetch), merges
 * per-request headers/range, and returns bytes. Plain http(s) URLs are fetched
 * with the supplied fallback headers. Never throws — failures come back as
 * `{ ok: false }`.
 */
export async function fetchViaMobileProxy(
  proxyOrUrl: string,
  options: {
    headers?: unknown;
    range?: string;
    responseType?: 'text' | 'arraybuffer';
    timeoutMs?: number;
    originalUrl?: string;
  } = {},
): Promise<MobileProxyFetchResult> {
  // Desktop parity: the loopback server aborts upstream at 18s. The old 30s
  // default just delayed failover on a dead origin.
  const timeoutMs = options.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const target = resolveTarget(proxyOrUrl, {
    originalUrl: options.originalUrl,
    headers: options.headers,
  });
  if (!/^https?:\/\//i.test(target.url)) {
    return {
      ok: false,
      status: 0,
      url: target.url,
      contentType: '',
      headers: {},
      data: null,
      text: null,
    };
  }
  // Native loopback: plain fetch, no header replay needed (server owns the
  // headers, answers CORS `*` — desktop `/stream/<token>` parity). Keeps
  // manga images, subtitles and HLS playlists on the fast path.
  if (target.nativeDirect) {
    const wantTextEarly = (options.responseType ?? 'arraybuffer') === 'text';
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const init: RequestInit = { signal: ctrl.signal };
        if (options.range) init.headers = { Range: options.range };
        const r = await fetch(target.url, init);
        const contentType = r.headers.get('content-type') || '';
        if (!r.ok) {
          return {
            ok: false, status: r.status, url: target.url, contentType,
            headers: {}, data: null, text: null,
          };
        }
        if (wantTextEarly) {
          const text = await r.text();
          return {
            ok: true, status: r.status, url: target.url, contentType,
            headers: {}, data: null, text,
          };
        }
        const data = await r.arrayBuffer();
        return {
          ok: true, status: r.status, url: target.url, contentType,
          headers: {}, data, text: null,
        };
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return {
        ok: false, status: 0, url: target.url, contentType: '',
        headers: {}, data: null, text: null,
      };
    }
  }
  const headers = mergeHeaders(
    target.headers,
    normalizeMobileHeaders(options.headers),
    options.range,
  );
  const wantText = (options.responseType ?? 'arraybuffer') === 'text';
  // Desktop `_fetchStreamUpstream` parity: one retry on network failure (250ms
  // later), never on HTTP errors (a 403/404 is a real answer and relays as-is)
  // and never after an abort.
  const requestWithRetry = async (): Promise<Awaited<ReturnType<typeof capacitorRequest>>> => {
    try {
      return await capacitorRequest(target.url, headers, wantText ? 'text' : 'arraybuffer', timeoutMs);
    } catch (err) {
      if (!shouldRetryUpstream(err, 0)) throw err;
      await proxyDelay(UPSTREAM_RETRY_DELAY_MS);
      return capacitorRequest(target.url, headers, wantText ? 'text' : 'arraybuffer', timeoutMs);
    }
  };
  try {
    const res = await requestWithRetry();
    const contentType = headerValue(res.headers, 'content-type') || '';
    const ok = res.status >= 200 && res.status < 300;
    if (wantText) {
      const text =
        typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
      return {
        ok,
        status: res.status,
        url: res.url || target.url,
        contentType,
        headers: res.headers,
        data: null,
        text,
      };
    }
    return {
      ok,
      status: res.status,
      url: res.url || target.url,
      contentType,
      headers: res.headers,
      data: toArrayBuffer(res.data),
      text: null,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      url: target.url,
      contentType: '',
      headers: {},
      data: null,
      text: null,
    };
  }
}

export async function fetchMobileProxyText(
  proxyOrUrl: string,
  options: { headers?: unknown; timeoutMs?: number; originalUrl?: string } = {},
): Promise<string | null> {
  const res = await fetchViaMobileProxy(proxyOrUrl, { ...options, responseType: 'text' });
  return res.ok ? res.text : null;
}

function guessImageMime(url: string, contentType: string): string {
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (ct.startsWith('image/')) return ct;
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.avif')) return 'image/avif';
  return 'image/jpeg';
}

function guessMediaMime(url: string, contentType: string): string {
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (ct) return ct;
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.mp4') || clean.endsWith('.m4v')) return 'video/mp4';
  if (clean.endsWith('.webm')) return 'video/webm';
  if (clean.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  return 'video/mp4';
}

async function blobUrlFor(
  cacheKey: string,
  mime: string,
  fetcher: () => Promise<{ data: ArrayBuffer | null; ok: boolean; contentType: string; url: string }>,
): Promise<string | null> {
  const cached = blobCache.get(cacheKey);
  if (cached) return cached;
  const inflight = blobInflight.get(cacheKey);
  if (inflight) return inflight;
  const run = (async () => {
    try {
      const res = await fetcher();
      if (!res.ok || !res.data || res.data.byteLength === 0) return null;
      const type = mime || 'application/octet-stream';
      const blob = new Blob([res.data], { type });
      const objectUrl = URL.createObjectURL(blob);
      sweepTokens();
      blobCache.set(cacheKey, objectUrl);
      return objectUrl;
    } catch {
      return null;
    } finally {
      blobInflight.delete(cacheKey);
    }
  })();
  blobInflight.set(cacheKey, run);
  return run;
}

/**
 * Resolve a (possibly proxied) image URL to a `blob:` URL the WebView `<img>`
 * can load — the image equivalent of the desktop loopback `/stream/<token>`
 * (headers replayed natively, CORS-free). Plain URLs pass through untouched so
 * hotlink-open CDNs keep their zero-copy path.
 *
 * Retries transient failures (mobile radio drops a segment, CDN 429s) with a
 * short backoff so a single blip doesn't leave a permanent black page.
 */
export function getMobileProxyImageBlobUrl(
  proxyOrUrl: string,
  options: { headers?: unknown; originalUrl?: string; retries?: number } = {},
): Promise<string | null> {
  // Native loopback URLs load directly in `<img>` (desktop parity) — no blob
  // relay, no full download. Only in-memory tokens need the blob bridge.
  if (isNativeProxyUrl(proxyOrUrl)) return Promise.resolve(null);
  if (!isMobileProxyUrl(proxyOrUrl)) return Promise.resolve(null);
  const entry = resolveMobileProxy(proxyOrUrl);
  const upstream = entry?.url || String(options.originalUrl || '').trim();
  if (!upstream) return Promise.resolve(null);
  const attempts = Math.max(1, Math.min(4, options.retries ?? 3));
  return blobUrlFor(proxyOrUrl, '', async () => {
    let last = { ok: false, data: null as ArrayBuffer | null, contentType: '', url: upstream };
    for (let i = 0; i < attempts; i++) {
      const res = await fetchViaMobileProxy(proxyOrUrl, {
        ...options,
        responseType: 'arraybuffer',
        timeoutMs: 30000,
      });
      if (res.ok && res.data && res.data.byteLength > 0) {
        return {
          ok: res.ok,
          data: res.data,
          contentType: guessImageMime(res.url || upstream, res.contentType),
          url: res.url,
        };
      }
      last = { ok: res.ok, data: res.data, contentType: res.contentType, url: res.url || upstream };
      if (i + 1 < attempts) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
    return {
      ok: last.ok,
      data: last.data,
      contentType: guessImageMime(last.url || upstream, last.contentType),
      url: last.url,
    };
  });
}

/**
 * Header-gated plain image URL → blob URL (no proxy token involved).
 * Many manga CDNs 403 a bare `<img>` (missing Referer) while succeeding when
 * the same headers are replayed natively — this is the "some pages load, some
 * don't" reader bug. Plain hotlink-open CDNs should keep the zero-copy `<img>`
 * path; call only when `page.headers` is non-empty.
 */
export function getMobileHeaderedImageBlobUrl(
  plainUrl: string,
  headers: unknown,
  options: { retries?: number } = {},
): Promise<string | null> {
  const url = String(plainUrl || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return Promise.resolve(null);
  const flat = normalizeMobileHeaders(headers);
  if (!Object.keys(flat).length) return Promise.resolve(null);
  // Key includes the header values: the same image URL gated by different
  // Referers is a different payload (desktop parity — tokens are per headers).
  const cacheKey = `hdr-img:${headerCacheKey(url, flat)}`;
  const attempts = Math.max(1, Math.min(4, options.retries ?? 2));
  return blobUrlFor(cacheKey, '', async () => {
    let last = { ok: false, data: null as ArrayBuffer | null, contentType: '', url };
    for (let i = 0; i < attempts; i++) {
      const res = await fetchViaMobileProxy(url, {
        headers: flat,
        responseType: 'arraybuffer',
        timeoutMs: 30000,
      });
      if (res.ok && res.data && res.data.byteLength > 0) {
        return {
          ok: true,
          data: res.data,
          contentType: guessImageMime(res.url || url, res.contentType),
          url: res.url,
        };
      }
      last = { ok: res.ok, data: res.data, contentType: res.contentType, url: res.url || url };
      if (i + 1 < attempts) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
    return {
      ok: last.ok,
      data: last.data,
      contentType: guessImageMime(last.url || url, last.contentType),
      url: last.url,
    };
  });
}

/**
 * Warm the image blob cache for upcoming pages with bounded concurrency.
 * Fire-and-forget from the reader — warms `getMobileProxyImageBlobUrl` /
 * headered-blob entries so scrolling into them is instant. Never throws.
 */
export function prefetchMobileReaderImages(
  pages: Array<{ proxiedImageUrl?: string | null; imageUrl: string; originalUrl?: string | null; headers?: unknown }>,
  options: { concurrency?: number } = {},
): void {
  try {
    const jobs = (Array.isArray(pages) ? pages : []).filter((p) => p && (p.proxiedImageUrl || p.imageUrl));
    if (!jobs.length) return;
    const concurrency = Math.max(1, Math.min(4, options.concurrency ?? 3));
    let idx = 0;
    const worker = async () => {
      while (idx < jobs.length) {
        const p = jobs[idx++];
        try {
          const proxy = String(p.proxiedImageUrl || '');
          if (isMobileProxyUrl(proxy)) {
            await getMobileProxyImageBlobUrl(proxy, {
              originalUrl: (p as { originalUrl?: string }).originalUrl || p.imageUrl,
              headers: (p as { headers?: unknown }).headers,
              retries: 1,
            });
          } else if (normalizeMobileHeaders((p as { headers?: unknown }).headers) && Object.keys(normalizeMobileHeaders((p as { headers?: unknown }).headers)).length) {
            await getMobileHeaderedImageBlobUrl(p.imageUrl, (p as { headers?: unknown }).headers, { retries: 1 });
          }
        } catch {
          /* best-effort warm only */
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  } catch {
    /* never break the reader for a warm-up */
  }
}

/**
 * Resolve a (possibly proxied) direct media file (MP4/WebM) to a `blob:` URL
 * for `<video>`. Full-file fetch — the tradeoff for header replay without a
 * local HTTP server. HLS should prefer the native loader path instead.
 *
 * With the native loopback proxy running, MP4s never reach here: the
 * `http://127.0.0.1:<port>/stream/<token>` URL plays directly in `<video>`
 * with Range seeks (desktop parity), so this returns null for native URLs.
 */
export function getMobileProxyMediaBlobUrl(
  proxyOrUrl: string,
  options: { headers?: unknown; originalUrl?: string; timeoutMs?: number } = {},
): Promise<string | null> {
  if (isNativeProxyUrl(proxyOrUrl)) return Promise.resolve(null);
  if (!isMobileProxyUrl(proxyOrUrl)) return Promise.resolve(null);
  const entry = resolveMobileProxy(proxyOrUrl);
  const upstream = entry?.url || String(options.originalUrl || '').trim();
  if (!upstream) return Promise.resolve(null);
  return blobUrlFor(`media:${proxyOrUrl}`, '', async () => {
    const res = await fetchViaMobileProxy(proxyOrUrl, {
      ...options,
      responseType: 'arraybuffer',
      timeoutMs: options.timeoutMs ?? 120000,
    });
    return {
      ok: res.ok,
      data: res.data,
      contentType: guessMediaMime(res.url || upstream, res.contentType),
      url: res.url,
    };
  });
}

/**
 * Rewrite an HLS playlist so every child reference (segments, keys, maps,
 * variant playlists) becomes a fresh in-app proxy token carrying the same
 * headers — desktop `_rewritePlaylistUrls` via the shared module, except
 * tokens are `mobile-proxy://` URLs the native loader resolves instead of
 * origin-relative `/stream/<token>` paths. Kept as the public name so
 * `nativeHlsLoader` and other callers don't change.
 */
export function rewriteMobilePlaylist(
  playlistText: string,
  playlistUrl: string,
  headers: Record<string, string>,
): string {
  return rewriteProxyPlaylist(playlistText, playlistUrl, (resolved) =>
    registerMobileSource({ url: resolved, headers }),
  );
}

/**
 * Desktop-exact playlist detection (URL `\.m3u8($|\?)` or an HLS
 * content-type). Previously matched any content-type containing `mpegurl`,
 * which is broader than desktop — now shared so all three proxies agree.
 */
export function isHlsProxyPayload(url: string, contentType: string): boolean {
  return isHlsPlaylist(url, contentType);
}

// ── applyProxy (desktop host-server parity) ──────────────────────────────────
// Mirror of `applyProxy(normalized, rawHeaders, localProxy)` in
// `desktop/runtime/extension-api-host/host-server.cjs`: only HLS/MP4 direct
// media is proxied (embeds load in a webview, torrents go to the torrent
// engine), plus every subtitle track (their CDNs validate Referer exactly
// like the video CDNs do).

/**
 * Canonical playback-kind resolver — the mobile mirror of desktop
 * `resolveSourceType` (`host-server.cjs`) and the contract behind
 * `isEmbedSource`/`isM3U8Source` in `useCombinedSources.ts`.
 *
 * Precedence (all layers agree on this order):
 *   torrent (explicit type, isTorrent flag, or magnet: URL) >
 *   embed (`custom`/`embed` contract type, or an explicit isEmbed flag) >
 *   hls (explicit type, isM3U8 flag, or .m3u8 URL) >
 *   mp4 (explicit type or video-extension URL) >
 *   embed fallback.
 *
 * Reading `type` (not just `sourceType`) and the explicit booleans is what
 * keeps HLS rows with extractor-style URLs from collapsing into the embed
 * bucket — the "server list shows only embeds" bug.
 */
export function resolveStreamKind(source: Record<string, unknown>): 'hls' | 'mp4' | 'embed' | 'torrent' {
  const t = String((source as any)?.sourceType || (source as any)?.type || '').toLowerCase();
  const url = String((source as any)?.url || '');
  if (t === 'torrent' || (source as any)?.isTorrent === true || /^magnet:/i.test(url)) return 'torrent';
  if (t === 'custom' || t === 'embed' || (source as any)?.isEmbed === true) return 'embed';
  if (t === 'hls' || (source as any)?.isM3U8 === true || /\.m3u8($|[?#/])/i.test(url)) return 'hls';
  if (t === 'mp4' || /\.(mp4|m4v|webm|mkv)($|[?#])/i.test(url)) return 'mp4';
  return 'embed';
}

/**
 * Stamp the desktop-normalized type flags, DERIVED from the resolved kind
 * (desktop `normalizeSource` parity). Preservation used to let one stale or
 * partial bundle flag disagree with the URL and hide HLS rows as embeds, so
 * every flag is derived — never kept — keeping the list, the badge, the
 * player-mode pick and the proxy gate in agreement by construction.
 */
export function normalizeMobileSourceFlags<T>(source: T): T {
  if (!source || typeof source !== 'object') return source;
  const s = source as Record<string, unknown>;
  // `custom` is the extension contract's name for an iframe/embed URL. It is
  // not itself one of the canonical playback kinds — the resolver maps it to
  // `embed` (see above), which is what keeps Miki/Nami/Sasuke-style servers in
  // the embed UI instead of routing them into the direct video player.
  const resolvedKind = resolveStreamKind(s);
  s.sourceType = resolvedKind;
  (s as any).type = resolvedKind;
  (s as any).isM3U8 = resolvedKind === 'hls';
  (s as any).isEmbed = resolvedKind === 'embed';
  (s as any).isTorrent = resolvedKind === 'torrent';
  return source;
}

/**
 * Normalize one stream source (+ its subtitle tracks) for playback.
 *
 * With `tokenize: true` (default) header-gated HLS/MP4 URLs and subtitle
 * tracks are registered with the in-app proxy (mobile-proxy:// tokens, or
 * native loopback URLs when that server runs) with `originalUrl` preserved —
 * the desktop `applyProxy` shape, used by the manga reader and downloaders.
 *
 * Mobile watch paths always tokenize. Current Android and iOS shells serve
 * loopback URLs, while older shells keep the CapacitorHttp compatibility path;
 * neither requires the hosted proxy. Never re-registers an already-proxied URL
 * (either token shape) — nesting a loopback URL inside a fresh token clobbers
 * `originalUrl` and orphans the inner token on expiry.
 */
export function applyMobileProxyToSource<T>(source: T, opts?: { tokenize?: boolean }): T {
  if (!source || typeof source !== 'object') return source;
  normalizeMobileSourceFlags(source);
  const tokenize = opts?.tokenize !== false;
  if (!tokenize) return source;
  const s = source as Record<string, any>;
  const rawHeaders = normalizeMobileHeaders(s.headers);
  const out: Record<string, any> = { ...s };
  const tracks = Array.isArray(s.subtitles) ? s.subtitles : null;
  if (tracks && tracks.length) {
    out.subtitles = tracks.map((track: any) => {
      const raw = String(track?.url || track?.file || '');
      if (!/^https?:\/\//i.test(raw)) return track;
      try {
        return { ...track, url: registerMobileSource({ url: raw, headers: rawHeaders }), originalUrl: raw };
      } catch {
        return track;
      }
    });
  }

  const kind = resolveStreamKind(out);
  const url = String(out.url || '');
  if (
    (kind === 'hls' || kind === 'mp4') &&
    /^https?:\/\//i.test(url) &&
    !isMobileProxyUrl(url) &&
    !isNativeProxyUrl(url)
  ) {
    try {
      out.url = registerMobileSource({ url, headers: rawHeaders });
      out.originalUrl = url;
    } catch {
      /* keep the raw URL */
    }
  }
  return out as T;
}

/**
 * Proxy manga/custom-read page images that carry headers (many manga CDNs 403
 * an unproxied request) — desktop `manga/pages` + `custom/read` parity.
 */
export function applyMobileProxyToPages<T extends { imageUrl?: string }>(pages: T[]): T[] {
  if (!Array.isArray(pages)) return pages;
  return pages.map((p) => {
    if (!p || typeof p !== 'object') return p;
    const imageUrl = String((p as any).imageUrl || '');
    const headers = normalizeMobileHeaders((p as any).headers);
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return p;
    if (isAnyProxyUrl((p as any).proxiedImageUrl)) return p;
    try {
      return { ...p, proxiedImageUrl: registerMobileSource({ url: imageUrl, headers }) };
    } catch {
      return p;
    }
  });
}
