/**
 * proxyShared.ts — single source of truth for in-app proxy semantics.
 *
 * Reference implementation: desktop `LocalProxyServer`
 * (`desktop/runtime/proxy/local-proxy-server.cjs`). The Android native plugin
 * (`TatakaiLocalProxyPlugin.java`) and the mobile JS fallback
 * (`src/core/extensions/mobile/mobileProxy.ts`) implement this same contract.
 * When desktop changes any of these behaviours, update this file and the
 * mobile fallback together — the player treats all three as interchangeable.
 *
 * Everything here is pure and runtime-agnostic (no Capacitor, no Node, no DOM
 * beyond the global `URL`), so desktop-adjacent TS code, the mobile fallback
 * and tests can all import it.
 */

/** Stream-token shape: 16 random bytes, hex-encoded (desktop `registerSource`). */
export const PROXY_TOKEN_RE = /^[a-f0-9]{32}$/i;

/** Token lifetime mirrors the desktop `_tokenMap` 15-minute sweep. */
export const TOKEN_TTL_MS = 15 * 60 * 1000;

/** Same default UA the desktop proxy sends when a source has none. */
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/** Upstream fetch budget (desktop `_handleRequest`: 18s abort). */
export const UPSTREAM_TIMEOUT_MS = 18_000;

/** Single retry delay for network failures (desktop `_fetchStreamUpstream`). */
export const UPSTREAM_RETRY_DELAY_MS = 250;

/**
 * CORS headers that must be on *every* proxy response, errors included
 * (desktop `_corsHeaders`). Without them the player sees a CORS violation
 * instead of the real status (410 expired, 502 upstream, …).
 */
export function proxyCorsHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
    'access-control-allow-headers': 'Range, Content-Type, Accept, Origin, Authorization, X-Requested-With',
    'access-control-expose-headers': '*',
    'access-control-max-age': '86400',
    'cross-origin-resource-policy': 'cross-origin',
    ...(extra || {}),
  };
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const want = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === want);
}

/**
 * Build the headers sent to the upstream origin from a token's stored headers
 * (desktop `_handleRequest` outbound block):
 * - stored headers replayed verbatim (Referer / Origin / Cookie / UA …),
 * - default User-Agent when the source has none (either casing),
 * - `Accept-Encoding: identity` unless the source explicitly wants otherwise
 *   (media is already compressed; a gzipped byte-range is a mess to relay),
 * - the player's `Range` passed through so seeks work.
 */
export function buildProxyOutboundHeaders(
  stored: Record<string, string>,
  extra?: Record<string, string>,
  range?: string,
): Record<string, string> {
  const out: Record<string, string> = { ...(stored || {}) };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) out[k] = v;
  }
  if (!hasHeader(out, 'user-agent')) out['User-Agent'] = DEFAULT_USER_AGENT;
  if (!hasHeader(out, 'accept-encoding')) out['Accept-Encoding'] = 'identity';
  if (range) out.Range = range;
  return out;
}

/** Desktop playlist-URL check (`\.m3u8($|\?)`). */
export function isHlsPlaylistUrl(url: string): boolean {
  return /\.m3u8($|\?)/i.test(String(url || ''));
}

/**
 * Desktop playlist detection: URL shape OR an HLS content-type
 * (`application/vnd.apple.mpegurl` / `application/x-mpegurl`).
 */
export function isHlsPlaylist(url: string, contentType: string): boolean {
  if (isHlsPlaylistUrl(url)) return true;
  const ct = String(contentType || '').toLowerCase();
  return ct.includes('application/vnd.apple.mpegurl') || ct.includes('application/x-mpegurl');
}

/**
 * Rewrite every URI in an HLS playlist through the proxy (desktop
 * `_rewritePlaylistUrls`): each child (segment, key, map, variant) is resolved
 * against the playlist URL and handed to `register`, which mints a fresh token
 * carrying the same headers. `URI="…"` attributes (EXT-X-KEY/MAP/MEDIA) are
 * rewritten in place; unresolvable lines pass through untouched.
 *
 * Desktop additionally threads `persistent` + tunnel share secrets here — those
 * are desktop-tunnel-only concerns, so they stay out of the shared shape.
 */
export function rewriteProxyPlaylist(
  playlistText: string,
  playlistUrl: string,
  register: (resolvedAbsoluteUrl: string) => string,
): string {
  const base = String(playlistUrl || '');
  const rewriteOne = (target: string): string => {
    const raw = String(target || '').trim();
    if (!raw) return target;
    try {
      const resolved = new URL(raw, base).href;
      return register(resolved);
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

/** Desktop abort classification (timeout budget gone → 504, else 502). */
export function isAbortError(err: unknown): boolean {
  return /abort/i.test(String((err as Error)?.name || (err as Error)?.message || ''));
}

/** Status the proxy reports for a failed upstream fetch. */
export function proxyErrorStatus(err: unknown): 504 | 502 {
  return isAbortError(err) ? 504 : 502;
}

/**
 * Desktop `_fetchStreamUpstream` retry policy: one retry on network failure,
 * never on HTTP errors (a 403/404/5xx is a real answer and relays as-is) and
 * never after an abort (the budget is gone).
 */
export function shouldRetryUpstream(err: unknown, attempt: number): boolean {
  if (attempt !== 0) return false;
  if (isAbortError(err)) return false;
  return true;
}

export function proxyDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stable cache key for header-gated payloads: the URL plus the sorted
 * header name=value pairs (names lowercased). Keying on the URL alone serves
 * a blob fetched with one Referer to a request needing another — the exact
 * staleness that made gated reader pages stick.
 */
export function headerCacheKey(url: string, headers: Record<string, string>): string {
  const parts = Object.entries(headers || {})
    .map(([k, v]) => `${k.toLowerCase()}=${String(v)}`)
    .sort()
    .join('&');
  const raw = `${String(url || '')}\n${parts}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  }
  return `${(hash >>> 0).toString(16)}`;
}
