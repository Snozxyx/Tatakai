/**
 * Tatakai local API server.
 *
 * Wraps the Toko extension bundle and exposes the routes the Tatakai app
 * already calls (/api/v3/toko/preview, /toko/index/episodes, ...). In dev the
 * Vite dev server proxies /api/v3 to http://localhost:4001.
 *
 * Run with:  npm --prefix TatakaiAPI run dev
 */
import express from 'express';
import cors from 'cors';
import { loadToko } from './load-toko.js';

const PORT = Number(process.env.PORT || process.env.TATAKAI_API_PORT || 4001);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Lazy-load the Toko bundle so the server starts even before it's built.
let toko = null;
function getToko() {
  if (!toko) {
    try {
      toko = loadToko();
      console.log(`[tatakai-api] Toko bundle loaded (${toko.constructor?.name || 'bundle'})`);
    } catch (err) {
      console.error('[tatakai-api] Failed to load Toko bundle:', err.message);
    }
  }
  return toko;
}

// Parse `titles[]=...` / `titles=...` query params into a string[].
function parseTitles(query) {
  const raw = query['titles[]'] || query.titles;
  if (!raw) return [];
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

function buildOptions(req) {
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

// ── Health ────────────────────────────────────────────────────────────────
app.get('/api/v3/health', (_req, res) => {
  res.json({ ok: true, service: 'tatakai-api', toko: !!getToko() });
});

// ── Preview (hover scrub) ────────────────────────────────────────────────
// Returns a single best playable source (or null).
app.get('/api/v3/toko/preview', async (req, res) => {
  const NULL = { provider: null, streamUrl: null, isHls: false, previewTimestampSec: 0 };
  const t = getToko();
  if (!t) return res.json(NULL);

  const opts = buildOptions(req);
  try {
    const sources = await t.single(opts);
    const best = (sources || []).find(s => s && s.url && s.sourceType !== 'torrent');
    if (!best) return res.json(NULL);

    res.json({
      provider: best.source || best.providerName || 'toko',
      streamUrl: best.url,
      isHls: isHls(best.url) || best.sourceType === 'hls',
      previewTimestampSec: 0,
      streamHeaders: best.headers || undefined,
      language: best.language || undefined,
      audioLanguage: best.audioLanguage || undefined,
    });
  } catch (err) {
    console.error('[toko/preview] error:', err.message);
    res.status(502).json({ ...NULL, error: err.message });
  }
});

// ── Full single-episode resolve ──────────────────────────────────────────
// Returns every source from every provider, categorized by language. The
// Watch page uses this to build its server list.
app.get('/api/v3/toko/sources', async (req, res) => {
  const t = getToko();
  if (!t) return res.json({ sources: [], languages: [] });
  const opts = buildOptions(req);

  try {
    const sources = (await t.single(opts)) || [];
    // Group by audioLanguage for easy UI consumption.
    const byLanguage = {};
    for (const s of sources) {
      const key = (s.audioLanguage || s.language || 'und').toLowerCase();
      (byLanguage[key] ||= []).push(s);
    }
    res.json({
      sources: sources.map(s => ({
        ...s,
        isM3U8: isHls(s.url) || s.sourceType === 'hls',
        isEmbed: s.sourceType === 'custom' && !isHls(s.url),
        providerName: s.providerName || s.source,
        providerKey: s.providerKey || s.source,
        server: s.server || s.source,
      })),
      languages: Object.keys(byLanguage),
      byLanguage,
      count: sources.length,
    });
  } catch (err) {
    console.error('[toko/sources] error:', err.message);
    res.status(502).json({ sources: [], languages: [], error: err.message });
  }
});

// ── Website episode index ────────────────────────────────────────────────
app.get('/api/v3/toko/index/episodes', async (req, res) => {
  // Delegate to the bundle if it implements website indexing; otherwise
  // return the null result the app expects for desktop/extension mode.
  const t = getToko();
  const opts = buildOptions(req);
  try {
    if (t && typeof t.getWebsiteEpisodeIndex === 'function') {
      const idx = await t.getWebsiteEpisodeIndex({
        anilistId: opts.anilistId,
        titles: opts.titles,
      });
      if (idx && idx.episodeCount > 0) return res.json(idx);
    }
  } catch { /* fall through */ }
  res.json({ provider: null, episodeCount: 0, episodes: [] });
});

app.get('/api/v3/toko/index/chapters', async (_req, res) => {
  res.json({ provider: null, chapterCount: 0, chapters: [] });
});

// ── Language capabilities ────────────────────────────────────────────────
app.get('/api/v3/toko/languages', async (req, res) => {
  const t = getToko();
  if (!t || typeof t.getLanguages !== 'function') return res.json({ languages: [] });
  try {
    const languages = await t.getLanguages(buildOptions(req));
    res.json({ languages: languages || [] });
  } catch (err) {
    res.status(502).json({ languages: [], error: err.message });
  }
});

// ── 404 ──────────────────────────────────────────────────────────────────
app.use('/api/v3', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[tatakai-api] listening on http://127.0.0.1:${PORT}/api/v3`);
  getToko();
});

export { app };
