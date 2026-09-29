/**
 * Tatakai Streaming Proxy — Cloudflare Worker
 * ===========================================
 *
 * Edge implementation of the exact `/api/v1/streamingProxy` request/response
 * contract the app already speaks (see src/lib/api/proxy-utils.ts and
 * src/core/player/stream-resolver.ts). It proxies:
 *
 *   • video streams — HLS (`.m3u8`) playlists AND their segments/keys, plus
 *     progressive mp4/webm (this is what covers "video (preview)" — trailers
 *     and preview clips are just ordinary media URLs);
 *   • subtitles (`type=subtitle` — vtt/srt/ass);
 *   • "other parts" — cover images and any generic http(s) asset the renderer
 *     can't fetch cross-origin (served back with permissive CORS).
 *
 * Request:
 *   GET /api/v1/streamingProxy?url=<encoded>&type=video|subtitle
 *       [&referer=<r>][&userAgent=<ua>][&password=<pw>]
 *   + optional `Range:` header for byte-range playback.
 *
 * For an HLS playlist we rewrite every child URI back through THIS worker so
 * segments and keys are proxied too (and inherit referer/userAgent/password).
 *
 * Wire it up in the app's .env:
 *   VITE_PROXY_CF_URL=https://<worker-host>/api/v1/streamingProxy
 * or add it in Settings → Proxy as a "Cloud / Environment" proxy.
 */

const PROXY_PATH = '/api/v1/streamingProxy';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const DEFAULT_REFERER = 'https://megacloud.club/';

// Upstream request timeout. HLS players re-request on failure, so keep it tight.
const UPSTREAM_TIMEOUT_MS = 20_000;

// Response headers we copy verbatim from upstream on the pass-through path.
// Deliberately an allowlist: copying `content-encoding` (Workers may have
// already decoded the body) causes ERR_CONTENT_DECODING_FAILED at HTTP 200,
// which hls.js reads as a fatal network error and retries forever.
const PASSTHROUGH_HEADERS = [
  'content-type',
  'content-range',
  'accept-ranges',
  'content-length',
  'etag',
  'last-modified',
  'cache-control',
  'expires',
];

// Request headers we never forward upstream (hop-by-hop + ones we set ourselves).
const STRIPPED_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-real-ip',
  'origin',
  'referer',
  'cookie',
]);

/** CORS headers that go on EVERY response, errors included, so the player reads
 *  the real status instead of a masked CORS violation. */
function corsHeaders(extra) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
    'access-control-allow-headers':
      'Range, Content-Type, Accept, Origin, Authorization, X-Requested-With',
    'access-control-expose-headers': '*',
    'access-control-max-age': '86400',
    'cross-origin-resource-policy': 'cross-origin',
    ...(extra || {}),
  };
}

function textResponse(status, message, extra) {
  return new Response(String(message ?? ''), {
    status,
    headers: corsHeaders({
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      ...(extra || {}),
    }),
  });
}

/** Block requests aimed at loopback / link-local / private / cloud-metadata
 *  targets so the open proxy can't be used to reach internal services (SSRF). */
function isBlockedHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.internal') || host.endsWith('.local')) return true;
  // Cloud metadata endpoints.
  if (host === 'metadata.google.internal' || host === '169.254.169.254') return true;

  // IPv4 literal → check private / reserved ranges.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  // IPv6 loopback / unique-local / link-local literals.
  if (host === '::1' || host === '::') return true;
  if (host.startsWith('fc') || host.startsWith('fd')) return true; // fc00::/7
  if (host.startsWith('fe80')) return true; // link-local
  return false;
}

/** Apply the optional allow/block host lists from wrangler [vars]. */
function passesHostPolicy(hostname, env) {
  const host = String(hostname || '').toLowerCase();
  const blocked = String(env?.BLOCKED_UPSTREAM_HOSTS || '')
    .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (blocked.includes(host)) return false;
  const allowed = String(env?.ALLOWED_UPSTREAM_HOSTS || '')
    .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(host)) return false;
  return true;
}

/** Build the header set sent to the upstream origin. */
function buildOutboundHeaders(request, { referer, userAgent }) {
  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    headers.set(key, value);
  }
  headers.set('User-Agent', userAgent || DEFAULT_USER_AGENT);
  headers.set('Referer', referer || DEFAULT_REFERER);
  if (!headers.has('Accept')) headers.set('Accept', '*/*');
  // Media is already compressed and a gzipped byte-range is a mess to relay
  // faithfully — ask for raw bytes so content-length / content-range stay true.
  headers.set('Accept-Encoding', 'identity');
  const range = request.headers.get('range');
  if (range) headers.set('Range', range);
  return headers;
}

/** Rewrite every URI in an HLS playlist so segments/keys route back through
 *  this worker, carrying the same referer/userAgent/password/type. */
