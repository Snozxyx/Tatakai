'use strict';

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

function getLanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets || {})) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

function resolveBindHost(bindMode) {
  if (bindMode === 'localhost') return '127.0.0.1';
  if (bindMode === 'all') return '0.0.0.0'; // explicit opt-in
  // lan: bind to first non-internal IPv4 when available
  const lan = getLanAddresses()[0];
  return lan || '0.0.0.0';
}

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const UI_ROOT = path.join(__dirname, 'ui');

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function guessStaticContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.ico') return 'image/x-icon';
  return 'application/octet-stream';
}

function sendStatic(res, filePath, extraHeaders = {}) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': guessStaticContentType(filePath),
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
    ...extraHeaders,
  });
  res.end(body);
  return true;
}

function parseSubtitleTimestamp(value) {
  const match = String(value || '').trim().match(/(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const ms = Number(match[4] || 0);
  const total = hours * 3600 + minutes * 60 + seconds + ms / 1000;
  return Number.isFinite(total) ? total : null;
}

function formatVttTimestamp(value) {
  const totalMs = Math.max(0, Math.round(Number(value || 0) * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function normalizeSubtitleToVtt(rawText) {
  const text = String(rawText || '').replace(/\r/g, '').replace(/^\uFEFF/, '');
  const trimmed = text.trim();
  if (!trimmed || /^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed)) return '';
  if (/^WEBVTT/i.test(trimmed)) return text;

  const blocks = text.split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim() !== '');
    if (!lines.length) continue;
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) continue;
    const [leftRaw, rightRaw = ''] = lines[timingIndex].replace(/,/g, '.').split('-->');
    const rightParts = rightRaw.trim().split(/\s+/);
    const start = parseSubtitleTimestamp(leftRaw);
    const end = parseSubtitleTimestamp(rightParts[0] || '');
    if (start == null || end == null || end <= start) continue;
    const body = lines.slice(timingIndex + 1).join('\n').trim();
    if (!body) continue;
    cues.push(`${formatVttTimestamp(start)} --> ${formatVttTimestamp(end)}\n${body}`);
  }

  if (cues.length) return `WEBVTT\n\n${cues.join('\n\n')}`;
  return `WEBVTT\n\n00:00:00.000 --> 99:59:59.000\n${trimmed}`;
}

function isHlsUrl(value) {
  return /\.m3u8($|\?)/i.test(String(value || ''));
}

function isTorrentUrl(value) {
  return /^magnet:\?/i.test(String(value || '')) || /\.torrent($|\?)/i.test(String(value || ''));
}

function inferSourceType(source) {
  const url = String(source?.url || source?.magnet || '');
  const explicit = String(source?.sourceType || source?.type || '').toLowerCase();
  if (explicit === 'torrent' || isTorrentUrl(url)) return 'torrent';
  if (explicit === 'hls' || isHlsUrl(url)) return 'hls';
  if (explicit === 'mp4' || /\.(mp4|m4v|webm|mov)($|\?)/i.test(url)) return 'direct';
  return explicit || 'direct';
}

function makeToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function mergeProxyHeaders(entry, req) {
  const outbound = { ...(entry?.headers || {}) };
  if (!outbound['User-Agent'] && !outbound['user-agent']) {
    outbound['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  }
  if (req.headers.range) outbound.Range = req.headers.range;
  return outbound;
}

function serveRemoteUi(req, res, pathname, headers) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, headers);
    res.end();
    return true;
  }

  if (pathname === '/' || pathname === '/index.html') {
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
      res.end();
      return true;
    }
    if (sendStatic(res, path.join(UI_ROOT, 'index.html'), headers)) return true;
  }

  if (pathname.startsWith('/ui/')) {
    const rel = pathname.slice('/ui/'.length);
    if (!rel || rel.includes('..')) {
      res.writeHead(400, headers);
      res.end();
      return true;
    }
    if (rel === 'vendor/hls.min.js') {
      const vendorPath = path.resolve(__dirname, '..', '..', '..', 'node_modules', 'hls.js', 'dist', 'hls.min.js');
      if (req.method === 'HEAD') {
        res.writeHead(fs.existsSync(vendorPath) ? 200 : 404, {
          'Content-Type': 'application/javascript; charset=utf-8',
          ...headers,
        });
        res.end();
        return true;
      }
      if (sendStatic(res, vendorPath, headers)) return true;
      res.writeHead(404, headers);
      res.end();
      return true;
    }
    const filePath = path.join(UI_ROOT, rel);
    if (!filePath.startsWith(UI_ROOT)) {
      res.writeHead(403, headers);
      res.end();
      return true;
    }
    if (req.method === 'HEAD') {
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, headers);
        res.end();
        return true;
      }
      res.writeHead(200, { 'Content-Type': guessStaticContentType(filePath), ...headers });
      res.end();
      return true;
    }
    if (sendStatic(res, filePath, headers)) return true;
    res.writeHead(404, headers);
    res.end();
    return true;
  }

  // SPA fallback: unknown non-API paths serve the shell
  if (sendStatic(res, path.join(UI_ROOT, 'index.html'), headers)) return true;
  res.writeHead(404, headers);
  res.end();
  return true;
}

