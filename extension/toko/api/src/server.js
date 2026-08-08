/**
 * Toko in API form.
 *
 * This is the Toko bundle itself exposed over HTTP — there is no separate
 * "TatakaiAPI" wrapper. It runs inside the Tatakai app (spawned by the
 * desktop runtime / `npm run dev:toko-api`) and serves the routes the app
 * already calls on http://127.0.0.1:4001/api/v3/toko/*.
 *
 * Providers use `fetch` + `cheerio` directly (via `src/utils/http.ts`); no
 * `__tatakai_fetch__` / `__tatakai_parse_html__` sandbox globals are needed
 * to run here.
 */
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const PORT = Number(process.env.PORT || process.env.TOKO_API_PORT || 4001);
const HOST = process.env.TOKO_API_HOST || '127.0.0.1';

// The compiled Toko bundle is CommonJS but lives in an ESM package
// ("type": "module"). Stage a .cjs copy so Node loads it correctly.
const TOKO_BUNDLE_SRC = path.resolve(__dirname, '../../dist/bundle.js');
const TOKO_BUNDLE = path.join(os.tmpdir(), 'toko-api-bundle.cjs');

function loadBundle() {
  if (!existsSync(TOKO_BUNDLE_SRC)) {
    throw new Error(
      `Toko bundle not found at ${TOKO_BUNDLE_SRC}. Run: npm --prefix extension/toko run build`,
    );
  }
  mkdirSync(path.dirname(TOKO_BUNDLE), { recursive: true });
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

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

function parseTitles(query) {
  const raw = query['titles[]'] || query.titles;
  if (!raw) return [];
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

function optionsFromReq(req) {
  const anilistId = Number(req.query.anilistId);
  return {
    anilistId: Number.isFinite(anilistId) ? anilistId : 0,
    titles: parseTitles(req.query),
    episode: req.query.episode ? Number(req.query.episode) : 1,
    resolution: String(req.query.resolution || '1080p'),
    preferredLanguage: req.query.preferredLanguage ? String(req.query.preferredLanguage) : undefined,
    preferredLanguages: req.query.preferredLanguages
      ? String(req.query.preferredLanguages).split(',')
      : undefined,
  };
}

const isHls = (url) => /\.m3u8($|[?#/])/i.test(String(url || ''));

/** Normalize a Toko SourceResult into the shape the Watch page consumes. */
function normalizeSource(s) {
  const sourceType = s.sourceType || (isHls(s.url) ? 'hls' : 'custom');
  return {
    ...s,
    providerName: s.providerName || s.source || 'toko',
    providerKey: s.providerKey || s.source || 'toko',
    server: s.server || s.source || 'toko',
    isM3U8: sourceType === 'hls' || isHls(s.url),
    isEmbed: sourceType === 'custom' && !isHls(s.url),
    language: s.language || labelForCode(s.audioLanguage),
  };
}

function labelForCode(code) {
  const map = {
    ja: 'Japanese', en: 'English', ar: 'Arabic', fr: 'French', de: 'German',
    pl: 'Polish', zh: 'Chinese', es: 'Spanish', pt: 'Portuguese', it: 'Italian',
    ko: 'Korean', hi: 'Hindi', ta: 'Tamil', te: 'Telugu',
  };
  return map[String(code || '').toLowerCase()] || (code ? String(code).toUpperCase() : 'Unknown');
}

app.get('/api/v3/health', (_req, res) => {
  res.json({ ok: true, service: 'toko-api', toko: !!getToko() });
});

// Single best source for hover preview.
app.get('/api/v3/toko/preview', async (req, res) => {
  const NULL = { provider: null, streamUrl: null, isHls: false, previewTimestampSec: 0 };
  const t = getToko();
  if (!t) return res.json(NULL);
  try {
    const sources = (await t.single(optionsFromReq(req))) || [];
    const best = sources.find((s) => s && s.url && s.sourceType !== 'torrent');
    if (!best) return res.json(NULL);
    res.json({
      provider: best.source || 'toko',
      streamUrl: best.url,
      isHls: isHls(best.url) || best.sourceType === 'hls',
      previewTimestampSec: 0,
      streamHeaders: best.headers,
      language: best.language,
      audioLanguage: best.audioLanguage,
    });
  } catch (err) {
    console.error('[toko/preview]', err.message);
    res.status(502).json({ ...NULL, error: err.message });
  }
});

// Full source list — used by the Watch page to build servers + language tabs.
app.get('/api/v3/toko/sources', async (req, res) => {
  const t = getToko();
  if (!t) return res.json({ sources: [], languages: [], count: 0 });
  try {
    const raw = (await t.single(optionsFromReq(req))) || [];
    const sources = raw.map(normalizeSource);
    const byLanguage = {};
    for (const s of sources) {
      const key = (s.audioLanguage || s.language || 'und').toLowerCase();
      (byLanguage[key] ||= []).push(s);
    }
    res.json({
      sources,
      languages: Object.keys(byLanguage),
      byLanguage,
      count: sources.length,
    });
  } catch (err) {
    console.error('[toko/sources]', err.message);
    res.status(502).json({ sources: [], languages: [], error: err.message });
  }
});

app.get('/api/v3/toko/languages', async (req, res) => {
  const t = getToko();
  if (!t || typeof t.getLanguages !== 'function') return res.json({ languages: [] });
  try {
    res.json({ languages: (await t.getLanguages(optionsFromReq(req))) || [] });
  } catch (err) {
    res.status(502).json({ languages: [], error: err.message });
  }
});

// Episode index — delegate to the bundle when available.
app.get('/api/v3/toko/index/episodes', async (req, res) => {
  const t = getToko();
  const opts = optionsFromReq(req);
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

app.use('/api/v3', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, HOST, () => {
  console.log(`[toko-api] listening on http://${HOST}:${PORT}/api/v3`);
  getToko();
});

export { app };