function rewritePlaylist(playlistText, playlistUrl, selfBase, params) {
  const rewrite = (target) => {
    let resolved;
    try {
      resolved = new URL(String(target || '').trim(), playlistUrl).href;
    } catch {
      return target;
    }
    const q = new URLSearchParams({ url: resolved, type: 'video' });
    if (params.referer) q.set('referer', params.referer);
    if (params.userAgent) q.set('userAgent', params.userAgent);
    if (params.password) q.set('password', params.password);
    return `${selfBase}?${q.toString()}`;
  };

  return String(playlistText || '')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        // Rewrite URI="..." attributes (EXT-X-KEY, EXT-X-MEDIA, MAP, etc.).
        return line.replace(/URI="([^"]+)"/g, (_m, p1) => `URI="${rewrite(p1)}"`);
      }
      return rewrite(trimmed);
    })
    .join('\n');
}

/** Copy the allowlisted upstream headers onto a fresh CORS header set. */
function copyPassthroughHeaders(upstream, extra) {
  const headers = new Headers(corsHeaders(extra));
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

/** Guess a subtitle content-type when the upstream sends none/octet-stream. */
function subtitleContentType(upstreamType, targetUrl) {
  if (upstreamType && !upstreamType.includes('octet-stream')) return upstreamType;
  const u = targetUrl.toLowerCase();
  if (u.includes('.vtt')) return 'text/vtt; charset=utf-8';
  if (u.includes('.ass') || u.includes('.ssa')) return 'text/plain; charset=utf-8';
  if (u.includes('.srt')) return 'text/plain; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

async function handleProxy(request, env, requestUrl) {
  const targetUrl = String(requestUrl.searchParams.get('url') || '').trim();
  if (!targetUrl) return textResponse(400, 'missing target url');

  // Password gate (only enforced when a secret is configured).
  const expected = String(env?.PROXY_PASSWORD || '').trim();
  if (expected) {
    const provided = String(requestUrl.searchParams.get('password') || '').trim();
    if (provided !== expected) return textResponse(403, 'forbidden');
  }

  let target;
  try {
    target = new URL(targetUrl);
  } catch {
    return textResponse(400, 'invalid target url');
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return textResponse(400, 'unsupported target protocol');
  }
  if (isBlockedHost(target.hostname) || !passesHostPolicy(target.hostname, env)) {
    return textResponse(403, 'target host not allowed');
  }

  const type = (requestUrl.searchParams.get('type') || 'video').toLowerCase();
  const referer = requestUrl.searchParams.get('referer') || undefined;
  const userAgent = requestUrl.searchParams.get('userAgent') || undefined;
  const password = expected ? requestUrl.searchParams.get('password') || undefined : undefined;

  const method = request.method === 'HEAD' ? 'HEAD' : 'GET';
  const outboundHeaders = buildOutboundHeaders(request, { referer, userAgent });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch(target.href, {
      method,
      headers: outboundHeaders,
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = /abort/i.test(String(err?.name || err?.message || ''));
    return textResponse(aborted ? 504 : 502, `proxy error: ${err?.message || err}`);
  }
  clearTimeout(timeout);

  const upstreamType = String(upstream.headers.get('content-type') || '').toLowerCase();
  const isPlaylist =
    /\.m3u8($|\?)/i.test(target.href) ||
    upstreamType.includes('application/vnd.apple.mpegurl') ||
    upstreamType.includes('application/x-mpegurl') ||
    upstreamType.includes('mpegurl');

  // HLS playlist → rewrite child URIs back through this worker.
  if (type !== 'subtitle' && isPlaylist) {
    const text = await upstream.text();
    const selfBase = `${requestUrl.origin}${PROXY_PATH}`;
    const rewritten = rewritePlaylist(text, target.href, selfBase, { referer, userAgent, password });
    return new Response(rewritten, {
      status: 200,
      headers: corsHeaders({
        'content-type': 'application/vnd.apple.mpegurl',
        'cache-control': 'no-cache',
      }),
    });
  }

  // Subtitle → buffer + content-type sniff (small files, cacheable).
  if (type === 'subtitle') {
    if (!upstream.ok) return textResponse(upstream.status, `upstream error: ${upstream.status}`);
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: corsHeaders({
        'content-type': subtitleContentType(upstreamType, target.href),
        'cache-control': 'public, max-age=3600',
        'content-length': String(body.byteLength),
      }),
    });
  }

  // Everything else (video segments, mp4/webm, images, generic assets) →
  // stream the body straight through with Range status preserved.
  const headers = copyPassthroughHeaders(upstream, { 'cache-control': 'no-store' });
  if (!headers.has('content-type')) headers.set('content-type', 'application/octet-stream');
  return new Response(method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

export default {
  async fetch(request, env) {
    // CORS preflight — hls.js sends one as soon as a request carries Range /
    // Content-Type; without an answer the GET is never attempted.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders({ 'content-length': '0' }) });
    }

    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(
        JSON.stringify({ ok: true, service: 'tatakai-streaming-proxy', path: PROXY_PATH }),
        { status: 200, headers: corsHeaders({ 'content-type': 'application/json' }) },
      );
    }

    // Accept the canonical path and any trailing variant so a base URL with or
    // without the suffix both work.
    if (url.pathname === PROXY_PATH || url.pathname.endsWith('/streamingProxy')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return textResponse(405, 'method not allowed');
      }
      return handleProxy(request, env, url);
    }

    return textResponse(404, 'not found');
  },
};
