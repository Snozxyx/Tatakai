const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const DEFAULT_REFERERS = [
  'https://rabbitstream.net/',
  'https://dokicloud.one/',
  'https://hianime.to/',
  'https://aniwatchtv.to/',
  'https://megacloud.blog/',
  'https://megacloud.club/',
  'https://megacloud.tv/',
];

const ANIMEPAHE_BASE_REFERERS = [
  'https://animepahe.com/',
  'https://animepahe.ru/',
];

const ANIMEKAI_BASE_REFERERS = [
  'https://animekai.to/',
  'https://animekai.bz/',
];

const STREAM_PROXY_PATH = '/api/v1/streamingProxy';
const COMPAT_PROXY_PATHS = new Set([
  STREAM_PROXY_PATH,
  '/api/proxy/m3u8-streaming-proxy',
  '/api/v2/hianime/proxy/m3u8-streaming-proxy',
  '/api/v2/anime/hianime/proxy/m3u8-streaming-proxy',
]);

const CORS_ALLOW_METHODS = 'GET, OPTIONS';
const CORS_ALLOW_HEADERS =
  'Content-Type, Authorization, X-Proxy-Password, X-Tatakai-Proxy-Password, Range, Accept, Origin';

const timeoutCooldownStore = new Map();
const blockedHostCooldownStore = new Map();
const hostCookieJar = new Map();

export default {
  async fetch(request, env, ctx) {
    const cors = buildCorsContext(request, env);

    if (request.method === 'OPTIONS') {
      return preflightResponse(cors);
    }

    if (!cors.allowAllOrigins && cors.requestOrigin && !cors.allowedOrigin) {
      return jsonResponse({ error: 'Origin not allowed' }, 403, cors);
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method Not Allowed' }, 405, cors, {
        Allow: 'GET, OPTIONS',
      });
    }

    const requestUrl = new URL(request.url);
    const pathname = requestUrl.pathname;

    if (pathname === '/') {
      return jsonResponse({ error: 'Frontend disabled' }, 404, cors);
    }

    if (pathname === '/health') {
      return jsonResponse({ ok: true, service: 'tatakai-streaming-proxy' }, 200, cors);
    }

    if (!COMPAT_PROXY_PATHS.has(pathname)) {
      return jsonResponse({ error: 'Not Found' }, 404, cors);
    }

    const configuredPassword = String(env.PROXY_PASSWORD || '').trim();
    if (!configuredPassword) {
      return jsonResponse({ error: 'PROXY_PASSWORD is not configured' }, 500, cors);
    }

    const providedPassword = extractProxyPassword(request, requestUrl);
    if (!safeSecretCompare(configuredPassword, providedPassword)) {
      return jsonResponse({ error: 'Unauthorized' }, 401, cors);
    }

    return handleStreamingProxy(request, requestUrl, env, providedPassword, cors, ctx);
  },
};

