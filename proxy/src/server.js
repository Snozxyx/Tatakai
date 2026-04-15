const express = require('express');
const crypto = require('crypto');
require('dotenv').config();
const { fetchWithCustomReferer } = require('./fetchWithCustomReferer');
const { rewritePlaylistUrls } = require('./rewritePlaylistUrls');
const NodeCache = require('node-cache');
const morgan = require('morgan');
const helmet = require('helmet');
const { cleanEnv, str, num } = require('envalid');

const env = cleanEnv(process.env, {
  PORT: num({ default: 3000 }),
  ALLOWED_ORIGINS: str({ default: "*" }),
  PROXY_PASSWORD: str(),
  REFERER_URL: str({ default: "https://megacloud.club/" }),
  PLAYLIST_TIMEOUT_MS: num({ default: 9000 }),
  PLAYLIST_TOTAL_TIMEOUT_MS: num({ default: 14000 }),
  PLAYLIST_MAX_RETRIES: num({ default: 1 }),
  SEGMENT_TIMEOUT_MS: num({ default: 18000 }),
  TIMEOUT_COOLDOWN_SEC: num({ default: 45 }),
  BLOCKED_HOST_COOLDOWN_SEC: num({ default: 180 }),
});

const app = express();
const PORT = env.PORT;

app.set('trust proxy', 1);

