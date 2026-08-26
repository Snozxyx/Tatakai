/**
 * Toko in API form — Unified Streaming + Torrent API
 *
 * Endpoints:
 *   GET /api/v3/health                   — Health check
 *   GET /api/v3/toko/stream              — Stream sources only (SSE or JSON)
 *   GET /api/v3/toko/torrent             — Torrent sources only (SSE or JSON)
 *   GET /api/v3/toko/sources             — All sources: streams + torrents (SSE or JSON)
 *   GET /api/v3/toko/debug               — Raw diagnostics per provider
 *   GET /api/v3/toko/languages           — Language capabilities
 *   GET /api/v3/toko/index/episodes      — Episode index
 *   GET /api/v3/toko/index/chapters      — Chapter index (stub)
 *
 * Add ?stream=0 to any endpoint to get a plain JSON response instead of SSE.
 *
 * Sources are categorized by:
 *   - language (BCP-47 code, human label, isDub)
 *   - type (hls, mp4, embed, torrent)
 *   - server/provider name
 *
 * Cache: in-memory LRU, 10-min TTL for streams, 30-min for torrents.
 */
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const PORT = Number(process.env.PORT || process.env.TOKO_API_PORT || 8099);
const HOST = process.env.TOKO_API_HOST || '127.0.0.1';

// ── Bundle loading ────────────────────────────────────────────────────────────

const TOKO_BUNDLE_SRC = path.resolve(__dirname, '../../dist/bundle.js');
const TOKO_BUNDLE_DIR = path.join(os.tmpdir(), 'toko-api-bundle');

let _bundleLoadCount = 0;

function loadBundle() {
  if (!existsSync(TOKO_BUNDLE_SRC)) {
    throw new Error(
      `Toko bundle not found at ${TOKO_BUNDLE_SRC}. Run: npm --prefix extension/toko run build`,
    );
  }
  mkdirSync(TOKO_BUNDLE_DIR, { recursive: true });

  // Write to a unique path each load so Node's require cache never blocks us
  _bundleLoadCount++;
  const TOKO_BUNDLE = path.join(TOKO_BUNDLE_DIR, `bundle-${_bundleLoadCount}.cjs`);
  copyFileSync(TOKO_BUNDLE_SRC, TOKO_BUNDLE);

  const mod = require(TOKO_BUNDLE);
  const Bundle = mod.default || mod;
  const instance = typeof Bundle === 'function' ? new Bundle() : Bundle;
  if (!instance || typeof instance.single !== 'function') {
    throw new Error('Toko bundle does not expose single()');
  }
  return instance;
}

let toko = null;
function getToko() {
  if (!toko) {
    try {
      toko = loadBundle();
      console.log(`[toko-api] bundle loaded (${toko.constructor?.name || 'toko'})`);
    } catch (err) {
      console.error('[toko-api] failed to load bundle:', err.message);
    }
  }
  return toko;
}

// ── In-Memory Cache ───────────────────────────────────────────────────────────

const STREAM_TTL_MS  = 10 * 60 * 1000; // 10 minutes
const TORRENT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 200;

const cache = new Map(); // key → { data, expiresAt }