function createHomeServer({ store, adapters, logger }) {
  let server = null;
  let startedAt = null;
  const connectedClients = new Map();
  const rateBuckets = new Map();
  const streamSources = new Map();
  const subtitleSources = new Map();
  const playbackTickets = new Map();

  function corsHeaders(origin, config) {
    const allowed = config.corsOrigins || ['*'];
    const allow =
      allowed.includes('*') || (origin && allowed.includes(origin)) ? origin || '*' : allowed[0] || '*';
    return {
      'Access-Control-Allow-Origin': allow,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Tatakai-Token',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    };
  }

  function clientKey(req) {
    return String(req.socket?.remoteAddress || 'unknown');
  }

  function rateLimit(req, config) {
    const key = clientKey(req);
    const now = Date.now();
    const windowMs = 60_000;
    const limit = Number(config.rateLimitPerMinute) || 120;
    let bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.startedAt > windowMs) {
      bucket = { startedAt: now, count: 0 };
      rateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }

  function isLocalRequest(req) {
    const addr = req.socket?.remoteAddress || '';
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  }

  function authenticate(req, config, url) {
    if (isLocalRequest(req)) {
      return { ok: true, user: { id: 'local', role: 'admin', permissions: ['*'] }, via: 'localhost' };
    }

    const header = req.headers.authorization || '';
    const tokenHeader = req.headers['x-tatakai-token'];
    const cookies = parseCookies(req);
    let token = null;
    if (typeof tokenHeader === 'string' && tokenHeader) token = tokenHeader;
    if (!token && header.startsWith('Bearer ')) token = header.slice(7).trim();
    if (!token && cookies.tatakai_home_token) token = cookies.tatakai_home_token;
    if (!token && url?.searchParams?.get('access_token')) {
      token = String(url.searchParams.get('access_token')).trim();
    }

    if (!token) return { ok: false, error: 'auth_required' };

    const resolved = store.resolveToken(token);
    if (!resolved?.user) return { ok: false, error: 'invalid_token' };

    connectedClients.set(token, {
      userId: resolved.user.id,
      ip: clientKey(req),
      lastSeenAt: Date.now(),
    });

    return { ok: true, user: resolved.user, via: 'token' };
  }

  function hasPermission(user, permission) {
    if (!user) return false;
    if (user.role === 'admin' || (user.permissions || []).includes('*')) return true;
    return (user.permissions || []).includes(permission);
  }

  function userHasCatalogConsent(user, config) {
    if (!config.requireConsent) return true;
    if (user.role === 'admin' || user.id === 'local' || user.id === 'admin') return true;
    const requests = config.consentRequests || [];
    return requests.some(
      (r) => r.userId === user.id && r.status === 'approved',
    );
  }

  function guessContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.mp4') return 'video/mp4';
    if (ext === '.webm') return 'video/webm';
    if (ext === '.mkv') return 'video/x-matroska';
    if (ext === '.mov') return 'video/quicktime';
    if (ext === '.m4v') return 'video/x-m4v';
    if (ext === '.avi') return 'video/x-msvideo';
    if (ext === '.m3u8') return 'application/vnd.apple.mpegurl';
    return 'application/octet-stream';
  }

  function streamFile(req, res, filePath, extraHeaders = {}) {
    if (!fs.existsSync(filePath)) {
      return sendJson(res, 404, { success: false, error: 'file_not_found' }, extraHeaders);
    }
    const stat = fs.statSync(filePath);
    const total = stat.size;
    const range = req.headers.range;
    const contentType = guessContentType(filePath);

    if (range) {
      const parts = String(range).replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      if (Number.isNaN(start) || start >= total) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}`, ...extraHeaders });
        return res.end();
      }
      const chunkEnd = Math.min(end, total - 1);
      const chunkSize = chunkEnd - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${chunkEnd}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        ...extraHeaders,
      });
      fs.createReadStream(filePath, { start, end: chunkEnd }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      ...extraHeaders,
    });
    fs.createReadStream(filePath).pipe(res);
  }

  function pruneProxyMaps() {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [token, entry] of streamSources) {
      if ((entry.createdAt || 0) < cutoff) streamSources.delete(token);
    }
    for (const [token, entry] of subtitleSources) {
      if ((entry.createdAt || 0) < cutoff) subtitleSources.delete(token);
    }
    for (const [token, entry] of playbackTickets) {
      if ((entry.createdAt || 0) < cutoff) playbackTickets.delete(token);
    }
  }

  function registerStreamSource(entry) {
    pruneProxyMaps();
    const token = makeToken();
    streamSources.set(token, {
      url: String(entry?.url || ''),
      headers: entry?.headers && typeof entry.headers === 'object' ? entry.headers : {},
      createdAt: Date.now(),
    });
    return `/api/home/streams/source/${token}`;
  }

  function registerSubtitleSource(track, inheritedHeaders = {}) {
    const url = String(track?.url || '').trim();
    if (!url) return null;
    pruneProxyMaps();
    const token = makeToken();
    subtitleSources.set(token, {
      url,
      headers: track?.headers && typeof track.headers === 'object' ? track.headers : inheritedHeaders,
      createdAt: Date.now(),
    });
    return {
      url: `/api/home/subtitles/${token}`,
      label: track.label || track.lang || track.language || 'Subtitle',
      language: track.language || track.lang || 'en',
      default: Boolean(track.default),
    };
  }

  function registerPlaybackTicket(source, requestBody) {
    pruneProxyMaps();
    const token = makeToken();
    playbackTickets.set(token, {
      source,
      requestBody,
      createdAt: Date.now(),
    });
    return token;
  }

  function normalizePlayableSource(source, playbackUrl, sourceType) {
    const headers = source?.headers && typeof source.headers === 'object' ? source.headers : {};
    const subtitles = (Array.isArray(source?.subtitles) ? source.subtitles : Array.isArray(source?.tracks) ? source.tracks : [])
      .map((track) => registerSubtitleSource(track, headers))
      .filter(Boolean);
    return {
      id: makeToken(8),
      source: source?.source || source?.providerName || source?.extensionName || 'Tatakai',
      extensionId: source?.extensionId || null,
      extensionName: source?.extensionName || source?.source || source?.providerName || null,
      quality: source?.quality || 'auto',
      audioLanguage: source?.audioLanguage || source?.language || null,
      sourceType,
      url: playbackUrl,
      isHls: isHlsUrl(playbackUrl) || sourceType === 'hls',
      subtitles,
    };
  }

  function rewritePlaylistUrls(playlistText, playlistUrl, inheritedHeaders) {
    const base = new URL(playlistUrl);
    const rewriteUrl = (targetUrl) => {
      try {
        const resolved = new URL(String(targetUrl || '').trim(), base).href;
        return registerStreamSource({ url: resolved, headers: inheritedHeaders });
      } catch {
        return targetUrl;
      }
    };

    return String(playlistText || '')
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed.startsWith('#')) {
          return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${rewriteUrl(uri)}"`);
        }
        return rewriteUrl(trimmed);
      })
      .join('\n');
  }

  async function proxyRegisteredSource(req, res, token, extraHeaders = {}) {
    const entry = streamSources.get(token);
    if (!entry?.url) return sendJson(res, 404, { success: false, error: 'source_expired' }, extraHeaders);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);
    let upstream;
    try {
      upstream = await fetch(entry.url, {
        method: 'GET',
        headers: mergeProxyHeaders(entry, req),
        redirect: 'follow',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
    const isPlaylist =
      isHlsUrl(entry.url) ||
      contentType.includes('application/vnd.apple.mpegurl') ||
      contentType.includes('application/x-mpegurl');

    if (isPlaylist) {
      const text = await upstream.text();
      const rewritten = rewritePlaylistUrls(text, entry.url, entry.headers || {});
      res.writeHead(upstream.status, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
        ...extraHeaders,
      });
      res.end(rewritten);
      return;
    }

    const passHeaders = {
      ...extraHeaders,
      'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
    };
    const hop = new Set([
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailers',
      'transfer-encoding',
      'upgrade',
    ]);
    upstream.headers.forEach((value, key) => {
      if (!hop.has(String(key).toLowerCase())) passHeaders[key] = value;
    });
    res.writeHead(upstream.status, passHeaders);
    if (!upstream.body) return res.end();

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
    res.end();
  }

  async function proxyRegisteredSubtitle(_req, res, token, extraHeaders = {}) {
    const entry = subtitleSources.get(token);
    if (!entry?.url) return sendJson(res, 404, { success: false, error: 'subtitle_expired' }, extraHeaders);
    const upstream = await fetch(entry.url, {
      method: 'GET',
      headers: mergeProxyHeaders(entry, { headers: {} }),
      redirect: 'follow',
    });
    if (!upstream.ok) {
      return sendJson(res, upstream.status, { success: false, error: 'subtitle_unavailable' }, extraHeaders);
    }
    const raw = await upstream.text();
    const vtt = normalizeSubtitleToVtt(raw);
    res.writeHead(200, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Content-Length': Buffer.byteLength(vtt),
      'Cache-Control': 'no-cache',
      ...extraHeaders,
    });
    res.end(vtt);
  }

  function resolveSourceMethod(body) {
    const method = String(body?.method || '').toLowerCase();
    if (method) return method;
    const media = body?.media || {};
    const format = String(media.format || '').toUpperCase();
    if (format === 'MOVIE' || Number(media.episodes || 0) === 1) return 'movie';
    return 'single';
  }

  async function makePlayableSources(body) {
    const resolved = await adapters.resolveSources({
      ...body,
      method: resolveSourceMethod(body),
    });
    const playable = [];

    for (const source of resolved.sources || []) {
      const sourceType = inferSourceType(source);
      if (sourceType === 'torrent') {
        const sourceToken = registerPlaybackTicket(source, body);
        playable.push({
          id: makeToken(8),
          source: source.source || source.providerName || source.extensionName || 'Torrent',
          extensionId: source.extensionId || null,
          extensionName: source.extensionName || source.source || null,
          quality: source.quality || 'auto',
          audioLanguage: source.audioLanguage || source.language || null,
          sourceType: 'torrent',
          requiresStart: true,
          sourceToken,
          subtitles: (Array.isArray(source?.subtitles) ? source.subtitles : Array.isArray(source?.tracks) ? source.tracks : [])
            .map((track) => registerSubtitleSource(track, source.headers || {}))
            .filter(Boolean),
        });
        continue;
      }

      const playbackUrl = registerStreamSource({
        url: source.url,
        headers: source.headers && typeof source.headers === 'object' ? source.headers : {},
      });
      playable.push(normalizePlayableSource(source, playbackUrl, sourceType === 'hls' ? 'hls' : 'direct'));
    }

    return {
      ...resolved,
      playableSources: playable,
    };
  }

  async function startPlayableSource(body = {}) {
    const sourceToken = String(body.sourceToken || '').trim();
    const ticket = playbackTickets.get(sourceToken);
    if (!ticket?.source) return { success: false, error: 'source_expired' };

    const source = ticket.source;
    const requestBody = ticket.requestBody || {};
    const start = await adapters.startTorrent(source.url || source.magnet, {
      magnet: source.url || source.magnet,
      animeName: requestBody?.animeName || requestBody?.media?.titleRomaji || requestBody?.media?.titleEnglish,
      anilistId: requestBody?.anilistId || requestBody?.media?.anilistId,
      episodeNumber: requestBody?.episodeNumber || requestBody?.episode,
      preferredLanguage: requestBody?.category || requestBody?.languageMode,
      source,
    });
    if (!start?.success) return { success: false, error: start?.error || 'torrent_start_failed' };

    const sessionId = start.sessionId || start.id;
    const fileIndex = Number.isFinite(Number(start.fileIndex)) ? Number(start.fileIndex) : 0;
    const stream = await adapters.streamTorrent(sessionId, fileIndex, {
      audioTrackIndex: body?.audioTrackIndex,
    });
    if (!stream?.success || !stream.url) {
      return {
        success: false,
        error: stream?.error || 'torrent_stream_failed',
        sessionId,
      };
    }

    const proxiedUrl = registerStreamSource({ url: stream.url, headers: {} });
    return {
      success: true,
      source: {
        ...normalizePlayableSource(source, proxiedUrl, isHlsUrl(stream.url) ? 'hls' : 'torrent'),
        sessionId,
        fileIndex: stream.fileIndex ?? fileIndex,
        torrentName: stream.name || start.name || null,
      },
    };
  }

  async function handle(req, res) {
    const config = store.read();
    const origin = req.headers.origin;
    const headers = corsHeaders(origin, config);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers);
      return res.end();
    }

    if (!rateLimit(req, config)) {
      return sendJson(res, 429, { success: false, error: 'rate_limited' }, headers);
    }

    let url;
    try {
      url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    } catch {
      return sendJson(res, 400, { success: false, error: 'bad_request' }, headers);
    }

    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    // Remote web UI (Tatakai-branded SPA for TV / phone / tablet)
    if (!pathname.startsWith('/api/')) {
      return serveRemoteUi(req, res, pathname, headers);
    }

    // Public health
    if (pathname === '/api/home/health' && req.method === 'GET') {
      return sendJson(
        res,
        200,
        {
          success: true,
          data: {
            ok: true,
            name: 'Tatakai Home Server',
            startedAt,
            remoteEnabled: Boolean(config.remoteEnabled),
          },
        },
        headers,
      );
    }

    // Login (password to token)
    if (pathname === '/api/home/auth/login' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        const password = String(body.password || '');
        const label = String(body.label || 'device');
        const userId = String(body.userId || 'admin');
        const user = (config.users || []).find((u) => u.id === userId);
        const hash = user?.passwordHash || config.passwordHash;
        const salt = user?.passwordSalt || config.passwordSalt;
        if (!hash || !salt) {
          return sendJson(res, 400, { success: false, error: 'password_not_configured' }, headers);
        }
        if (!store.verifyPassword(password, hash, salt)) {
          return sendJson(res, 401, { success: false, error: 'invalid_credentials' }, headers);
        }
        const token = store.issueToken(userId, label);
        const cookieMaxAge = 60 * 60 * 24 * 30;
        const cookie = `tatakai_home_token=${encodeURIComponent(token)}; Path=/; Max-Age=${cookieMaxAge}; SameSite=Lax; HttpOnly`;
        return sendJson(
          res,
          200,
          {
            success: true,
            data: {
              token,
              user: { id: userId, name: user?.name || userId, role: user?.role || 'admin' },
            },
          },
          { ...headers, 'Set-Cookie': cookie },
        );
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message || 'bad_body' }, headers);
      }
    }

    const auth = authenticate(req, config, url);
    if (!auth.ok) {
      return sendJson(res, 401, { success: false, error: auth.error }, headers);
    }

    try {
      if (pathname === '/api/home/status' && req.method === 'GET') {
        return sendJson(
          res,
          200,
          {
            success: true,
            data: {
              running: Boolean(server),
              startedAt,
              port: config.port,
              bindMode: config.bindMode,
              lanAddresses: getLanAddresses(),
              remoteEnabled: Boolean(config.remoteEnabled),
              remoteBaseUrl: config.remoteBaseUrl || null,
              catalogApiBase: config.catalogApiBase || null,
              shareCatalog: Boolean(config.shareCatalog),
              requireConsent: Boolean(config.requireConsent),
              clients: Array.from(connectedClients.values()),
              user: { id: auth.user.id, role: auth.user.role },
            },
          },
          headers,
        );
      }

      if (pathname === '/api/home/consent/request' && req.method === 'POST') {
        const body = await readBody(req);
        const label = String(body.label || 'device');
        const id = crypto.randomBytes(8).toString('hex');
        const next = store.read();
        next.consentRequests = next.consentRequests || [];
        // Replace prior pending for same user
        next.consentRequests = next.consentRequests.filter(
          (r) => !(r.userId === auth.user.id && r.status === 'pending'),
        );
        next.consentRequests.push({
          id,
          userId: auth.user.id,
          label,
          status: 'pending',
          createdAt: Date.now(),
        });
        store.write(next);
        return sendJson(res, 200, { success: true, data: { id, status: 'pending' } }, headers);
      }

      if (pathname === '/api/home/consent' && req.method === 'GET') {
        if (!hasPermission(auth.user, 'users') && auth.user.role !== 'admin') {
          const mine = (config.consentRequests || []).filter((r) => r.userId === auth.user.id);
          return sendJson(res, 200, { success: true, data: { requests: mine } }, headers);
        }
        return sendJson(res, 200, { success: true, data: { requests: config.consentRequests || [] } }, headers);
      }

      if (pathname === '/api/home/catalog/home' && req.method === 'GET') {
        if (!hasPermission(auth.user, 'catalog')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        const data = await adapters.getCatalogHome();
        return sendJson(res, 200, { success: true, data }, headers);
      }

      if (pathname === '/api/home/catalog/search' && req.method === 'GET') {
        if (!hasPermission(auth.user, 'catalog')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        const data = await adapters.searchCatalog(Object.fromEntries(url.searchParams.entries()));
        return sendJson(res, 200, { success: true, data }, headers);
      }

      const catalogMediaMatch = pathname.match(/^\/api\/home\/catalog\/media\/([^/]+)$/);
      if (catalogMediaMatch && req.method === 'GET') {
        if (!hasPermission(auth.user, 'catalog')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        const data = await adapters.getCatalogMedia(decodeURIComponent(catalogMediaMatch[1]));
        if (!data) return sendJson(res, 404, { success: false, error: 'not_found' }, headers);
        return sendJson(res, 200, { success: true, data }, headers);
      }

      if (pathname === '/api/home/catalog' && req.method === 'GET') {
        if (!config.shareCatalog) {
          return sendJson(res, 403, { success: false, error: 'catalog_sharing_disabled' }, headers);
        }
        if (!hasPermission(auth.user, 'catalog') && !hasPermission(auth.user, 'library')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        if (!userHasCatalogConsent(auth.user, config)) {
          return sendJson(res, 403, { success: false, error: 'consent_required' }, headers);
        }
        const data = await adapters.getLibrary();
        return sendJson(res, 200, { success: true, data }, headers);
      }

      const catalogItemMatch = pathname.match(/^\/api\/home\/catalog\/([^/]+)$/);
      if (catalogItemMatch && req.method === 'GET') {
        if (!config.shareCatalog) {
          return sendJson(res, 403, { success: false, error: 'catalog_sharing_disabled' }, headers);
        }
        if (!userHasCatalogConsent(auth.user, config)) {
          return sendJson(res, 403, { success: false, error: 'consent_required' }, headers);
        }
        const animeId = decodeURIComponent(catalogItemMatch[1]);
        const library = await adapters.getLibrary();
        const item = (library || []).find(
          (row) => String(row.name) === animeId || String(row.path || '').endsWith(animeId),
        );
        if (!item) return sendJson(res, 404, { success: false, error: 'not_found' }, headers);
        return sendJson(res, 200, { success: true, data: item }, headers);
      }

      const subtitleMatch = pathname.match(/^\/api\/home\/catalog\/([^/]+)\/subtitle\/([^/]+)\/([^/]+)$/);
      if (subtitleMatch && req.method === 'GET') {
        if (!config.shareCatalog) {
          return sendJson(res, 403, { success: false, error: 'catalog_sharing_disabled' }, headers);
        }
        if (!hasPermission(auth.user, 'streams') && !hasPermission(auth.user, 'catalog')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        if (!userHasCatalogConsent(auth.user, config)) {
          return sendJson(res, 403, { success: false, error: 'consent_required' }, headers);
        }

        const animeId = decodeURIComponent(subtitleMatch[1]);
        const episodeKey = decodeURIComponent(subtitleMatch[2]);
        const subtitleIndex = Number(decodeURIComponent(subtitleMatch[3])) || 0;
        const library = await adapters.getLibrary();
        const item = (library || []).find(
          (row) => String(row.name) === animeId || String(row.path || '').endsWith(animeId),
        );
        const episode = (item?.episodes || []).find(
          (ep) =>
            String(ep.number) === episodeKey ||
            String(ep.id) === episodeKey ||
            String(ep.file) === episodeKey,
        );
        const subtitle = episode?.subtitles?.[subtitleIndex];
        if (!item?.path || !subtitle) {
          return sendJson(res, 404, { success: false, error: 'subtitle_not_found' }, headers);
        }

        const rawSubtitle = subtitle.originalUrl || subtitle.sourceUrl || subtitle.file || subtitle.url;
        let text = '';
        if (/^https?:\/\//i.test(String(rawSubtitle || ''))) {
          const upstream = await fetch(rawSubtitle);
          if (!upstream.ok) {
            return sendJson(res, upstream.status, { success: false, error: 'subtitle_unavailable' }, headers);
          }
          text = await upstream.text();
        } else {
          const localName = String(subtitle.file || rawSubtitle || '').replace(/^\/+/, '');
          const subtitlePath = path.resolve(path.join(item.path, localName));
          const resolvedRoot = path.resolve(item.path);
          if (!subtitlePath.startsWith(resolvedRoot + path.sep) || !fs.existsSync(subtitlePath)) {
            return sendJson(res, 404, { success: false, error: 'subtitle_not_found' }, headers);
          }
          text = fs.readFileSync(subtitlePath, 'utf8');
        }

        const vtt = normalizeSubtitleToVtt(text);
        res.writeHead(200, {
          'Content-Type': 'text/vtt; charset=utf-8',
          'Content-Length': Buffer.byteLength(vtt),
          'Cache-Control': 'no-cache',
          ...headers,
        });
        res.end(vtt);
        return;
      }

      const streamMatch = pathname.match(/^\/api\/home\/catalog\/([^/]+)\/stream\/([^/]+)$/);
      if (streamMatch && req.method === 'GET') {
        if (!config.shareCatalog) {
          return sendJson(res, 403, { success: false, error: 'catalog_sharing_disabled' }, headers);
        }
        if (!hasPermission(auth.user, 'streams') && !hasPermission(auth.user, 'catalog')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        if (!userHasCatalogConsent(auth.user, config)) {
          return sendJson(res, 403, { success: false, error: 'consent_required' }, headers);
        }
        const animeId = decodeURIComponent(streamMatch[1]);
        const episodeKey = decodeURIComponent(streamMatch[2]);
        const library = await adapters.getLibrary();
        const item = (library || []).find(
          (row) => String(row.name) === animeId || String(row.path || '').endsWith(animeId),
        );
        if (!item?.path) return sendJson(res, 404, { success: false, error: 'not_found' }, headers);
        const episode = (item.episodes || []).find(
          (ep) =>
            String(ep.number) === episodeKey ||
            String(ep.id) === episodeKey ||
            String(ep.file) === episodeKey,
        );
        if (!episode?.file) return sendJson(res, 404, { success: false, error: 'episode_not_found' }, headers);
        const filePath = path.join(item.path, episode.file);
        const resolvedFilePath = path.resolve(filePath);
        const resolvedRoot = path.resolve(item.path);
        if (!resolvedFilePath.startsWith(resolvedRoot + path.sep)) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        return streamFile(req, res, resolvedFilePath, headers);
      }

      // Serve poster image for a catalog item
      const posterMatch = pathname.match(/^\/api\/home\/catalog\/([^/]+)\/poster$/);
      if (posterMatch && req.method === 'GET') {
        if (!config.shareCatalog) {
          return sendJson(res, 403, { success: false, error: 'catalog_sharing_disabled' }, headers);
        }
        if (!userHasCatalogConsent(auth.user, config)) {
          return sendJson(res, 403, { success: false, error: 'consent_required' }, headers);
        }
        const animeId = decodeURIComponent(posterMatch[1]);
        const library = await adapters.getLibrary();
        const item = (library || []).find(
          (row) => String(row.name) === animeId || String(row.path || '').endsWith(animeId),
        );
        if (!item?.path) return sendJson(res, 404, { success: false, error: 'not_found' }, headers);
        const posterPath = path.join(item.path, 'poster.jpg');
        if (!fs.existsSync(posterPath)) {
          return sendJson(res, 404, { success: false, error: 'poster_not_found' }, headers);
        }
        const posterData = fs.readFileSync(posterPath);
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Content-Length': posterData.length,
          'Cache-Control': 'public, max-age=86400',
          ...headers,
        });
        res.end(posterData);
        return;
      }

      // Extract embedded subtitle track from MKV on-demand via ffmpeg
      // GET /api/home/catalog/:animeId/extract-subtitle/:episodeKey/:trackIndex
      const extractSubMatch = pathname.match(/^\/api\/home\/catalog\/([^/]+)\/extract-subtitle\/([^/]+)\/(\d+)$/);
      if (extractSubMatch && req.method === 'GET') {
        if (!config.shareCatalog) {
          return sendJson(res, 403, { success: false, error: 'catalog_sharing_disabled' }, headers);
        }
        if (!userHasCatalogConsent(auth.user, config)) {
          return sendJson(res, 403, { success: false, error: 'consent_required' }, headers);
        }
        const animeId = decodeURIComponent(extractSubMatch[1]);
        const episodeKey = decodeURIComponent(extractSubMatch[2]);
        const trackIndex = parseInt(extractSubMatch[3], 10);

        const library = await adapters.getLibrary();
        const item = (library || []).find(
          (row) => String(row.name) === animeId || String(row.path || '').endsWith(animeId),
        );
        if (!item?.path) return sendJson(res, 404, { success: false, error: 'not_found' }, headers);
        const episode = (item.episodes || []).find(
          (ep) => String(ep.number) === episodeKey || String(ep.id) === episodeKey || String(ep.file) === episodeKey,
        );
        if (!episode?.file) return sendJson(res, 404, { success: false, error: 'episode_not_found' }, headers);

        const videoPath = path.resolve(path.join(item.path, episode.file));
        const resolvedRoot = path.resolve(item.path);
        if (!videoPath.startsWith(resolvedRoot + path.sep) || !fs.existsSync(videoPath)) {
          return sendJson(res, 404, { success: false, error: 'video_not_found' }, headers);
        }

        // Use MediaProbeService to extract the subtitle track
        try {
          const { MediaProbeService } = require('../../services/media-probe.cjs');
          const tempDir = path.join(require('os').tmpdir(), 'tatakai-home-sub');
          if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
          const outFile = path.join(tempDir, `sub-${crypto.randomBytes(8).toString('hex')}.vtt`);
          const service = new MediaProbeService({ warn: () => {}, error: () => {}, info: () => {} });
          const result = await service.extractSubtitle(videoPath, trackIndex, outFile);
          if (!result?.success || !fs.existsSync(outFile)) {
            return sendJson(res, 500, { success: false, error: result?.error || 'extraction_failed' }, headers);
          }
          const vttContent = fs.readFileSync(outFile, 'utf8');
          // Clean up temp file
          try { fs.unlinkSync(outFile); } catch { /* ignore */ }
          const vtt = normalizeSubtitleToVtt(vttContent);
          res.writeHead(200, {
            'Content-Type': 'text/vtt; charset=utf-8',
            'Content-Length': Buffer.byteLength(vtt),
            'Cache-Control': 'no-cache',
            ...headers,
          });
          res.end(vtt);
        } catch (err) {
          return sendJson(res, 500, { success: false, error: err.message }, headers);
        }
        return;
      }

      if (pathname === '/api/home/library' && req.method === 'GET') {
        if (!hasPermission(auth.user, 'library')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        const data = await adapters.getLibrary();
        return sendJson(res, 200, { success: true, data }, headers);
      }

      if (pathname === '/api/home/downloads' && req.method === 'GET') {
        if (!hasPermission(auth.user, 'downloads')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        const data = await adapters.getDownloads();
        return sendJson(res, 200, { success: true, data }, headers);
      }

      if (pathname === '/api/home/extensions' && req.method === 'GET') {
        if (!hasPermission(auth.user, 'extensions')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        const data = await adapters.listExtensions();
        return sendJson(res, 200, { success: true, data }, headers);
      }

      if (pathname === '/api/home/extensions/invoke' && req.method === 'POST') {
        if (!hasPermission(auth.user, 'extensions')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        // Extensions always execute on the host; remote clients only receive results.
        const body = await readBody(req);
        const data = await adapters.invokeExtension(
          String(body.extensionId || ''),
          String(body.method || ''),
          body.args,
        );
        return sendJson(res, 200, { success: true, data }, headers);
      }

      if (pathname === '/api/home/playback/resolve' && req.method === 'POST') {
        if (!hasPermission(auth.user, 'streams')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        const body = await readBody(req);
        const data = await makePlayableSources(body);
        return sendJson(res, 200, { success: true, data }, headers);
      }

      if (pathname === '/api/home/playback/start' && req.method === 'POST') {
        if (!hasPermission(auth.user, 'streams')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        const body = await readBody(req);
        const data = await startPlayableSource(body);
        const status = data?.success === false ? 503 : 200;
        return sendJson(res, status, { success: data?.success !== false, data, error: data?.error }, headers);
      }

      if (pathname === '/api/home/torrents' && req.method === 'GET') {
        if (!hasPermission(auth.user, 'streams')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        const data = await adapters.listTorrents();
        return sendJson(res, 200, { success: true, data }, headers);
      }

      if (pathname === '/api/home/torrents/search' && req.method === 'GET') {
        if (!hasPermission(auth.user, 'streams')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        const data = await adapters.searchTorrents(Object.fromEntries(url.searchParams.entries()));
        return sendJson(res, 200, { success: true, data }, headers);
      }

      if (pathname === '/api/home/torrents/start' && req.method === 'POST') {
        if (!hasPermission(auth.user, 'streams')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        const body = await readBody(req);
        const data = await adapters.startTorrent(body.magnet || body.infoHash || body.url, body);
        return sendJson(res, 200, { success: true, data }, headers);
      }

      const torrentStatsMatch = pathname.match(/^\/api\/home\/torrents\/([^/]+)\/stats$/);
      if (torrentStatsMatch && req.method === 'GET') {
        if (!hasPermission(auth.user, 'streams')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        const data = await adapters.getTorrentStats(decodeURIComponent(torrentStatsMatch[1]));
        return sendJson(res, 200, { success: true, data }, headers);
      }

      const torrentStreamMatch = pathname.match(/^\/api\/home\/torrents\/([^/]+)\/stream\/([^/]+)$/);
      if (torrentStreamMatch && req.method === 'GET') {
        if (!hasPermission(auth.user, 'streams')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        const sessionId = decodeURIComponent(torrentStreamMatch[1]);
        const fileIndex = Number(decodeURIComponent(torrentStreamMatch[2])) || 0;
        const stream = await adapters.streamTorrent(sessionId, fileIndex, {
          audioTrackIndex: url.searchParams.has('audioTrackIndex')
            ? Number(url.searchParams.get('audioTrackIndex'))
            : undefined,
        });
        if (!stream?.success || !stream.url) {
          return sendJson(res, 503, { success: false, error: stream?.error || 'stream_unavailable' }, headers);
        }
        const tokenUrl = registerStreamSource({ url: stream.url, headers: {} });
        const token = tokenUrl.split('/').pop();
        return proxyRegisteredSource(req, res, token, headers);
      }

      const sourceProxyMatch = pathname.match(/^\/api\/home\/streams\/source\/([a-f0-9]+)$/i);
      if (sourceProxyMatch && req.method === 'GET') {
        if (!hasPermission(auth.user, 'streams')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        return proxyRegisteredSource(req, res, sourceProxyMatch[1], headers);
      }

      const subtitleProxyMatch = pathname.match(/^\/api\/home\/subtitles\/([a-f0-9]+)$/i);
      if (subtitleProxyMatch && req.method === 'GET') {
        if (!hasPermission(auth.user, 'streams')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        return proxyRegisteredSubtitle(req, res, subtitleProxyMatch[1], headers);
      }

      if (pathname === '/api/home/streams/proxy-info' && req.method === 'GET') {
        if (!hasPermission(auth.user, 'streams')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        const data = await adapters.getStreamProxyInfo();
        return sendJson(res, 200, { success: true, data }, headers);
      }

      if (pathname === '/api/home/users' && req.method === 'GET') {
        if (!hasPermission(auth.user, 'users')) {
          return sendJson(res, 403, { success: false, error: 'forbidden' }, headers);
        }
        const users = (config.users || []).map((u) => ({
          id: u.id,
          name: u.name,
          role: u.role,
          permissions: u.permissions,
          hasPassword: Boolean(u.passwordHash || (u.id === 'admin' && config.passwordHash)),
        }));
        return sendJson(res, 200, { success: true, data: users }, headers);
      }

      return sendJson(res, 404, { success: false, error: 'not_found' }, headers);
    } catch (err) {
      logger?.warn?.('home-server request failed', err);
      return sendJson(res, 500, { success: false, error: err.message || 'internal_error' }, headers);
    }
  }

  async function start(overrides = {}) {
    if (server) await stop();

    const config = store.read();
    const next = { ...config, ...overrides, enabled: true };
    store.write(next);

    const host = resolveBindHost(next.bindMode);
    const port = Number(next.port) || 8787;

    await new Promise((resolve, reject) => {
      server = http.createServer((req, res) => {
        void handle(req, res);
      });
      server.on('error', reject);
      server.listen(port, host, () => {
        startedAt = Date.now();
        logger?.info?.(`[HomeServer] listening on ${host}:${port} (${next.bindMode})`);
        resolve();
      });
    });

    return getStatus();
  }

  async function stop() {
    const config = store.read();
    config.enabled = false;
    store.write(config);
    connectedClients.clear();
    if (!server) return { running: false };
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
    server = null;
    startedAt = null;
    return { running: false };
  }

  function getStatus() {
    const config = store.read();
    return {
      running: Boolean(server),
      startedAt,
      port: config.port,
      bindMode: config.bindMode,
      bindHost: resolveBindHost(config.bindMode),
      lanAddresses: getLanAddresses(),
      enabled: config.enabled,
      remoteEnabled: Boolean(config.remoteEnabled),
      remoteBaseUrl: config.remoteBaseUrl || null,
      catalogApiBase: config.catalogApiBase || null,
      shareCatalog: Boolean(config.shareCatalog),
      requireConsent: Boolean(config.requireConsent),
      passwordConfigured: Boolean(config.passwordHash),
      clients: Array.from(connectedClients.values()),
      urls: getLanAddresses().map((ip) => `http://${ip}:${config.port}`),
    };
  }

  return { start, stop, getStatus, getLanAddresses };
}

module.exports = { createHomeServer, getLanAddresses, resolveBindHost };