function buildCorsContext(request, env) {
  const requestOrigin = String(request.headers.get('origin') || '').trim();
  const allowedOrigins = String(env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const allowAllOrigins = allowedOrigins.includes('*');
  const allowedOrigin = allowAllOrigins
    ? '*'
    : requestOrigin && allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : '';

  return {
    requestOrigin,
    allowAllOrigins,
    allowedOrigin,
  };
}

function applyCors(response, cors, extraHeaders = {}) {
  const headers = new Headers(response.headers);

  if (cors.allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', cors.allowedOrigin);
  }
  if (!cors.allowAllOrigins) {
    headers.set('Vary', 'Origin');
  }

  headers.set('Access-Control-Allow-Methods', CORS_ALLOW_METHODS);
  headers.set('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);

  for (const [key, value] of Object.entries(extraHeaders)) {
    if (value !== undefined && value !== null && value !== '') {
      headers.set(key, String(value));
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonResponse(payload, status, cors, extraHeaders = {}) {
  const base = new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
  return applyCors(base, cors, extraHeaders);
}

function preflightResponse(cors) {
  const base = new Response(null, { status: 200 });
  return applyCors(base, cors);
}

function safeSecretCompare(expected, provided) {
  const normalizedExpected = String(expected || '');
  const normalizedProvided = String(provided || '');

  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(normalizedExpected);
  const providedBytes = encoder.encode(normalizedProvided);

  if (expectedBytes.length === 0 || expectedBytes.length !== providedBytes.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    diff |= expectedBytes[index] ^ providedBytes[index];
  }

  return diff === 0;
}

function extractProxyPassword(request, requestUrl) {
  const headerPassword = String(
    request.headers.get('x-proxy-password') ||
      request.headers.get('x-tatakai-proxy-password') ||
      ''
  ).trim();
  if (headerPassword) return headerPassword;

  const authorization = String(request.headers.get('authorization') || '').trim();
  const bearerMatch = authorization.match(/^bearer\s+(.+)$/i);
  if (bearerMatch?.[1]) return String(bearerMatch[1]).trim();

  const queryPassword = String(requestUrl.searchParams.get('password') || '').trim();
  if (queryPassword) return queryPassword;

  return '';
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function getTargetHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function buildTimeoutCooldownKey(targetUrl, isPlaylistHint) {
  if (!isPlaylistHint) return '';
  const host = getTargetHost(targetUrl);
  return host ? `playlist:${host}` : `playlist:${targetUrl}`;
}

function buildBlockedHostKey(targetUrl, isPlaylistHint) {
  if (!isPlaylistHint) return '';
  const host = getTargetHost(targetUrl);
  return host ? `blocked:${host}` : '';
}

function isFastFailPlaylistHost(host) {
  if (!host) return false;
  return host.includes('watching.onl') || host.includes('owocdn') || host.includes('echovideo');
}

function getCooldownRetryAfter(store, key) {
  if (!key) return 0;

  const expiresAt = Number(store.get(key) || 0);
  if (expiresAt <= Date.now()) {
    store.delete(key);
    return 0;
  }

  return Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
}

function setCooldown(store, key, ttlSeconds) {
  if (!key || ttlSeconds <= 0) return;
  store.set(key, Date.now() + ttlSeconds * 1000);
}

function clearCooldown(store, key) {
  if (!key) return;
  store.delete(key);
}

function parseHeadersParam(rawHeadersParam) {
  if (!rawHeadersParam) return {};

  let payload = String(rawHeadersParam).trim();
  if (!payload) return {};

  try {
    payload = decodeURIComponent(payload);
  } catch {
    // Keep raw payload if it is not URI encoded.
  }

  try {
    const parsed = JSON.parse(payload);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const normalized = {};
    for (const [key, value] of Object.entries(parsed)) {
      const normalizedKey = String(key || '').trim().toLowerCase();
      if (!normalizedKey) continue;
      normalized[normalizedKey] = String(value ?? '').trim();
    }

    return normalized;
  } catch {
    return {};
  }
}

function buildPlaylistCacheRequest(targetUrl, referer, userAgent) {
  const keyUrl = new URL('https://tatakai-proxy-cache.local/playlist');
  keyUrl.searchParams.set('url', targetUrl);
  keyUrl.searchParams.set('referer', referer || '');
  keyUrl.searchParams.set('userAgent', userAgent || '');
  return new Request(keyUrl.toString(), { method: 'GET' });
}

async function handleStreamingProxy(request, requestUrl, env, proxyPassword, cors, ctx) {
  const playlistTimeoutMsEnv = parsePositiveInt(env.PLAYLIST_TIMEOUT_MS, 9000);
  const playlistTotalTimeoutMsEnv = parsePositiveInt(env.PLAYLIST_TOTAL_TIMEOUT_MS, 14000);
  const playlistMaxRetriesEnv = parsePositiveInt(env.PLAYLIST_MAX_RETRIES, 1);
  const segmentTimeoutMs = parsePositiveInt(env.SEGMENT_TIMEOUT_MS, 18000);
  const timeoutCooldownSec = parsePositiveInt(env.TIMEOUT_COOLDOWN_SEC, 45);
  const blockedHostCooldownSec = parsePositiveInt(env.BLOCKED_HOST_COOLDOWN_SEC, 180);
  const defaultReferer = String(env.REFERER_URL || 'https://megacloud.club/').trim();

  const targetUrl = String(requestUrl.searchParams.get('url') || '').trim();
  const requestType = String(requestUrl.searchParams.get('type') || '').trim().toLowerCase();
  const parsedHeaderOverrides = parseHeadersParam(requestUrl.searchParams.get('headers') || '');

  const refererFromHeaders = String(
    parsedHeaderOverrides.referer || parsedHeaderOverrides.referrer || ''
  ).trim();
  delete parsedHeaderOverrides.referer;
  delete parsedHeaderOverrides.referrer;

  const referer = String(
    requestUrl.searchParams.get('referer') || refererFromHeaders || defaultReferer
  ).trim();

  const requestedUserAgent = String(
    requestUrl.searchParams.get('userAgent') || parsedHeaderOverrides['user-agent'] || ''
  ).trim();
  delete parsedHeaderOverrides['user-agent'];

  const userAgent =
    requestedUserAgent.length > 20 && requestedUserAgent.toLowerCase() !== 'mozilla/5.0'
      ? requestedUserAgent
      : '';

  const requestAccept = String(parsedHeaderOverrides.accept || '').trim();
  delete parsedHeaderOverrides.accept;

  const range = String(request.headers.get('range') || parsedHeaderOverrides.range || '').trim();
  delete parsedHeaderOverrides.range;

  if (!targetUrl) {
    return jsonResponse({ error: 'URL is required' }, 400, cors);
  }

  const isPlaylistHint = /\.m3u8(?:$|[?#])/i.test(targetUrl) || requestType === 'video';
  const isSubtitleRequest = requestType === 'subtitle' || /\.(vtt|srt|ass|ssa|ttml|dfxp)(?:$|[?#])/i.test(targetUrl);
  const targetHost = getTargetHost(targetUrl);
  const fastFailPlaylist = isPlaylistHint && isFastFailPlaylistHost(targetHost);

  const cacheRequest = isPlaylistHint
    ? buildPlaylistCacheRequest(targetUrl, referer, userAgent || 'default')
    : null;

  const applyHostCooldowns = !(isPlaylistHint && fastFailPlaylist);
  const timeoutCooldownKey = applyHostCooldowns
    ? buildTimeoutCooldownKey(targetUrl, isPlaylistHint)
    : '';
  const blockedHostKey = applyHostCooldowns
    ? buildBlockedHostKey(targetUrl, isPlaylistHint)
    : '';

  if (cacheRequest && isPlaylistHint) {
    const cachedResponse = await caches.default.match(cacheRequest);
    if (cachedResponse) {
      return applyCors(cachedResponse, cors);
    }
  }

  if (timeoutCooldownKey) {
    const retryAfterSec = getCooldownRetryAfter(timeoutCooldownStore, timeoutCooldownKey);
    if (retryAfterSec > 0) {
      return jsonResponse(
        {
          error: 'Upstream unavailable (cooldown active)',
          host: targetHost,
          retryAfterSec,
        },
        503,
        cors,
        { 'Retry-After': String(retryAfterSec) }
      );
    }
  }

  if (blockedHostKey) {
    const retryAfterSec = getCooldownRetryAfter(blockedHostCooldownStore, blockedHostKey);
    if (retryAfterSec > 0) {
      return jsonResponse(
        {
          error: 'Upstream host currently blocked',
          host: targetHost,
          retryAfterSec,
        },
        502,
        cors,
        { 'Retry-After': String(retryAfterSec) }
      );
    }
  }

  const playlistTimeoutMs = fastFailPlaylist
    ? Math.max(6000, Math.min(playlistTimeoutMsEnv, 9000))
    : playlistTimeoutMsEnv;
  const playlistTotalTimeoutMs = fastFailPlaylist
    ? Math.max(playlistTotalTimeoutMsEnv, 18000)
    : playlistTotalTimeoutMsEnv;
  const playlistMaxRetries = fastFailPlaylist
    ? Math.max(playlistMaxRetriesEnv, 1)
    : playlistMaxRetriesEnv;
  const playlistMaxReferers = fastFailPlaylist ? 8 : 6;

  try {
    const upstreamResponse = await fetchWithCustomReferer(targetUrl, {
      refererUrl: referer,
      userAgent,
      range,
      timeoutMs: isPlaylistHint ? playlistTimeoutMs : segmentTimeoutMs,
      totalTimeoutMs: isPlaylistHint
        ? playlistTotalTimeoutMs
        : Math.max(segmentTimeoutMs + 6000, playlistTotalTimeoutMs),
      maxRetries: isPlaylistHint ? playlistMaxRetries : isSubtitleRequest ? 2 : 1,
      maxReferers: isPlaylistHint ? playlistMaxReferers : isSubtitleRequest ? 8 : 4,
      failFastOnTimeout: isPlaylistHint && !fastFailPlaylist,
      requestType,
      accept:
        requestAccept ||
        (isPlaylistHint
          ? 'application/vnd.apple.mpegurl, application/x-mpegURL, application/octet-stream;q=0.9, */*;q=0.8'
          : isSubtitleRequest
            ? 'text/vtt, text/plain;q=0.9, application/octet-stream;q=0.8, */*;q=0.7'
          : '*/*'),
      extraHeaders: parsedHeaderOverrides,
    });

    clearCooldown(timeoutCooldownStore, timeoutCooldownKey);
    clearCooldown(blockedHostCooldownStore, blockedHostKey);

    if (!upstreamResponse.ok) {
      if (blockedHostKey && [403, 502, 503, 504].includes(upstreamResponse.status)) {
        const cooldownSec =
          upstreamResponse.status === 403 ? blockedHostCooldownSec : timeoutCooldownSec;
        setCooldown(blockedHostCooldownStore, blockedHostKey, cooldownSec);
      }

      if (blockedHostKey && upstreamResponse.status === 403) {
        return jsonResponse(
          {
            error: 'Upstream blocked request (403)',
            host: targetHost,
            type: requestType || (isPlaylistHint ? 'video' : 'unknown'),
            url: targetUrl,
          },
          502,
          cors,
          { 'Retry-After': String(blockedHostCooldownSec) }
        );
      }

      if (timeoutCooldownKey && [408, 429, 500, 502, 503, 504].includes(upstreamResponse.status)) {
        setCooldown(timeoutCooldownStore, timeoutCooldownKey, timeoutCooldownSec);
      }

      if (fastFailPlaylist && [502, 503, 504].includes(upstreamResponse.status)) {
        return jsonResponse(
          {
            error: `Upstream playlist unavailable (${upstreamResponse.status})`,
            host: targetHost,
            type: requestType || 'video',
            url: targetUrl,
          },
          502,
          cors
        );
      }

      return jsonResponse(
        {
          error: `Upstream error: ${upstreamResponse.status} ${upstreamResponse.statusText}`,
          type: requestType || (isPlaylistHint ? 'video' : 'unknown'),
          url: targetUrl,
          host: targetHost,
        },
        upstreamResponse.status,
        cors
      );
    }

    const contentType = String(upstreamResponse.headers.get('content-type') || '').toLowerCase();
    const isM3U8 =
      contentType.includes('mpegurl') || contentType.includes('m3u8') || targetUrl.includes('.m3u8');

    if (isM3U8) {
      const playlistText = await upstreamResponse.text();
      const modifiedPlaylist = rewritePlaylistUrls(playlistText, targetUrl, {
        referer,
        userAgent,
        type: 'video',
        proxyPassword,
      });

      const playlistResponse = new Response(modifiedPlaylist, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'public, max-age=10',
        },
      });

      if (cacheRequest) {
        ctx.waitUntil(caches.default.put(cacheRequest, playlistResponse.clone()));
      }

      return applyCors(playlistResponse, cors);
    }

    const upstreamArrayBuffer = await upstreamResponse.arrayBuffer();
    const upstreamLength = upstreamResponse.headers.get('content-length');
    const upstreamType =
      contentType || (requestType === 'subtitle' ? 'text/vtt; charset=utf-8' : 'video/mp2t');

    const passHeaders = new Headers({
      'Content-Type': upstreamType,
      'Cache-Control': 'public, max-age=31536000',
      'Content-Length': upstreamLength || String(upstreamArrayBuffer.byteLength),
    });

    if (upstreamResponse.headers.get('accept-ranges')) {
      passHeaders.set('Accept-Ranges', String(upstreamResponse.headers.get('accept-ranges')));
    }

    if (upstreamResponse.headers.get('content-range')) {
      passHeaders.set('Content-Range', String(upstreamResponse.headers.get('content-range')));
    }

    return applyCors(
      new Response(upstreamArrayBuffer, {
        status: 200,
        headers: passHeaders,
      }),
      cors
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
    const status =
      error && (error.code === 'ETIMEDOUT' || error.name === 'AbortError')
        ? fastFailPlaylist
          ? 502
          : 504
        : 500;

    if ((status === 504 || status === 502) && timeoutCooldownKey) {
      setCooldown(timeoutCooldownStore, timeoutCooldownKey, timeoutCooldownSec);
    }

    let retryAfterHeader = '';
    if ((status === 504 || status === 502) && blockedHostKey) {
      setCooldown(blockedHostCooldownStore, blockedHostKey, timeoutCooldownSec);
      retryAfterHeader = String(timeoutCooldownSec);
    }

    return jsonResponse(
      {
        error:
          status === 504
            ? 'Upstream timeout'
            : status === 502
              ? 'Upstream unavailable'
              : 'Proxy Failed',
        details: errorMessage,
        host: targetHost,
        type: requestType || (isPlaylistHint ? 'video' : 'unknown'),
        url: targetUrl,
      },
      status,
      cors,
      retryAfterHeader ? { 'Retry-After': retryAfterHeader } : {}
    );
  }
}

function rewritePlaylistUrls(playlistText, baseUrl, options = {}) {
  const base = new URL(baseUrl);
  const referer = typeof options.referer === 'string' ? options.referer : '';
  const userAgent = typeof options.userAgent === 'string' ? options.userAgent : '';
  const type = typeof options.type === 'string' ? options.type : 'video';
  const proxyPassword = typeof options.proxyPassword === 'string' ? options.proxyPassword : '';

  const rewriteUrl = (targetUrl) => {
    try {
      const resolvedUrl = new URL(targetUrl, base).href;
      const params = new URLSearchParams({ url: resolvedUrl });
      if (type) params.set('type', type);
      if (referer) params.set('referer', referer);
      if (userAgent) params.set('userAgent', userAgent);
      if (proxyPassword) params.set('password', proxyPassword);
      return `${STREAM_PROXY_PATH}?${params.toString()}`;
    } catch {
      return targetUrl;
    }
  };

  return playlistText
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === '') return line;

      if (trimmed.startsWith('#')) {
        return trimmed.replace(/URI="([^"]+)"/g, (_match, uriValue) => {
          return `URI="${rewriteUrl(uriValue)}"`;
        });
      }

      return rewriteUrl(trimmed);
    })
    .join('\n');
}

function normalizeReferer(value) {
  if (!value) return '';
  try {
    const parsed = new URL(String(value));
    return parsed.href;
  } catch {
    return '';
  }
}

function hasKwikHost(value) {
  if (!value) return false;
  const lower = String(value).toLowerCase();
  return (
    lower.includes('kwik.cx') ||
    lower.includes('kwik.si') ||
    lower.includes('kwik.sh') ||
    lower.includes('kwics')
  );
}

function isAnimePaheStreamHost(host) {
  return host.includes('kwik') || host.includes('kwics') || host.includes('owocdn');
}

function isAnimeKaiStreamHost(host) {
  return host.includes('megaup') || host.includes('shop21pro');
}

function buildProviderReferers(url, primaryReferer) {
  const host = getTargetHost(url);
  const candidates = [];

  const add = (value) => {
    const normalized = normalizeReferer(value);
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  if (isAnimePaheStreamHost(host)) {
    ANIMEPAHE_BASE_REFERERS.forEach(add);
  }

  if (host.includes('owocdn') && !hasKwikHost(primaryReferer)) {
    add('https://kwik.cx/');
    add('https://kwik.si/');
  }

  if (isAnimeKaiStreamHost(host)) {
    ANIMEKAI_BASE_REFERERS.forEach(add);
  }

  return candidates;
}

function isIframeLikeHost(host, requestType = '') {
  const normalizedType = String(requestType || '').toLowerCase();
  if (normalizedType === 'subtitle') return false;
  return (
    host.includes('kwik') ||
    host.includes('kwics') ||
    host.includes('owocdn') ||
    host.includes('megaup') ||
    host.includes('shop21pro')
  );
}

function readSetCookieHeaders(response) {
  try {
    if (typeof response?.headers?.getSetCookie === 'function') {
      const setCookies = response.headers.getSetCookie();
      if (Array.isArray(setCookies) && setCookies.length > 0) {
        return setCookies;
      }
    }
  } catch {
    // Ignore set-cookie helper issues.
  }

  const single = response?.headers?.get?.('set-cookie');
  return single ? [single] : [];
}

function mergeCookieHeader(existingCookieHeader, setCookieHeaders) {
  const cookieMap = new Map();

  const setCookiePair = (cookiePair) => {
    const normalized = String(cookiePair || '').trim();
    if (!normalized || !normalized.includes('=')) return;
    const [name, ...rest] = normalized.split('=');
    const cookieName = String(name || '').trim();
    if (!cookieName) return;
    cookieMap.set(cookieName, `${cookieName}=${rest.join('=').trim()}`);
  };

  String(existingCookieHeader || '')
    .split(/;\s*/)
    .forEach((part) => setCookiePair(part));

  (setCookieHeaders || []).forEach((headerValue) => {
    const pair = String(headerValue || '').split(';')[0];
    setCookiePair(pair);
  });

  return Array.from(cookieMap.values()).join('; ');
}

function getHostCookies(host) {
  if (!host) return '';
  return String(hostCookieJar.get(host) || '');
}

function updateHostCookies(host, response) {
  if (!host) return;
  const setCookieHeaders = readSetCookieHeaders(response);
  if (!setCookieHeaders.length) return;

  const merged = mergeCookieHeader(getHostCookies(host), setCookieHeaders);
  if (merged) {
    hostCookieJar.set(host, merged);
  }
}

function applyExtraHeaders(headers, extraHeaders) {
  if (!extraHeaders || typeof extraHeaders !== 'object') return;

  const blocked = new Set(['host', 'connection', 'content-length', 'transfer-encoding']);

  for (const [rawKey, rawValue] of Object.entries(extraHeaders)) {
    const key = String(rawKey || '').trim();
    if (!key) continue;

    const lowerKey = key.toLowerCase();
    if (blocked.has(lowerKey)) continue;

    if (rawValue === undefined || rawValue === null) continue;
    headers[key] = String(rawValue);
  }
}

function buildRefererCandidates(url, primaryReferer, explicitCandidates, maxCandidates = 5) {
  const candidates = [];

  const add = (value) => {
    const normalized = normalizeReferer(value);
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  let targetHost = '';
  try {
    targetHost = String(new URL(url).hostname || '').toLowerCase();
  } catch {
    targetHost = '';
  }

  if (targetHost.includes('watching.onl')) {
    add('https://rabbitstream.net/');
    add('https://dokicloud.one/');
    add('https://hianime.to/');
    add('https://aniwatchtv.to/');
  }

  add(primaryReferer);
  buildProviderReferers(url, primaryReferer).forEach(add);

  try {
    const parsedTarget = new URL(url);
    add(`${parsedTarget.origin}/`);

    if (targetHost.includes('watching.onl')) {
      add('https://rabbitstream.net/');
      add('https://dokicloud.one/');
      add('https://hianime.to/');
      add('https://aniwatchtv.to/');
      add('https://megacloud.blog/');
      add('https://megacloud.club/');
      add('https://megacloud.tv/');
    }
  } catch {
    // Ignore malformed upstream URL.
  }

  (explicitCandidates || []).forEach(add);
  DEFAULT_REFERERS.forEach(add);

  const safeMax = Number.isFinite(Number(maxCandidates)) ? Math.max(1, Number(maxCandidates)) : 4;
  return candidates.slice(0, safeMax);
}

function isRetryableStatus(status) {
  return status === 403 || status === 408 || status === 425 || status === 429 || status >= 500;
}

function isTimeoutLikeError(error) {
  return error?.name === 'AbortError' || /aborted|timeout/i.test(String(error?.message || ''));
}

function createTimeoutError() {
  const timeoutError = new Error('Upstream request timed out');
  timeoutError.code = 'ETIMEDOUT';
  return timeoutError;
}

async function fetchOnce(url, headers, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithCustomReferer(url, options = {}) {
  if (!url) throw new Error('URL is required');

  const normalizedOptions = typeof options === 'string' ? { refererUrl: options } : options;

  const baseTimeoutMs = Number(normalizedOptions.timeoutMs || 15000);
  const totalTimeoutMs = Number(normalizedOptions.totalTimeoutMs || baseTimeoutMs + 12000);
  const maxRetries = Number(normalizedOptions.maxRetries ?? 2);
  const maxReferers = Number(normalizedOptions.maxReferers ?? 3);
  const requestType = String(normalizedOptions.requestType || '').toLowerCase();
  const failFastOnTimeout = normalizedOptions.failFastOnTimeout === true;
  const userAgent = String(normalizedOptions.userAgent || DEFAULT_USER_AGENT);
  const accept = String(normalizedOptions.accept || '*/*');
  const range = normalizedOptions.range ? String(normalizedOptions.range) : '';
  const deadlineAt = Date.now() + totalTimeoutMs;
  const targetHost = getTargetHost(url);

  const referers = buildRefererCandidates(
    url,
    normalizedOptions.refererUrl,
    normalizedOptions.refererCandidates,
    maxReferers
  );

  if (referers.length === 0) {
    referers.push('https://megacloud.blog/');
  }

  if (normalizedOptions.allowEmptyReferer !== false) {
    referers.push('');
  }

  let lastResponse = null;
  let lastError = null;

  for (const referer of referers) {
    const headers = {
      'User-Agent': userAgent,
      Accept: accept,
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      ...(isIframeLikeHost(targetHost, requestType)
        ? {
            'Sec-Fetch-Dest': 'iframe',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'cross-site',
            'Upgrade-Insecure-Requests': '1',
          }
        : {
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
          }),
    };

    applyExtraHeaders(headers, normalizedOptions.extraHeaders);

    if (referer) {
      headers.Referer = referer;
      try {
        headers.Origin = new URL(referer).origin;
      } catch {
        // Ignore malformed referer values.
      }
    }

    if (range) headers.Range = range;

    const storedCookies = getHostCookies(targetHost);
    if (storedCookies) {
      headers.Cookie = headers.Cookie ? `${headers.Cookie}; ${storedCookies}` : storedCookies;
    }

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 1200) {
        throw createTimeoutError();
      }

      const timeoutMs = Math.max(1200, Math.min(baseTimeoutMs + attempt * 3500, remainingMs));

      try {
        const response = await fetchOnce(url, headers, timeoutMs);
        updateHostCookies(targetHost, response);
        lastResponse = response;

        if (response.ok || response.status === 206) {
          return response;
        }

        if (!isRetryableStatus(response.status) || attempt === maxRetries) {
          break;
        }
      } catch (error) {
        lastError = error;
        if (isTimeoutLikeError(error)) {
          if (failFastOnTimeout) {
            throw createTimeoutError();
          }
          if (attempt === maxRetries) break;
          continue;
        }

        if (attempt === maxRetries) break;
      }
    }
  }

  if (lastResponse) return lastResponse;

  if (isTimeoutLikeError(lastError)) {
    throw createTimeoutError();
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('Upstream request failed');
}