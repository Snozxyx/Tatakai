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

export const MOBILE_PROXY_SCHEME = 'mobile-proxy://stream/';

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

/** Blob URLs minted from proxy payloads (dedupe + bounded cache). */
const blobCache = new Map<string, string>();
const blobInflight = new Map<string, Promise<string | null>>();
// Manga chapters are commonly 30-150 pages — an 80-entry cap evicted the
// first pages while the user was still reading (re-fetch + black flashes).
// 250 covers even long chapters without meaningful RAM growth (blob URLs
// themselves are cheap; the decoded bitmaps live in the image cache anyway).
const MAX_BLOB_ENTRIES = 250;

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
  while (blobCache.size > MAX_BLOB_ENTRIES) {
    const oldest = blobCache.keys().next();
    if (oldest.done) break;
    const url = blobCache.get(oldest.value);
    blobCache.delete(oldest.value);
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }
  }
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
 */
export function resolveMobileProxy(proxyUrl: string): MobileProxyEntry | null {
  if (!isMobileProxyUrl(proxyUrl)) return null;
  const entry = tokenMap.get(tokenOf(proxyUrl));
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TOKEN_TTL_MS) {
    tokenMap.delete(tokenOf(proxyUrl));
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
  if (!isMobileProxyUrl(proxyUrl)) return proxyUrl;
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
 * Register an upstream URL + its required headers, returning the opaque
 * `mobile-proxy://stream/<token>` URL consumers resolve through this module.
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
    const token = mintToken();
    tokenMap.set(token, { url, headers, createdAt: Date.now() });
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
): { url: string; headers: Record<string, string> } {
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
  const out = { ...base };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) out[k] = v;
  }
  if (range) out.Range = range;
  // Media is already compressed; asking for it raw keeps content-length/range
  // truthful through the relay (same reason the desktop proxy pins identity).
  const hasEncoding = Object.keys(out).some((k) => k.toLowerCase() === 'accept-encoding');
  if (!hasEncoding) out['Accept-Encoding'] = 'identity';
  return out;
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
  const timeoutMs = options.timeoutMs ?? 30000;
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
  const headers = mergeHeaders(
    target.headers,
    normalizeMobileHeaders(options.headers),
    options.range,
  );
  const wantText = (options.responseType ?? 'arraybuffer') === 'text';
  try {
    const res = await capacitorRequest(target.url, headers, wantText ? 'text' : 'arraybuffer', timeoutMs);
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
  const cacheKey = `hdr-img:${url}`;
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
 */
export function getMobileProxyMediaBlobUrl(
  proxyOrUrl: string,
  options: { headers?: unknown; originalUrl?: string; timeoutMs?: number } = {},
): Promise<string | null> {
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
 * headers — a direct port of `LocalProxyServer._rewritePlaylistUrls`, except
 * tokens are `mobile-proxy://` URLs the native loader resolves instead of
 * origin-relative `/stream/<token>` paths.
 */
export function rewriteMobilePlaylist(
  playlistText: string,
  playlistUrl: string,
  headers: Record<string, string>,
): string {
  const rewriteOne = (target: string): string => {
    const raw = String(target || '').trim();
    if (!raw) return target;
    try {
      const resolved = new URL(raw, playlistUrl).href;
      return registerMobileSource({ url: resolved, headers });
    } catch {
      return target;
    }
  };
  return String(playlistText || '')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_m, p1) => `URI="${rewriteOne(p1)}"`);
      }
      return rewriteOne(trimmed);
    })
    .join('\n');
}

export function isHlsProxyPayload(url: string, contentType: string): boolean {
  if (/\.m3u8($|[?#])/i.test(url)) return true;
  const ct = String(contentType || '').toLowerCase();
  return ct.includes('mpegurl') || ct.includes('application/x-mpegurl');
}

// ── applyProxy (desktop host-server parity) ──────────────────────────────────
// Mirror of `applyProxy(normalized, rawHeaders, localProxy)` in
// `desktop/runtime/extension-api-host/host-server.cjs`: only HLS/MP4 direct
// media is proxied (embeds load in a webview, torrents go to the torrent
// engine), plus every subtitle track (their CDNs validate Referer exactly
// like the video CDNs do).

export function resolveStreamKind(source: Record<string, unknown>): 'hls' | 'mp4' | 'embed' | 'torrent' {
  const explicit = String((source as any)?.sourceType || '').toLowerCase();
  if (explicit === 'torrent') return 'torrent';
  if (explicit === 'hls') return 'hls';
  if (explicit === 'mp4') return 'mp4';
  const url = String((source as any)?.url || '');
  if (/\.m3u8($|[?#/])/i.test(url)) return 'hls';
  if (/\.(mp4|m4v|webm|mkv)($|[?#])/i.test(url)) return 'mp4';
  return 'embed';
}

/** Fill the desktop-normalized type flags when the bundle omitted them (never
 *  overwrites values the bundle already set — selection/sort logic downstream
 *  depends on them). */
export function normalizeMobileSourceFlags<T>(source: T): T {
  if (!source || typeof source !== 'object') return source;
  const s = source as Record<string, unknown>;
  // `custom` is the extension contract's name for an iframe/embed URL. It is
  // not itself one of the canonical playback kinds, so derive flags from the
  // URL-aware resolver even when sourceType/type are already populated. The
  // previous code compared the literal string `custom` with `embed`, stamped
  // `isEmbed: false`, and made every Miki/Nami/Sasuke-style server disappear
  // from the embed UI and route into the direct video player instead.
  const resolvedKind = resolveStreamKind(s);
  if (s.sourceType == null || s.type == null) {
    if (s.sourceType == null) s.sourceType = resolvedKind;
    if ((s as any).type == null) (s as any).type = resolvedKind;
  }
  if ((s as any).isM3U8 == null) (s as any).isM3U8 = resolvedKind === 'hls';
  if ((s as any).isEmbed == null) (s as any).isEmbed = resolvedKind === 'embed';
  if ((s as any).isTorrent == null) (s as any).isTorrent = resolvedKind === 'torrent';
  return source;
}

function hasHeaders(headers: unknown): headers is Record<string, string> {
  const flat = normalizeMobileHeaders(headers);
  return Object.keys(flat).length > 0;
}

/**
 * Proxy one normalized stream source + its subtitle tracks through the in-app
 * registry. Returns the source with `url`/`subtitles[].url` replaced by proxy
 * URLs and `originalUrl` preserved (desktop shape).
 */
export function applyMobileProxyToSource<T>(source: T): T {
  if (!source || typeof source !== 'object') return source;
  normalizeMobileSourceFlags(source);
  const s = source as Record<string, any>;
  const rawHeaders = normalizeMobileHeaders(s.headers);
  if (!hasHeaders(rawHeaders)) return source;

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
  if ((kind === 'hls' || kind === 'mp4') && /^https?:\/\//i.test(url) && !isMobileProxyUrl(url)) {
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
    if (isMobileProxyUrl((p as any).proxiedImageUrl)) return p;
    if (!hasHeaders(headers)) return p;
    try {
      return { ...p, proxiedImageUrl: registerMobileSource({ url: imageUrl, headers }) };
    } catch {
      return p;
    }
  });
}