function cacheKey(type, opts) {
  return `${type}:${opts.anilistId}:${opts.episode}:${opts.resolution}:${(opts.preferredLanguages || []).join(',')}`;
}

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data, ttl) {
  if (cache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

// ── AniList title pre-fetch ───────────────────────────────────────────────────

const anilistTitleCache = new Map(); // anilistId → { titles, expiresAt }
const ANILIST_TITLE_TTL = 60 * 60 * 1000; // 1 hour

// AniList lists a show's synonyms mostly as *localized* titles — Korean, Thai,
// Italian, Indonesian. None match the English/Japanese catalogues these providers
// index, and every extra title is another HTTP request for the providers that
// iterate all of them. Keep only Latin-script synonyms, capped at 2.
//
// Must stay identical to `usefulSynonyms` in
// desktop/runtime/extension-api-host/host-server.cjs — when these two diverge,
// this endpoint and the in-app host return different results for the same show,
// which is indistinguishable from the app dropping sources.
const LATIN_TITLE_RE = /^[\p{Script=Latin}\p{Nd}\p{P}\p{Zs}\p{S}]+$/u;

// "JJK", "KnY", "OP" — real alternate names, but a site search for the
// initialism finds nothing, and they'd otherwise consume both synonym slots
// ahead of a usable alternate release name ("Sorcery Fight").
function isAbbreviation(s) {
  if (/\s/.test(s)) return false;
  if (s.length <= 4) return true;
  return s.length <= 6 && s === s.toUpperCase() && /[A-Z]/.test(s);
}

function usefulSynonyms(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && LATIN_TITLE_RE.test(s) && !isAbbreviation(s))
    .slice(0, 2);
}

async function fetchAniListTitles(anilistId) {
  if (!anilistId || anilistId <= 0) return [];

  const cached = anilistTitleCache.get(anilistId);
  if (cached && Date.now() < cached.expiresAt) return cached.titles;

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: `query ($id: Int) { Media(id: $id, type: ANIME) { title { english romaji userPreferred native } synonyms } }`,
        variables: { id: anilistId },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const payload = await res.json();
    const media = payload?.data?.Media;
    const t = media?.title;
    // Canonical titles first — providers that only try `titles[0]` or
    // `.slice(0, 2)` must still get the best names, so synonyms go last.
    const titles = [t?.english, t?.romaji, t?.userPreferred, t?.native, ...usefulSynonyms(media?.synonyms)]
      .filter(Boolean)
      .map((v) => String(v).trim())
      .filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);

    anilistTitleCache.set(anilistId, { titles, expiresAt: Date.now() + ANILIST_TITLE_TTL });
    return titles;
  } catch {
    return [];
  }
}

// ── Language helpers ──────────────────────────────────────────────────────────

const LANG_LABEL_MAP = {
  ja: 'Japanese', en: 'English', ar: 'Arabic', fr: 'French', de: 'German',
  pl: 'Polish', zh: 'Chinese', es: 'Spanish', pt: 'Portuguese', it: 'Italian',
  ko: 'Korean', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam',
  kn: 'Kannada', bn: 'Bengali', mr: 'Marathi', und: 'Unknown',
};

const LANG_FLAG_MAP = {
  ja: '🇯🇵', en: '🇬🇧', ar: '🇸🇦', fr: '🇫🇷', de: '🇩🇪',
  pl: '🇵🇱', zh: '🇨🇳', es: '🇪🇸', pt: '🇵🇹', it: '🇮🇹',
  ko: '🇰🇷', hi: '🇮🇳', ta: '🇮🇳', te: '🇮🇳', ml: '🇮🇳',
  kn: '🇮🇳', bn: '🇮🇳', mr: '🇮🇳', und: '🌐',
};

/**
 * Provider-level default language inference when no audioLanguage is set.
 * Keeps server.js self-contained without requiring the bundle's language util.
 */
const PROVIDER_DEFAULT_LANG = {
  desidub:     { code: 'hi', name: 'Hindi',   isDub: true },
  aniworld:    { code: 'de', name: 'German',  isDub: true },
  animepahe:   { code: 'ja', name: 'Japanese', isDub: false },
  toonstream:  { code: 'en', name: 'English', isDub: true },
  fouranime:   { code: 'en', name: 'English', isDub: true },
  nyaa:        { code: 'ja', name: 'Japanese', isDub: false },
  acgrip:      { code: 'ja', name: 'Japanese', isDub: false },
  animetosho:  { code: 'ja', name: 'Japanese', isDub: false },
  subplease:   { code: 'ja', name: 'Japanese', isDub: false },
  seadex:      { code: 'ja', name: 'Japanese', isDub: false },
};

