const fetch = require('node-fetch');

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
  process.env.ANIMEPAHE_BASE || '',
  'https://animepahe.com/',
  'https://animepahe.ru/',
];

const ANIMEKAI_BASE_REFERERS = [
  process.env.ANIMEKAI_BASE || '',
  'https://animekai.to/',
  'https://animekai.bz/',
];

const hostCookieJar = new Map();

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
  return lower.includes('kwik.cx') || lower.includes('kwik.si') || lower.includes('kwik.sh') || lower.includes('kwics');
}

function getTargetHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
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
    if (typeof response?.headers?.raw === 'function') {
      const rawHeaders = response.headers.raw();
      if (Array.isArray(rawHeaders?.['set-cookie'])) {
        return rawHeaders['set-cookie'];
      }
    }
  } catch {
    // Ignore raw header parsing issues.
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

  const blocked = new Set([
    'host',
    'connection',
    'content-length',
    'transfer-encoding',
  ]);

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
    const targetOrigin = `${parsedTarget.origin}/`;
    // Target origin should be attempted early for hosts that block foreign referers.
    add(targetOrigin);

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
    // Ignore malformed upstream URL; caller validates separately.
  }

  (explicitCandidates || []).forEach(add);
  DEFAULT_REFERERS.forEach(add);

  // Keep the list short to avoid long hangs on dead hosts.
  const safeMax = Number.isFinite(Number(maxCandidates))
    ? Math.max(1, Number(maxCandidates))
    : 4;
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

  // Backward compatibility: second arg can still be a plain referer string.
  const normalizedOptions = typeof options === 'string' ? { refererUrl: options } : options;

  const baseTimeoutMs = Number(normalizedOptions.timeoutMs || 15000);
  const totalTimeoutMs = Number(normalizedOptions.totalTimeoutMs || (baseTimeoutMs + 12000));
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
        // Ignore malformed fallback referer values.
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
    console.error(`[Fetch Error] ${url}:`, lastError.message);
    throw lastError;
  }

  throw new Error('Upstream request failed');
}

module.exports = { fetchWithCustomReferer };