const cache = new NodeCache({ stdTTL: 10 }); 
const timeoutCooldown = new NodeCache({ stdTTL: env.TIMEOUT_COOLDOWN_SEC, useClones: false });
const blockedHostCooldown = new NodeCache({ stdTTL: env.BLOCKED_HOST_COOLDOWN_SEC, useClones: false });
const allowedOrigins = String(env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
const allowAllOrigins = allowedOrigins.includes('*');

function resolveAllowedOrigin(requestOrigin) {
  if (allowAllOrigins) return '*';
  if (!requestOrigin) return '';
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : '';
}

function safeSecretCompare(expected, provided) {
  const normalizedExpected = String(expected || '');
  const normalizedProvided = String(provided || '');
  const expectedBuffer = Buffer.from(normalizedExpected, 'utf8');
  const providedBuffer = Buffer.from(normalizedProvided, 'utf8');

  if (expectedBuffer.length === 0 || expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    return false;
  }
}

function extractProxyPassword(req) {
  const headerPassword = String(
    req.get('x-proxy-password') || req.get('x-tatakai-proxy-password') || '',
  ).trim();
  if (headerPassword) return headerPassword;

  const authorization = String(req.get('authorization') || '').trim();
  const bearerMatch = authorization.match(/^bearer\s+(.+)$/i);
  if (bearerMatch?.[1]) return String(bearerMatch[1]).trim();

  const queryPassword = String(req.query.password || '').trim();
  if (queryPassword) return queryPassword;

  return '';
}

function requireProxyPassword(req, res, next) {
  const providedPassword = extractProxyPassword(req);
  if (!safeSecretCompare(env.PROXY_PASSWORD, providedPassword)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.proxyPassword = providedPassword;
  return next();
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
  return (
    host.includes('watching.onl') ||
    host.includes('owocdn') ||
    host.includes('echovideo')
  );
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

app.use(morgan('dev'));

app.use(helmet({ 
  contentSecurityPolicy: false, 
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use((req, res, next) => {
  const requestOrigin = String(req.headers.origin || '').trim();
  const allowedOrigin = resolveAllowedOrigin(requestOrigin);

  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  if (!allowAllOrigins) {
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Proxy-Password, X-Tatakai-Proxy-Password, Range, Accept, Origin',
  );
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!allowAllOrigins && requestOrigin && !allowedOrigin) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  next();
});

app.get('/', (_req, res) => {
  return res.status(404).json({ error: 'Frontend disabled' });
});

app.get('/health', (_req, res) => {
  return res.status(200).json({ ok: true, service: 'tatakai-streaming-proxy' });
});

app.use('/api/v1/streamingProxy', requireProxyPassword);

app.get('/api/v1/streamingProxy', async (req, res) => {
  try {
    const targetUrl = String(req.query.url || '').trim();
    const requestType = String(req.query.type || '').trim().toLowerCase();
    const parsedHeaderOverrides = parseHeadersParam(req.query.headers || '');
    const refererFromHeaders = String(parsedHeaderOverrides.referer || parsedHeaderOverrides.referrer || '').trim();
    delete parsedHeaderOverrides.referer;
    delete parsedHeaderOverrides.referrer;

    const referer = String(req.query.referer || refererFromHeaders || env.REFERER_URL).trim();
    const requestedUserAgent = String(req.query.userAgent || parsedHeaderOverrides['user-agent'] || '').trim();
    delete parsedHeaderOverrides['user-agent'];

    const userAgent =
      requestedUserAgent.length > 20 && requestedUserAgent.toLowerCase() !== 'mozilla/5.0'
        ? requestedUserAgent
        : '';
    const proxyPassword = String(req.proxyPassword || '').trim();

    const requestAccept = String(parsedHeaderOverrides.accept || '').trim();
    delete parsedHeaderOverrides.accept;

    const range = req.get('range') || String(parsedHeaderOverrides.range || '').trim();
    delete parsedHeaderOverrides.range;

    if (!targetUrl) return res.status(400).json({ error: "URL is required" });

    const isPlaylistHint = /\.m3u8(?:$|[?#])/i.test(targetUrl) || requestType === 'video';
    const targetHost = getTargetHost(targetUrl);
    const fastFailPlaylist = isPlaylistHint && isFastFailPlaylistHost(targetHost);
    const cacheKey = isPlaylistHint
      ? `${targetUrl}::${referer}::${userAgent || 'default'}`
      : '';
    const applyHostCooldowns = !(isPlaylistHint && fastFailPlaylist);
    const timeoutCooldownKey = applyHostCooldowns ? buildTimeoutCooldownKey(targetUrl, isPlaylistHint) : '';
    const blockedHostKey = applyHostCooldowns ? buildBlockedHostKey(targetUrl, isPlaylistHint) : '';

    const cachedResponse = cacheKey ? cache.get(cacheKey) : null;
    if (cachedResponse && isPlaylistHint) {
      res.set({
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "public, max-age=10"
      });
      return res.send(cachedResponse);
    }

    if (timeoutCooldownKey) {
      const cooldownUntil = Number(timeoutCooldown.get(timeoutCooldownKey) || 0);
      if (cooldownUntil > Date.now()) {
        const retryAfterSec = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
        res.setHeader('Retry-After', String(retryAfterSec));
        return res.status(503).json({
          error: 'Upstream unavailable (cooldown active)',
          host: targetHost,
          retryAfterSec,
        });
      }
    }

    if (blockedHostKey) {
      const blockedUntil = Number(blockedHostCooldown.get(blockedHostKey) || 0);
      if (blockedUntil > Date.now()) {
        const retryAfterSec = Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000));
        res.setHeader('Retry-After', String(retryAfterSec));
        return res.status(502).json({
          error: 'Upstream host currently blocked',
          host: targetHost,
          retryAfterSec,
        });
      }
    }

    const playlistTimeoutMs = fastFailPlaylist
      ? Math.max(6000, Math.min(env.PLAYLIST_TIMEOUT_MS, 9000))
      : env.PLAYLIST_TIMEOUT_MS;
    const playlistTotalTimeoutMs = fastFailPlaylist
      ? Math.max(env.PLAYLIST_TOTAL_TIMEOUT_MS, 18000)
      : env.PLAYLIST_TOTAL_TIMEOUT_MS;
    const playlistMaxRetries = fastFailPlaylist
      ? Math.max(env.PLAYLIST_MAX_RETRIES, 1)
      : env.PLAYLIST_MAX_RETRIES;
    const playlistMaxReferers = fastFailPlaylist ? 8 : 6;

    const response = await fetchWithCustomReferer(targetUrl, {
      refererUrl: referer,
      userAgent,
      range,
      timeoutMs: isPlaylistHint ? playlistTimeoutMs : env.SEGMENT_TIMEOUT_MS,
      totalTimeoutMs: isPlaylistHint
        ? playlistTotalTimeoutMs
        : Math.max(env.SEGMENT_TIMEOUT_MS + 6000, env.PLAYLIST_TOTAL_TIMEOUT_MS),
      maxRetries: isPlaylistHint ? playlistMaxRetries : 1,
      maxReferers: isPlaylistHint ? playlistMaxReferers : 4,
      failFastOnTimeout: isPlaylistHint && !fastFailPlaylist,
      accept: requestAccept || (isPlaylistHint
        ? "application/vnd.apple.mpegurl, application/x-mpegURL, application/octet-stream;q=0.9, */*;q=0.8"
        : "*/*"),
      extraHeaders: parsedHeaderOverrides,
    });

    if (timeoutCooldownKey) {
      timeoutCooldown.del(timeoutCooldownKey);
    }
    if (blockedHostKey) {
      blockedHostCooldown.del(blockedHostKey);
    }

    if (!response.ok) {
      if (blockedHostKey && [403, 502, 503, 504].includes(response.status)) {
        const cooldownSec = response.status === 403 ? env.BLOCKED_HOST_COOLDOWN_SEC : env.TIMEOUT_COOLDOWN_SEC;
        blockedHostCooldown.set(
          blockedHostKey,
          Date.now() + cooldownSec * 1000,
          cooldownSec
        );
      }

      if (blockedHostKey && response.status === 403) {
        res.setHeader('Retry-After', String(env.BLOCKED_HOST_COOLDOWN_SEC));
        return res.status(502).json({
          error: 'Upstream blocked request (403)',
          host: targetHost,
          type: requestType || (isPlaylistHint ? 'video' : 'unknown'),
          url: targetUrl,
        });
      }

      if (timeoutCooldownKey && [408, 429, 500, 502, 503, 504].includes(response.status)) {
        timeoutCooldown.set(
          timeoutCooldownKey,
          Date.now() + env.TIMEOUT_COOLDOWN_SEC * 1000,
          env.TIMEOUT_COOLDOWN_SEC
        );
      }

      if (fastFailPlaylist && [502, 503, 504].includes(response.status)) {
        return res.status(502).json({
          error: `Upstream playlist unavailable (${response.status})`,
          host: targetHost,
          type: requestType || 'video',
          url: targetUrl,
        });
      }

      return res.status(response.status).json({ 
        error: `Upstream error: ${response.status} ${response.statusText}`,
        type: requestType || (isPlaylistHint ? 'video' : 'unknown'),
        url: targetUrl,
        host: targetHost,
      });
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const isM3U8 = contentType.includes('mpegurl') || 
                   contentType.includes('m3u8') || 
                   targetUrl.includes('.m3u8');

    if (isM3U8) {
      const playlistText = await response.text();
      const modifiedPlaylist = rewritePlaylistUrls(playlistText, targetUrl, {
        referer,
        userAgent,
        type: 'video',
        proxyPassword,
      });
      
      if (cacheKey) cache.set(cacheKey, modifiedPlaylist, 10);

      res.set({
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "public, max-age=10"
      });
      return res.send(modifiedPlaylist);
      
    } else {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const upstreamLength = response.headers.get('content-length');
      const upstreamType = contentType || (requestType === 'subtitle' ? 'text/vtt; charset=utf-8' : 'video/mp2t');

      res.set({
        "Content-Type": upstreamType,
        "Cache-Control": "public, max-age=31536000",
        "Content-Length": upstreamLength || buffer.length,
        ...(response.headers.get('accept-ranges') ? { "Accept-Ranges": response.headers.get('accept-ranges') } : {}),
        ...(response.headers.get('content-range') ? { "Content-Range": response.headers.get('content-range') } : {}),
      });
      return res.send(buffer);
    }
  } catch (error) {
    console.error('Proxy Exception:', error.message);

    const targetUrl = String(req.query.url || '').trim();
    const requestType = String(req.query.type || '').trim().toLowerCase();
    const isPlaylistHint = /\.m3u8(?:$|[?#])/i.test(targetUrl) || requestType === 'video';
    const targetHost = getTargetHost(targetUrl);
    const fastFailPlaylist = isPlaylistHint && isFastFailPlaylistHost(targetHost);
    const status = error?.code === 'ETIMEDOUT' || error?.name === 'AbortError'
      ? (fastFailPlaylist ? 502 : 504)
      : 500;
    const applyHostCooldowns = !(isPlaylistHint && fastFailPlaylist);
    const timeoutCooldownKey = applyHostCooldowns ? buildTimeoutCooldownKey(targetUrl, isPlaylistHint) : '';
    const blockedHostKey = applyHostCooldowns ? buildBlockedHostKey(targetUrl, isPlaylistHint) : '';

    if ((status === 504 || status === 502) && timeoutCooldownKey) {
      timeoutCooldown.set(
        timeoutCooldownKey,
        Date.now() + env.TIMEOUT_COOLDOWN_SEC * 1000,
        env.TIMEOUT_COOLDOWN_SEC
      );
    }

    if ((status === 504 || status === 502) && blockedHostKey) {
      blockedHostCooldown.set(
        blockedHostKey,
        Date.now() + env.TIMEOUT_COOLDOWN_SEC * 1000,
        env.TIMEOUT_COOLDOWN_SEC
      );
      res.setHeader('Retry-After', String(env.TIMEOUT_COOLDOWN_SEC));
    }

    res.status(status).json({
      error: status === 504 ? "Upstream timeout" : status === 502 ? "Upstream unavailable" : "Proxy Failed",
      details: error.message,
      host: targetHost,
      type: requestType || (isPlaylistHint ? 'video' : 'unknown'),
      url: targetUrl,
    });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));