function inferLanguage(source) {
  const providerKey = (source.providerName || source.source || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (PROVIDER_DEFAULT_LANG[providerKey]) return PROVIDER_DEFAULT_LANG[providerKey];

  const srcLower = (source.source || '').toLowerCase();
  if (/\bdub\b/.test(srcLower))       return { code: 'en', name: 'English',   isDub: true };
  if (/\bsub\b/.test(srcLower))       return { code: 'ja', name: 'Japanese',  isDub: false };
  if (/\bhindi\b/.test(srcLower))     return { code: 'hi', name: 'Hindi',     isDub: true };
  if (/\btamil\b/.test(srcLower))     return { code: 'ta', name: 'Tamil',     isDub: true };
  if (/\btelugu\b/.test(srcLower))    return { code: 'te', name: 'Telugu',    isDub: true };
  if (/\bkannada\b/.test(srcLower))   return { code: 'kn', name: 'Kannada',   isDub: true };
  if (/\bmalayalam\b/.test(srcLower)) return { code: 'ml', name: 'Malayalam', isDub: true };
  if (/\bbengali\b/.test(srcLower))   return { code: 'bn', name: 'Bengali',   isDub: true };
  if (/\bmarathi\b/.test(srcLower))   return { code: 'mr', name: 'Marathi',   isDub: true };
  if (/\barabic\b/.test(srcLower))    return { code: 'ar', name: 'Arabic',    isDub: true };
  if (/\bfrench\b/.test(srcLower))    return { code: 'fr', name: 'French',    isDub: true };
  if (/\bgerman\b/.test(srcLower))    return { code: 'de', name: 'German',    isDub: true };

  const urlLower = (source.url || '').toLowerCase();
  if (/\/hindi\/|[_-]hindi[_-]/.test(urlLower))       return { code: 'hi', name: 'Hindi',     isDub: true };
  if (/\/tamil\/|[_-]tamil[_-]/.test(urlLower))       return { code: 'ta', name: 'Tamil',     isDub: true };
  if (/\/telugu\/|[_-]telugu[_-]/.test(urlLower))     return { code: 'te', name: 'Telugu',    isDub: true };
  if (/\/kannada\/|[_-]kannada[_-]/.test(urlLower))   return { code: 'kn', name: 'Kannada',   isDub: true };
  if (/\/malayalam\/|[_-]malayalam[_-]/.test(urlLower)) return { code: 'ml', name: 'Malayalam', isDub: true };
  if (/\/arabic\/|[_-]arabic[_-]/.test(urlLower))     return { code: 'ar', name: 'Arabic',    isDub: true };
  if (/\/french\/|[_-]french[_-]/.test(urlLower))     return { code: 'fr', name: 'French',    isDub: true };
  if (/\/german\/|[_-]german[_-]/.test(urlLower))     return { code: 'de', name: 'German',    isDub: true };

  // Default: Japanese sub for anime providers
  return { code: 'ja', name: 'Japanese', isDub: false };
}

const isHls = (url) => /\.m3u8($|[?#/])/i.test(String(url || ''));

function resolveSourceType(s) {
  if (s.sourceType === 'torrent') return 'torrent';
  if (s.sourceType === 'hls' || isHls(s.url)) return 'hls';
  if (s.sourceType === 'mp4' || /\.(mp4|m4v|webm|mkv)($|[?#])/i.test(s.url || '')) return 'mp4';
  return 'embed';
}

/** Full normalization of a raw SourceResult from a provider */
function normalizeSource(s) {
  const type = resolveSourceType(s);

  // Resolve language
  let langCode = s.audioLanguage;
  let langName = s.language;
  let isDub = false;

  if (!langCode || langCode === 'und') {
    const inferred = inferLanguage(s);
    langCode = inferred.code;
    langName = langName || inferred.name;
    isDub = inferred.isDub;
  } else {
    langName = langName || LANG_LABEL_MAP[langCode] || langCode.toUpperCase();
    isDub = langCode !== 'ja' && langCode !== 'und';
  }

  const flag = LANG_FLAG_MAP[langCode] || '🌐';
  const cleanLangName = (langName || '').replace(/\s+dub$/i, '').trim();
  const isDubLabel = isDub ? ' Dub' : '';
  const languageLabel = `${flag} ${cleanLangName}${isDubLabel}`.replace(/\s+/g, ' ').trim();

  const providerName = s.providerName || s.source || 'toko';
  const providerKey = (providerName).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const server = s.server || s.source || providerKey;

  return {
    ...s,
    providerName,
    providerKey,
    server,
    audioLanguage: langCode,
    language: langName,
    languageLabel,
    isDub,
    type,
    isM3U8: type === 'hls',
    isEmbed: type === 'embed',
    isTorrent: type === 'torrent',
    // Torrent metadata — pass through with 0 defaults for display
    seeders: s.seeders ?? (type === 'torrent' ? 0 : undefined),
    leechers: s.leechers ?? (type === 'torrent' ? 0 : undefined),
    peers: s.peers ?? (type === 'torrent' ? (s.seeders ?? 0) + (s.leechers ?? 0) : undefined),
    torrentTitle: s.torrentTitle,
    fileSize: s.fileSize,
  };
}

function categorize(sources) {
  const byLanguage = {};
  const byType = {};

  for (const s of sources) {
    const langKey = s.audioLanguage || 'und';
    (byLanguage[langKey] ||= { code: langKey, label: s.language || LANG_LABEL_MAP[langKey] || langKey, flag: LANG_FLAG_MAP[langKey] || '🌐', isDub: s.isDub, sources: [] }).sources.push(s);

    const typeKey = s.type || 'embed';
    (byType[typeKey] ||= []).push(s);
  }

  return { byLanguage, byType };
}

// ── Request option parsing ────────────────────────────────────────────────────

function parseTitles(query) {
  const raw = query['titles[]'] || query.titles;
  if (!raw) return [];
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

async function optionsFromReq(req) {
  const anilistId = Number(req.query.anilistId);
  const safeAnilistId = Number.isFinite(anilistId) && anilistId > 0 ? anilistId : 0;

  // Merge caller-provided titles with AniList-fetched canonical titles
  const callerTitles = parseTitles(req.query).filter(Boolean);
  const anilistTitles = await fetchAniListTitles(safeAnilistId);

  // Deduplicate: AniList titles first (most canonical), then caller titles
  const seen = new Set(anilistTitles.map(t => t.toLowerCase()));
  const extraTitles = callerTitles.filter(t => t && !seen.has(t.toLowerCase()));
  const titles = [...anilistTitles, ...extraTitles];

  const providerOptions = { timeoutMs: 15_000 };
  for (const key of ['maxConcurrency', 'maxRetries', 'retryDelayMs', 'timeoutMs']) {
    const raw = req.query[key];
    if (raw == null || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) providerOptions[key] = value;
  }

  return {
    anilistId: safeAnilistId,
    titles,
    episode: req.query.episode ? Number(req.query.episode) : 1,
    resolution: String(req.query.resolution || '1080p'),
    preferredLanguage: req.query.preferredLanguage ? String(req.query.preferredLanguage) : undefined,
    preferredLanguages: req.query.preferredLanguages
      ? String(req.query.preferredLanguages).split(',')
      : undefined,
    ...(Object.keys(providerOptions).length ? { providerOptions } : {}),
  };
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

function startSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

function sseEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function buildFinalResponse(allSources, providerStatus, cached) {
  const normalized = allSources.map(normalizeSource);
  const { byLanguage, byType } = categorize(normalized);
  return {
    sources: normalized,
    byLanguage,
    byType,
    providerStatus,
    count: normalized.length,
    cached,
    fetchedAt: new Date().toISOString(),
  };
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/v3/health', (_req, res) => {
  res.json({ ok: true, service: 'toko-api', toko: !!getToko(), cacheSize: cache.size });
});

// ── Generic progressive handler ───────────────────────────────────────────────

/**
 * @param {string} mode  'stream' | 'torrent' | 'sources'
 */
async function handleSourceRequest(req, res, mode) {
  const t = getToko();
  const empty = { sources: [], byLanguage: {}, byType: {}, providerStatus: [], count: 0, cached: false, fetchedAt: new Date().toISOString() };

  if (!t) return res.json(empty);

  const opts = await optionsFromReq(req);
  const useSSE = req.query.stream !== '0';
  const key = cacheKey(mode, opts);

  // Cache hit?
  const hit = cacheGet(key);
  if (hit) {
    hit.cached = true;
    if (useSSE) {
      startSSE(res);
      // Emit all sources as a single chunk so SSE clients work the same way
      for (const source of hit.sources) {
        sseEvent(res, 'source', normalizeSource(source));
      }
      sseEvent(res, 'done', { totalCount: hit.count, cached: true });
      return res.end();
    }
    return res.json(hit);
  }

  const allSources = [];
  const providerStatus = [];

  function onChunk(chunk) {
    providerStatus.push(chunk.diagnostic);
    for (const s of chunk.results) {
      allSources.push(s);
      if (useSSE) {
        sseEvent(res, 'source', normalizeSource(s));
      }
    }
    if (useSSE) {
      sseEvent(res, 'provider_status', chunk.diagnostic);
    }
  }

  if (useSSE) startSSE(res);

  try {
    if (mode === 'stream' && typeof t.streamAll === 'function') {
      await t.streamAll(opts, onChunk);
    } else if (mode === 'torrent' && typeof t.torrentAll === 'function') {
      await t.torrentAll(opts, onChunk);
    } else if (mode === 'sources' && typeof t.sourcesAll === 'function') {
      await t.sourcesAll(opts, onChunk);
    } else {
      // Fallback to non-progressive single call
      const raw = mode === 'torrent'
        ? (await t.batch(opts)).filter(s => s.sourceType === 'torrent')
        : mode === 'stream'
          ? await t.single(opts)
          : await t.batch(opts);
      for (const s of raw) allSources.push(s);
    }
  } catch (err) {
    console.error(`[toko/${mode}]`, err.message);
    if (useSSE) {
      sseEvent(res, 'error', { message: err.message });
      return res.end();
    }
    return res.status(502).json({ ...empty, error: err.message });
  }

  const ttl = mode === 'torrent' ? TORRENT_TTL_MS : STREAM_TTL_MS;
  const result = buildFinalResponse(allSources, providerStatus, false);
  cacheSet(key, result, ttl);

  if (useSSE) {
    sseEvent(res, 'done', { totalCount: result.count, cached: false });
    return res.end();
  }

  return res.json(result);
}

// ── Routes ────────────────────────────────────────────────────────────────────

/** GET /api/v3/toko/stream — stream sources only */
app.get('/api/v3/toko/stream', async (req, res) => {
  try { await handleSourceRequest(req, res, 'stream'); }
  catch (err) { res.status(502).json({ error: err.message }); }
});

/** GET /api/v3/toko/torrent — torrent sources only */
app.get('/api/v3/toko/torrent', async (req, res) => {
  try { await handleSourceRequest(req, res, 'torrent'); }
  catch (err) { res.status(502).json({ error: err.message }); }
});

/** GET /api/v3/toko/sources — both streams + torrents */
app.get('/api/v3/toko/sources', async (req, res) => {
  try { await handleSourceRequest(req, res, 'sources'); }
  catch (err) { res.status(502).json({ error: err.message }); }
});

/** GET /api/v3/toko/debug — raw diagnostics per provider */
app.get('/api/v3/toko/debug', async (req, res) => {
  const t = getToko();
  if (!t) return res.json({ results: [], diagnostics: [] });
  try {
    const opts = await optionsFromReq(req);
    const result = typeof t.debugBatch === 'function'
      ? await t.debugBatch(opts)
      : { results: await t.batch(opts), diagnostics: [] };
    res.json({
      ...result,
      results: result.results.map(normalizeSource),
    });
  } catch (err) {
    res.status(502).json({ results: [], diagnostics: [], error: err.message });
  }
});

app.get('/api/v3/toko/languages', async (req, res) => {
  const t = getToko();
  if (!t || typeof t.getLanguages !== 'function') return res.json({ languages: [] });
  try {
    const opts = await optionsFromReq(req);
    res.json({ languages: (await t.getLanguages(opts)) || [] });
  } catch (err) {
    res.status(502).json({ languages: [], error: err.message });
  }
});

// Episode index — delegate to the bundle when available.
app.get('/api/v3/toko/index/episodes', async (req, res) => {
  const t = getToko();
  const opts = await optionsFromReq(req);
  try {
    if (t && typeof t.getWebsiteEpisodeIndex === 'function') {
      const idx = await t.getWebsiteEpisodeIndex({ anilistId: opts.anilistId, titles: opts.titles });
      if (idx && idx.episodeCount > 0) return res.json(idx);
    }
  } catch { /* fall through */ }
  res.json({ provider: null, episodeCount: 0, episodes: [] });
});

app.get('/api/v3/toko/index/chapters', (_req, res) => {
  res.json({ provider: null, chapterCount: 0, chapters: [] });
});

// Cache management
app.delete('/api/v3/toko/cache', (_req, res) => {
  const size = cache.size;
  cache.clear();
  anilistTitleCache.clear();
  res.json({ cleared: size });
});

app.get('/api/v3/toko/cache/stats', (_req, res) => {
  res.json({ size: cache.size, maxSize: MAX_CACHE_SIZE });
});

// Hot-reload the bundle without restarting the server
app.post('/api/v3/toko/reload', (_req, res) => {
  try {
    const prev = toko;
    toko = null; // force re-load
    cache.clear();
    anilistTitleCache.clear();
    const next = getToko();
    if (!next) {
      toko = prev; // revert on failure
      return res.status(500).json({ ok: false, error: 'Bundle reload failed — check logs' });
    }
    console.log('[toko-api] bundle reloaded');
    return res.json({ ok: true, reloaded: true, cacheCleared: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.use('/api/v3', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, HOST, () => {
  console.log(`[toko-api] listening on http://${HOST}:${PORT}/api/v3`);
  console.log(`[toko-api] endpoints: /stream  /torrent  /sources  /debug  /health`);
  getToko();
});

export { app };
