'use strict';

/**
 * Generic Extension-API Host — request handler + porting layer
 * ------------------------------------------------------------------------------
 * App-owned, in-process HTTP request handler that serves the standard
 * "streaming-sources-v3" contract for ANY installed extension whose manifest
 * declares an `apiServer` block:
 *
 *   "apiServer": {
 *     "namespace": "toko",
 *     "contract": "streaming-sources-v3",
 *     "routes": ["sources", "stream", "torrent"],
 *     "healthPath": "/health"
 *   }
 *
 * For a namespace `<ns>` it mounts:
 *   GET /api/v3/<ns>/sources    — streams + torrents (SSE by default, ?stream=0 → JSON)
 *   GET /api/v3/<ns>/stream     — stream sources only
 *   GET /api/v3/<ns>/torrent    — torrent sources only
 *   GET /api/v3/<ns>/health     — per-namespace health
 *   GET /health                 — host health + mounted namespaces
 *
 * The bundle contract is `sourcesAll/streamAll/torrentAll(opts, onChunk)` where
 * `onChunk` receives `{ results, diagnostic }` per provider — enabling true
 * progressive per-provider SSE.
 *
 * `normalizeSource`, `inferLanguage`, the language maps, the SSE framing and the
 * `optionsFromQuery` parsing are ported from `extension/toko/api/src/server.js`
 * (the reference implementation), adapted from Express req/res + ESM to Node's
 * built-in `http` req/res + CJS.
 *
 * TRUST: in-process `require(bundle.js)` bypasses the worker-thread sandbox, so
 * only first-party / `sideloaded` extensions are allowed to declare `apiServer`.
 * Non-sideloaded declarations are logged and skipped.
 */

const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { URL } = require('node:url');

// ── Language helpers (ported verbatim from server.js) ──────────────────────────

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
 */
const PROVIDER_DEFAULT_LANG = {
    desidub: { code: 'hi', name: 'Hindi', isDub: true },
    aniworld: { code: 'de', name: 'German', isDub: true },
    animepahe: { code: 'ja', name: 'Japanese', isDub: false },
    toonstream: { code: 'en', name: 'English', isDub: true },
    fouranime: { code: 'en', name: 'English', isDub: true },
    nyaa: { code: 'ja', name: 'Japanese', isDub: false },
    acgrip: { code: 'ja', name: 'Japanese', isDub: false },
    animetosho: { code: 'ja', name: 'Japanese', isDub: false },
    subplease: { code: 'ja', name: 'Japanese', isDub: false },
    seadex: { code: 'ja', name: 'Japanese', isDub: false },
};

function inferLanguage(source) {
    const providerKey = (source.providerName || source.source || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (PROVIDER_DEFAULT_LANG[providerKey]) return PROVIDER_DEFAULT_LANG[providerKey];

    const srcLower = (source.source || '').toLowerCase();
    if (/\bdub\b/.test(srcLower)) return { code: 'en', name: 'English', isDub: true };
    if (/\bsub\b/.test(srcLower)) return { code: 'ja', name: 'Japanese', isDub: false };
    if (/\bhindi\b/.test(srcLower)) return { code: 'hi', name: 'Hindi', isDub: true };
    if (/\btamil\b/.test(srcLower)) return { code: 'ta', name: 'Tamil', isDub: true };
    if (/\btelugu\b/.test(srcLower)) return { code: 'te', name: 'Telugu', isDub: true };
    if (/\bkannada\b/.test(srcLower)) return { code: 'kn', name: 'Kannada', isDub: true };
    if (/\bmalayalam\b/.test(srcLower)) return { code: 'ml', name: 'Malayalam', isDub: true };
    if (/\bbengali\b/.test(srcLower)) return { code: 'bn', name: 'Bengali', isDub: true };
    if (/\bmarathi\b/.test(srcLower)) return { code: 'mr', name: 'Marathi', isDub: true };
    if (/\barabic\b/.test(srcLower)) return { code: 'ar', name: 'Arabic', isDub: true };
    if (/\bfrench\b/.test(srcLower)) return { code: 'fr', name: 'French', isDub: true };
    if (/\bgerman\b/.test(srcLower)) return { code: 'de', name: 'German', isDub: true };

    const urlLower = (source.url || '').toLowerCase();
    if (/\/hindi\/|[_-]hindi[_-]/.test(urlLower)) return { code: 'hi', name: 'Hindi', isDub: true };
    if (/\/tamil\/|[_-]tamil[_-]/.test(urlLower)) return { code: 'ta', name: 'Tamil', isDub: true };
    if (/\/telugu\/|[_-]telugu[_-]/.test(urlLower)) return { code: 'te', name: 'Telugu', isDub: true };
    if (/\/kannada\/|[_-]kannada[_-]/.test(urlLower)) return { code: 'kn', name: 'Kannada', isDub: true };
    if (/\/malayalam\/|[_-]malayalam[_-]/.test(urlLower)) return { code: 'ml', name: 'Malayalam', isDub: true };
    if (/\/arabic\/|[_-]arabic[_-]/.test(urlLower)) return { code: 'ar', name: 'Arabic', isDub: true };
    if (/\/french\/|[_-]french[_-]/.test(urlLower)) return { code: 'fr', name: 'French', isDub: true };
    if (/\/german\/|[_-]german[_-]/.test(urlLower)) return { code: 'de', name: 'German', isDub: true };

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

/** Full normalization of a raw SourceResult from a provider. */
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

    const providerName = s.providerName || s.source || 'extension';
    const providerKey = (providerName).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const server = s.server || s.source || providerKey;
    const fileFormat = s.fileFormat
        || (type === 'hls' ? 'm3u8' : type === 'mp4' ? 'mp4' : type === 'torrent' ? 'torrent' : 'embed');

    return {
        ...s,
        providerName,
        providerKey,
        server,
        // The extension's own ranking of which server should play — see
        // `providerPriorityOf` in extension/toko/src/providers/registry.ts. It is
        // stamped there rather than derived here because only the extension knows
        // its registry order; the host just relays it. Absent (an extension that
        // does not rank its providers) sorts after everything that does.
        providerPriority: Number.isFinite(s.providerPriority)
            ? Number(s.providerPriority)
            : Number.MAX_SAFE_INTEGER,
        audioLanguage: langCode,
        language: langName,
        languageLabel,
        isDub,
        type,
        sourceType: type,
        fileFormat,
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

// ── AniList title pre-fetch (ported from server.js) ────────────────────────────

const anilistTitleCache = new Map(); // anilistId → { titles, expiresAt }
const ANILIST_TITLE_TTL = 60 * 60 * 1000; // 1 hour

// AniList lists a show's synonyms mostly as *localized* titles — Korean, Thai,
// Italian, Indonesian. None of those match the English/Japanese catalogues these
// providers index, and every extra title is another HTTP request for the
// providers that iterate all of them (`animelok`, `animeblkom`, `nekobt`,
// `animetosho`). Measured on 196218: passing all 6 synonyms took nekobt from 4
// results to 10 — but pushed animetosho from `empty` into a 20s *timeout*. So
// keep only the Latin-script ones and cap them at 2: that retains the useful
// alternate English release names and bounds the added fan-out.
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

async function fetchAniListTitles(anilistId, logger) {
    if (!anilistId || anilistId <= 0) return [];
    if (typeof fetch !== 'function') return []; // Node < 18 / fetch unavailable

    const cached = anilistTitleCache.get(anilistId);
    if (cached && Date.now() < cached.expiresAt) return cached.titles;

    try {
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                // `synonyms` matters as much as the canonical titles here. Most
                // providers resolve an episode by searching their own catalogue by
                // name, and plenty of sites index a show under an alternate title
                // only. See `usefulSynonyms` for why the list is filtered hard.
                query: `query ($id: Int) { Media(id: $id, type: ANIME) { title { english romaji userPreferred native } synonyms } }`,
                variables: { id: anilistId },
            }),
            signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(5000) : undefined,
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
    } catch (err) {
        logger?.warn?.(`[ExtHost] AniList title fetch failed for ${anilistId}: ${err.message}`);
        return [];
    }
}

// ── Result cache ───────────────────────────────────────────────────────────────

/**
 * In-memory LRU of resolved sources, keyed by what actually determines the
 * result set. Without it, every mount of the watch page re-ran all ~24
 * providers, so simply refreshing the player spent 20s re-scraping to arrive at
 * the same list — the single most expensive thing the app did.
 *
 * What is cached is the *normalized* source plus the provider's raw headers,
 * deliberately NOT the proxied URL: a local-proxy token is only valid for 15
 * minutes, so replaying a stored token would hand the player a dead URL. Tokens
 * are re-minted from the raw headers on every serve, cached or not.
 */
const STREAM_TTL_MS = 10 * 60 * 1000;
const TORRENT_TTL_MS = 30 * 60 * 1000;
// Chapter lists change rarely and are expensive (AniList + per-provider search +
// list), so they cache longer. Only the flat chapter rows are cached — pages
// carry proxy tokens and are re-minted per request, so they are never cached.
const MANGA_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_SIZE = 200;

const resultCache = new Map(); // key → { entries, providerStatus, expiresAt }

function cacheKey(mode, opts) {
    return [
        mode,
        opts.anilistId,
        opts.episode,
        opts.resolution,
        (opts.preferredLanguages || []).join(','),
        opts.preferredLanguage || '',
    ].join(':');
}

function cacheGet(key) {
    const entry = resultCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        resultCache.delete(key);
        return null;
    }
    // Re-insert so Map iteration order stays least-recently-used first.
    resultCache.delete(key);
    resultCache.set(key, entry);
    return entry;
}

function cacheSet(key, value, ttlMs) {
    if (resultCache.size >= MAX_CACHE_SIZE) {
        const oldest = resultCache.keys().next().value;
        resultCache.delete(oldest);
    }
    resultCache.set(key, { ...value, expiresAt: Date.now() + ttlMs });
}

// ── Request option parsing (ported from optionsFromReq) ────────────────────────

function parseTitles(searchParams) {
    const raw = searchParams.getAll('titles[]').concat(searchParams.getAll('titles'));
    return raw.map(String).filter(Boolean);
}

async function optionsFromQuery(searchParams, logger) {
    const anilistId = Number(searchParams.get('anilistId'));
    const safeAnilistId = Number.isFinite(anilistId) && anilistId > 0 ? anilistId : 0;

    // Merge caller-provided titles with AniList-fetched canonical titles
    const callerTitles = parseTitles(searchParams);
    const anilistTitles = await fetchAniListTitles(safeAnilistId, logger);

    const seen = new Set(anilistTitles.map((t) => t.toLowerCase()));
    const extraTitles = callerTitles.filter((t) => t && !seen.has(t.toLowerCase()));
    const titles = [...anilistTitles, ...extraTitles];

    // Slow indexers (nyaa in particular) regularly need >15s for their first
    // attempt. Because results stream per-provider, a higher ceiling costs no
    // perceived latency — only the terminal `done` event waits for the slowest.
    // Overridable per request; clamped to 30s inside the bundle.
    const providerOptions = { timeoutMs: 20_000 };
    for (const key of ['maxConcurrency', 'maxRetries', 'retryDelayMs', 'timeoutMs']) {
        const raw = searchParams.get(key);
        if (raw == null || raw === '') continue;
        const value = Number(raw);
        if (Number.isFinite(value)) providerOptions[key] = value;
    }

    const preferredLanguages = searchParams.get('preferredLanguages');
    return {
        anilistId: safeAnilistId,
        titles,
        episode: searchParams.get('episode') ? Number(searchParams.get('episode')) : 1,
        resolution: String(searchParams.get('resolution') || '1080p'),
        preferredLanguage: searchParams.get('preferredLanguage') || undefined,
        preferredLanguages: preferredLanguages ? preferredLanguages.split(',') : undefined,
        ...(Object.keys(providerOptions).length ? { providerOptions } : {}),
    };
}

// ── Manga request parsing & flattening ─────────────────────────────────────────

/**
 * Parse `MangaChapterParams` from the query string. Unlike anime sources, manga
 * providers accept an explicit `title`/`titles[]` (deterministic MangaDex
 * mapping ignores them; fuzzy providers like AllManga rely on them). No AniList
 * pre-fetch here — the bundle's `enrichMangaParams` does that once internally.
 */
function mangaParamsFromQuery(searchParams) {
    const anilistId = Number(searchParams.get('anilistId'));
    const malId = Number(searchParams.get('malId'));
    const titles = parseTitles(searchParams);
    const title = searchParams.get('title') || undefined;
    return {
        ...(Number.isFinite(anilistId) && anilistId > 0 ? { anilistId } : {}),
        ...(Number.isFinite(malId) && malId > 0 ? { malId } : {}),
        ...(title ? { title } : {}),
        ...(titles.length ? { titles } : {}),
    };
}

/**
 * Flatten nested `MangaChapterEntry[]` (one entry per chapter number, each with
 * N provider sources) into the flat rows the app's manga runtime consumes: one
 * row per (chapter, source). The `provider` field is the SUB-PROVIDER name
 * (e.g. `mangadex`, `allmanga`) — the same value that flows through the reader
 * URL and back into `manga/pages`.
 */
function flattenMangaChapters(entries) {
    const rows = [];
    for (const ch of Array.isArray(entries) ? entries : []) {
        const sources = Array.isArray(ch?.sources) ? ch.sources : [];
        for (const src of sources) {
            rows.push({
                number: ch.number,
                title: ch.title ?? null,
                volume: ch.volume ?? null,
                provider: src.provider,
                chapterKey: src.chapterKey,
                providerChapterId: src.providerChapterId ?? null,
                language: src.language ?? null,
                scanlator: src.scanlator ?? null,
                releaseDate: src.releaseDate ?? null,
            });
        }
    }
    return rows;
}

// ── SSE helpers (ported from server.js) ────────────────────────────────────────

function startSSE(res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
    });
    res.flushHeaders?.();
}

function sseEvent(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

/**
 * Probe settings. The UA is a real browser one because embed hosts routinely
 * serve a challenge page to anything that looks automated, which would make a
 * live host read as dead. The timeout is short — a probe runs while the user is
 * already waiting on the player, so a slow answer is as good as a failure.
 */
const PROBE_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const PROBE_TIMEOUT_MS = 8000;

function nowISO() {
    return new Date().toISOString();
}

// ── Bundle loader (ported from server.js loadBundle) ───────────────────────────

/**
 * Loads an extension bundle via CJS `require()`. The esbuild bundle is CJS
 * (`"use strict"; __commonJS(...)`), so we copy it to a uniquely-named `.cjs`
 * file in tmp on each fresh load — this forces CJS interpretation regardless of
 * the nearest package.json and sidesteps Node's require cache when invalidated.
 * Instances are cached per bundlePath; call `invalidate()` to force reload.
 */
function createBundleLoader(logger) {
    const cache = new Map(); // bundlePath → instance
    const tmpDir = path.join(os.tmpdir(), 'tatakai-extension-api-host');
    let counter = 0;

    function load(bundlePath) {
        if (cache.has(bundlePath)) return cache.get(bundlePath);
        if (!fs.existsSync(bundlePath)) {
            throw new Error(`Extension bundle not found at ${bundlePath}`);
        }
        fs.mkdirSync(tmpDir, { recursive: true });
        counter++;
        const tmp = path.join(tmpDir, `bundle-${counter}.cjs`);
        fs.copyFileSync(bundlePath, tmp);

        const mod = require(tmp);
        const Bundle = mod.default || mod;
        const instance = typeof Bundle === 'function' ? new Bundle() : Bundle;
        const hasProgressive = instance
            && (typeof instance.sourcesAll === 'function'
                || typeof instance.streamAll === 'function'
                || typeof instance.torrentAll === 'function');
        const hasOneShot = instance
            && (typeof instance.batch === 'function' || typeof instance.single === 'function');
        // A manga-only extension implements neither streaming contract — it still
        // loads, so long as it answers the manga contract.
        const hasManga = instance
            && (typeof instance.getMangaChapters === 'function'
                || typeof instance.getMangaPages === 'function');
        // A custom-source extension (custom-source-v1) exposes customHome plus at
        // least one of customWatch/customRead. It may implement none of the above.
        const hasCustomSource = instance
            && typeof instance.customHome === 'function'
            && (typeof instance.customWatch === 'function'
                || typeof instance.customRead === 'function');
        if (!hasProgressive && !hasOneShot && !hasManga && !hasCustomSource) {
            throw new Error('Extension bundle does not expose sourcesAll/streamAll/torrentAll, batch/single, getMangaChapters/getMangaPages, or customHome + customWatch/customRead');
        }
        cache.set(bundlePath, instance);
        logger?.info?.(`[ExtHost] bundle loaded (${instance.constructor?.name || 'bundle'}) from ${bundlePath}`);
        return instance;
    }

    return {
        load,
        invalidate() { cache.clear(); },
    };
}

// ── Proxy application ──────────────────────────────────────────────────────────

/**
 * Route a direct media URL through the in-app LocalProxyServer so custom
 * request headers (Referer/Origin/etc.) and Cloudflare bypass apply during
 * playback. Only HLS/MP4 direct media is proxied — embeds load in a webview
 * (proxying would break the iframe) and torrents go to the torrent engine.
 * `registerSource` is synchronous and requires the proxy to be started first
 * (the supervisor calls `ensureProxy()` before listening).
 *
 * Subtitle tracks go through the same proxy, and for the same reason: the CDNs
 * that serve them validate Referer exactly like the video CDNs do. Measured on
 * `cdn.watching.onl` (Nebula's track host): 403 with no Referer, 403 with
 * `https://justanime.to/`, 200 with the `https://megaplay.buzz/` Referer the API
 * hands back in the source's own headers. The renderer fetches `.vtt` files
 * itself and cannot spoof Referer, so an unproxied track is always a 403 and
 * subtitles silently never appear. Unlike the video URL this is not gated on
 * `type`: any source that carries both headers and tracks needs it.
 */
function applyProxy(normalized, rawHeaders, localProxy, logger) {
    const hasHeaders = rawHeaders && typeof rawHeaders === 'object' && Object.keys(rawHeaders).length > 0;
    const canRegister = hasHeaders && localProxy && typeof localProxy.registerSource === 'function';
    if (!canRegister) return normalized;

    let out = normalized;

    const tracks = Array.isArray(normalized.subtitles) ? normalized.subtitles : null;
    if (tracks && tracks.length) {
        out = {
            ...out,
            subtitles: tracks.map((track) => {
                const raw = String(track?.url || track?.file || '');
                if (!/^https?:\/\//i.test(raw)) return track;
                try {
                    return { ...track, url: localProxy.registerSource({ url: raw, headers: rawHeaders }), originalUrl: raw };
                } catch {
                    return track;
                }
            }),
        };
    }

    const url = String(normalized.url || '');
    const type = normalized.type;
    if (!((type === 'hls' || type === 'mp4') && /^https?:\/\//i.test(url))) return out;
    try {
        const proxyUrl = localProxy.registerSource({ url, headers: rawHeaders });
        return { ...out, url: proxyUrl, originalUrl: url };
    } catch (err) {
        logger?.warn?.(`[ExtHost] proxy registration failed: ${err.message}`);
        return out;
    }
}

// ── Host app factory ───────────────────────────────────────────────────────────

/**
 * One line per provider, so "which provider returned how much" is answerable
 * from the log without a debugger. Status is carried through from the bundle's
 * diagnostic (`ok` / `empty` / `error` / `timeout`), so a provider that is
 * silently returning nothing looks different from one that is timing out.
 */
function logProviderChunk(logger, namespace, mode, chunk, count) {
    const d = chunk.diagnostic || {};
    const name = chunk.provider || d.provider || 'unknown';
    const status = d.status || (count > 0 ? 'ok' : 'empty');
    const ms = Number.isFinite(d.durationMs) ? `${d.durationMs}ms` : '?ms';
    const attempts = d.attempts > 1 ? ` attempts=${d.attempts}` : '';
    const err = d.error ? ` error=${d.error}` : '';
    const line = `[ExtHost] ${namespace}/${mode} provider=${name} results=${count} status=${status} ${ms}${attempts}${err}`;
    if (status === 'error' || status === 'timeout') logger?.warn?.(line);
    else logger?.info?.(line);
}

/**
 * @param {object} deps
 * @param {object} deps.registry    ExtensionRegistry singleton
 * @param {object} deps.localProxy  LocalProxyServer singleton
 * @param {object} [deps.logger]    LogService
 * @returns {{ handler: Function, listNamespaces: Function, invalidateBundles: Function }}
 */
function createHostApp({ registry, localProxy, logger }) {
    const bundleLoader = createBundleLoader(logger);

    /** Resolve a namespace to a trusted registered extension entry, or null. */
    function findNamespaceEntry(namespace) {
        for (const id of registry.listLoaded()) {
            const entry = registry.lookup(id);
            const api = entry?.manifest?.apiServer;
            if (api && api.namespace === namespace) {
                if (entry.manifest.sideloaded !== true) {
                    logger?.warn?.(`[ExtHost] Refusing untrusted apiServer namespace '${namespace}' from ${id} (not sideloaded)`);
                    return null;
                }
                return { id, entry };
            }
        }
        return null;
    }

    /** List all mountable (trusted) namespaces for `runtime:get-api-base`. */
    function listNamespaces() {
        const out = [];
        for (const id of registry.listLoaded()) {
            const entry = registry.lookup(id);
            const api = entry?.manifest?.apiServer;
            if (api && api.namespace && entry.manifest.sideloaded === true) {
                const capabilities = Array.isArray(entry.manifest.capabilities)
                    ? entry.manifest.capabilities
                    : [];
                const customSources = Array.isArray(entry.manifest.customSources)
                    ? entry.manifest.customSources
                    : [];
                out.push({
                    namespace: api.namespace,
                    extensionId: id,
                    contract: api.contract || null,
                    routes: Array.isArray(api.routes) ? api.routes : ['sources', 'stream', 'torrent'],
                    // Always mounted for a streaming-sources-v3 bundle — see the
                    // per-provider handlers below.
                    providerRoutes: ['providers', 'providers/:name'],
                    // Surfaced so the renderer can route manga to the right
                    // extension(s) without hardcoding a name — any extension whose
                    // manifest declares "manga" answers the manga routes below.
                    capabilities,
                    // Isolated read/watch verticals + the always-mounted custom/*
                    // routes that serve them. Empty for non-custom-source bundles.
                    customSources,
                    customRoutes: customSources.length
                        ? ['custom/home', 'custom/search', 'custom/info', 'custom/watch', 'custom/read']
                        : [],
                });
            }
        }
        return out;
    }

    async function handleSourceRequest(req, res, mode, entry, searchParams) {
        let bundle;
        try {
            bundle = bundleLoader.load(entry.bundlePath);
        } catch (err) {
            logger?.warn?.(`[ExtHost] bundle load failed: ${err.message}`);
            res.writeHead(502, JSON_HEADERS);
            return res.end(JSON.stringify({ sources: [], count: 0, error: err.message }));
        }

        const opts = await optionsFromQuery(searchParams, logger);
        const useSSE = searchParams.get('stream') !== '0';
        // Only an explicit user-driven refresh should pay for a full re-scrape.
        const bypassCache = searchParams.get('refresh') === '1' || searchParams.get('nocache') === '1';
        const key = cacheKey(mode, opts);

        if (!bypassCache) {
            const hit = cacheGet(key);
            if (hit) {
                // Proxy tokens are minted fresh on every serve — the cached entry
                // holds the pre-proxy source plus the provider's raw headers, so a
                // replay 10 minutes later still yields live URLs.
                const sources = hit.entries.map(({ normalized, rawHeaders }) =>
                    applyProxy(normalized, rawHeaders, localProxy, logger));
                logger?.info?.(
                    `[ExtHost] ${entry.manifest?.apiServer?.namespace || 'ext'}/${mode} cache HIT `
                    + `key=${key} sources=${sources.length}`,
                );

                if (useSSE) {
                    startSSE(res);
                    for (const s of sources) sseEvent(res, 'source', s);
                    for (const d of hit.providerStatus) sseEvent(res, 'provider_status', d);
                    sseEvent(res, 'done', { totalCount: sources.length, cached: true });
                    return res.end();
                }

                res.writeHead(200, JSON_HEADERS);
                return res.end(JSON.stringify({
                    sources,
                    ...categorize(sources),
                    providerStatus: hit.providerStatus,
                    count: sources.length,
                    cached: true,
                    fetchedAt: nowISO(),
                }));
            }
        }

        const allSources = [];
        // Parallel to `allSources`, but pre-proxy — this is what gets cached.
        const cacheEntries = [];
        const providerStatus = [];
        let clientGone = false;
        req.on('close', () => { clientGone = true; });

        const onChunk = (chunk) => {
            if (!chunk || clientGone) return;
            if (chunk.diagnostic) providerStatus.push(chunk.diagnostic);
            const results = Array.isArray(chunk.results) ? chunk.results : [];
            for (const s of results) {
                if (!s || typeof s !== 'object') continue;
                const normalized = normalizeSource(s);
                cacheEntries.push({ normalized, rawHeaders: s.headers });
                const proxied = applyProxy(normalized, s.headers, localProxy, logger);
                allSources.push(proxied);
                if (useSSE) sseEvent(res, 'source', proxied);
            }
            logProviderChunk(logger, entry.manifest?.apiServer?.namespace || 'ext', mode, chunk, results.length);
            if (useSSE && chunk.diagnostic) sseEvent(res, 'provider_status', chunk.diagnostic);
        };

        if (useSSE) startSSE(res);

        try {
            if (mode === 'stream' && typeof bundle.streamAll === 'function') {
                await bundle.streamAll(opts, onChunk);
            } else if (mode === 'torrent' && typeof bundle.torrentAll === 'function') {
                await bundle.torrentAll(opts, onChunk);
            } else if (mode === 'sources' && typeof bundle.sourcesAll === 'function') {
                await bundle.sourcesAll(opts, onChunk);
            } else {
                // Fallback to non-progressive single/batch call
                const raw = mode === 'stream' && typeof bundle.single === 'function'
                    ? await bundle.single(opts)
                    : typeof bundle.batch === 'function'
                        ? await bundle.batch(opts)
                        : [];
                const arr = Array.isArray(raw) ? raw : [];
                const filtered = mode === 'torrent' ? arr.filter((s) => s.sourceType === 'torrent') : arr;
                onChunk({ results: filtered, diagnostic: { provider: 'fallback', status: 'ok', resultCount: filtered.length, durationMs: 0, attempts: 1 } });
            }
        } catch (err) {
            logger?.warn?.(`[ExtHost] ${mode} resolve failed: ${err.message}`);
            if (useSSE) {
                if (!clientGone) sseEvent(res, 'error', { message: err.message });
                return res.end();
            }
            res.writeHead(502, JSON_HEADERS);
            return res.end(JSON.stringify({ sources: [], count: 0, error: err.message }));
        }

        // Only cache a run that produced something and wasn't cut short — an
        // empty result usually means a transient failure, and caching it would
        // pin the failure in place for the whole TTL.
        if (allSources.length > 0 && !clientGone) {
            cacheSet(
                key,
                { entries: cacheEntries, providerStatus },
                mode === 'torrent' ? TORRENT_TTL_MS : STREAM_TTL_MS,
            );
        }

        if (useSSE) {
            if (!clientGone) sseEvent(res, 'done', { totalCount: allSources.length, cached: false });
            return res.end();
        }

        const body = {
            sources: allSources,
            ...categorize(allSources),
            providerStatus,
            count: allSources.length,
            cached: false,
            fetchedAt: nowISO(),
        };
        res.writeHead(200, JSON_HEADERS);
        return res.end(JSON.stringify(body));
    }

    /**
     * `GET /api/v3/<ns>/providers` — the provider inventory the bundle exposes.
     * Cheap (no network), so it is the first thing to hit when sources look
     * short: if a provider is missing here it was never registered.
     */
    function handleProviderList(res, entry, namespace) {
        let bundle;
        try {
            bundle = bundleLoader.load(entry.bundlePath);
        } catch (err) {
            res.writeHead(502, JSON_HEADERS);
            return res.end(JSON.stringify({ providers: [], count: 0, error: err.message }));
        }

        if (typeof bundle.listProviders !== 'function') {
            res.writeHead(501, JSON_HEADERS);
            return res.end(JSON.stringify({
                providers: [],
                count: 0,
                error: "bundle does not implement listProviders() — per-provider routes need the 'streaming-sources-v3' contract",
            }));
        }

        let providers;
        try {
            providers = bundle.listProviders();
        } catch (err) {
            res.writeHead(502, JSON_HEADERS);
            return res.end(JSON.stringify({ providers: [], count: 0, error: err.message }));
        }

        const list = Array.isArray(providers) ? providers : [];
        const byKind = list.reduce((acc, p) => {
            const kind = p?.kind || 'unknown';
            acc[kind] = (acc[kind] || 0) + 1;
            return acc;
        }, {});

        res.writeHead(200, JSON_HEADERS);
        return res.end(JSON.stringify({
            namespace,
            count: list.length,
            byKind,
            providers: list,
            fetchedAt: nowISO(),
        }));
    }

    /**
     * `GET /api/v3/<ns>/providers/<name>` — run exactly one provider.
     *
     * One provider per API call is the whole point: the response carries that
     * provider's own status, duration, attempt count and result count, so a
     * provider returning nothing is distinguishable from one erroring or timing
     * out. Always JSON (a single provider has nothing to stream progressively).
     */
    async function handleSingleProvider(req, res, entry, namespace, providerName, searchParams) {
        let bundle;
        try {
            bundle = bundleLoader.load(entry.bundlePath);
        } catch (err) {
            res.writeHead(502, JSON_HEADERS);
            return res.end(JSON.stringify({ provider: providerName, sources: [], count: 0, error: err.message }));
        }

        if (typeof bundle.runProvider !== 'function') {
            res.writeHead(501, JSON_HEADERS);
            return res.end(JSON.stringify({
                provider: providerName,
                sources: [],
                count: 0,
                error: "bundle does not implement runProvider() — per-provider routes need the 'streaming-sources-v3' contract",
            }));
        }

        const opts = await optionsFromQuery(searchParams, logger);

        let chunk;
        try {
            chunk = await bundle.runProvider(providerName, opts);
        } catch (err) {
            const unknown = /unknown provider/i.test(err.message || '');
            logger?.warn?.(`[ExtHost] ${namespace}/providers/${providerName} failed: ${err.message}`);
            res.writeHead(unknown ? 404 : 502, JSON_HEADERS);
            return res.end(JSON.stringify({ provider: providerName, sources: [], count: 0, error: err.message }));
        }

        const raw = Array.isArray(chunk?.results) ? chunk.results : [];
        const sources = raw
            .filter((s) => s && typeof s === 'object')
            .map((s) => applyProxy(normalizeSource(s), s.headers, localProxy, logger));

        logProviderChunk(logger, namespace, 'providers', chunk || { provider: providerName }, sources.length);

        res.writeHead(200, JSON_HEADERS);
        return res.end(JSON.stringify({
            provider: chunk.provider || providerName,
            kind: chunk.kind || null,
            status: chunk.diagnostic?.status || (sources.length ? 'ok' : 'empty'),
            durationMs: chunk.diagnostic?.durationMs ?? null,
            attempts: chunk.diagnostic?.attempts ?? null,
            error: chunk.diagnostic?.error || null,
            count: sources.length,
            sources,
            ...categorize(sources),
            fetchedAt: nowISO(),
        }));
    }

    /**
     * `GET /api/v3/<ns>/manga/chapters` — flat chapter rows for a title.
     *
     * Gated on the bundle exposing `getMangaChapters` (501 otherwise), so a
     * streaming-only extension returns a clear "not supported" rather than a
     * crash. Rows are cached (chapter lists are expensive and stable); the
     * `provider` on each row is the sub-provider name, which round-trips through
     * the reader URL back into `manga/pages`.
     */
    async function handleMangaChapters(res, entry, namespace, searchParams) {
        let bundle;
        try {
            bundle = bundleLoader.load(entry.bundlePath);
        } catch (err) {
            res.writeHead(502, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, chapters: [], count: 0, error: err.message }));
        }

        if (typeof bundle.getMangaChapters !== 'function') {
            res.writeHead(501, JSON_HEADERS);
            return res.end(JSON.stringify({
                namespace,
                chapters: [],
                count: 0,
                error: "bundle does not implement getMangaChapters() — this extension does not provide manga",
            }));
        }

        const params = mangaParamsFromQuery(searchParams);
        const bypassCache = searchParams.get('refresh') === '1' || searchParams.get('nocache') === '1';
        const key = [
            'manga-chapters', namespace,
            params.anilistId || 0, params.malId || 0,
            params.title || '', (params.titles || []).join('|'),
        ].join(':');

        if (!bypassCache) {
            const hit = cacheGet(key);
            if (hit) {
                res.writeHead(200, JSON_HEADERS);
                return res.end(JSON.stringify({
                    namespace, provider: namespace,
                    count: hit.chapters.length, chapters: hit.chapters,
                    providerStatus: hit.providerStatus || [],
                    cached: true, fetchedAt: nowISO(),
                }));
            }
        }

        let chapters;
        // Per-sub-provider diagnostics (mangadex, mangapill, …). Prefer the
        // bundle's debug variant so the renderer can log each provider and its
        // chapter count — the same trace the anime path prints. Falls back to
        // the plain aggregate for an older bundle that lacks debugMangaChapters.
        let providerStatus = [];
        try {
            let entries;
            if (typeof bundle.debugMangaChapters === 'function') {
                const debug = await bundle.debugMangaChapters(params);
                entries = debug && Array.isArray(debug.results) ? debug.results : [];
                providerStatus = debug && Array.isArray(debug.diagnostics) ? debug.diagnostics : [];
            } else {
                entries = await bundle.getMangaChapters(params);
            }
            chapters = flattenMangaChapters(entries);
            const perProviderTrace = providerStatus.length
                ? providerStatus.map((d) => `${d.provider}=${d.resultCount}(${d.status})`).join(' ')
                : '(no diagnostics)';
            logger?.info?.(`[ExtHost] ${namespace}/manga/chapters bundle returned entries=${Array.isArray(entries) ? entries.length : typeof entries} → flattened=${chapters.length} providers=[${perProviderTrace}] (params=${JSON.stringify(params)})`);
        } catch (err) {
            logger?.warn?.(`[ExtHost] ${namespace}/manga/chapters failed: ${err && err.stack ? err.stack : err.message}`);
            res.writeHead(502, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, chapters: [], count: 0, error: err.message }));
        }

        if (chapters.length > 0) cacheSet(key, { chapters, providerStatus }, MANGA_TTL_MS);
        logger?.info?.(`[ExtHost] ${namespace}/manga/chapters params=${key} chapters=${chapters.length}`);

        res.writeHead(200, JSON_HEADERS);
        return res.end(JSON.stringify({
            namespace, provider: namespace,
            count: chapters.length, chapters, providerStatus,
            cached: false, fetchedAt: nowISO(),
        }));
    }

    /**
     * `GET /api/v3/<ns>/manga/pages` — pages for one chapter.
     *
     * Each page image is registered with the local proxy so the CDN Referer/
     * Origin headers the provider attached are replayed during load (many manga
     * CDNs 403 an unproxied request), yielding a `proxiedImageUrl` the renderer
     * can fetch directly. Never cached — proxy tokens expire in ~15 minutes.
     */
    async function handleMangaPages(res, entry, namespace, searchParams) {
        let bundle;
        try {
            bundle = bundleLoader.load(entry.bundlePath);
        } catch (err) {
            res.writeHead(502, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, pages: [], count: 0, error: err.message }));
        }

        if (typeof bundle.getMangaPages !== 'function') {
            res.writeHead(501, JSON_HEADERS);
            return res.end(JSON.stringify({
                namespace, pages: [], count: 0,
                error: "bundle does not implement getMangaPages() — this extension does not provide manga",
            }));
        }

        const chapterKey = String(searchParams.get('chapterKey') || '').trim();
        if (!chapterKey) {
            res.writeHead(400, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, pages: [], count: 0, error: 'chapterKey is required' }));
        }
        const anilistId = Number(searchParams.get('anilistId'));
        const pageParams = {
            chapterKey,
            provider: searchParams.get('provider') || undefined,
            providerChapterId: searchParams.get('providerChapterId') || undefined,
            ...(Number.isFinite(anilistId) && anilistId > 0 ? { anilistId } : {}),
        };

        let rawPages;
        try {
            rawPages = await bundle.getMangaPages(pageParams);
        } catch (err) {
            const notFound = /not found/i.test(err.message || '');
            logger?.warn?.(`[ExtHost] ${namespace}/manga/pages ${chapterKey} failed: ${err.message}`);
            res.writeHead(notFound ? 404 : 502, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, pages: [], count: 0, error: err.message }));
        }

        const canProxy = localProxy && typeof localProxy.registerSource === 'function';
        const pages = (Array.isArray(rawPages) ? rawPages : [])
            .filter((p) => p && p.imageUrl)
            .map((p) => {
                let proxiedImageUrl = p.imageUrl;
                const hasHeaders = p.headers && typeof p.headers === 'object' && Object.keys(p.headers).length > 0;
                if (canProxy && hasHeaders && /^https?:\/\//i.test(p.imageUrl)) {
                    try {
                        proxiedImageUrl = localProxy.registerSource({ url: p.imageUrl, headers: p.headers });
                    } catch (err) {
                        logger?.warn?.(`[ExtHost] manga page proxy failed: ${err.message}`);
                    }
                }
                return {
                    pageNumber: p.pageNumber,
                    imageUrl: p.imageUrl,
                    proxiedImageUrl,
                    width: p.width ?? null,
                    height: p.height ?? null,
                };
            });

        if (pages.length === 0) {
            res.writeHead(404, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, pages: [], count: 0, error: `Chapter not found: ${chapterKey}` }));
        }

        res.writeHead(200, JSON_HEADERS);
        return res.end(JSON.stringify({ namespace, count: pages.length, pages, fetchedAt: nowISO() }));
    }

    // ── Custom sources (`custom-source-v1`) ─────────────────────────────────────
    //
    // Isolated read/watch verticals. Like the manga routes these are ungated —
    // any extension whose bundle implements the `custom*` methods answers here,
    // and a bundle missing the method returns 501. Custom sources are NEVER tied
    // to the anime/manga watchlist or readlist; they render generic app UI over
    // the data these handlers relay.

    /** Load the namespace's bundle or write a 502; returns null on failure. */
    function loadCustomBundle(res, entry, namespace, emptyShape) {
        try {
            return bundleLoader.load(entry.bundlePath);
        } catch (err) {
            res.writeHead(502, JSON_HEADERS);
            res.end(JSON.stringify({ namespace, ...emptyShape, error: err.message }));
            return null;
        }
    }

    /** 501 helper for a bundle that doesn't implement a custom method. */
    function customNotImplemented(res, namespace, method, emptyShape) {
        res.writeHead(501, JSON_HEADERS);
        res.end(JSON.stringify({
            namespace, ...emptyShape,
            error: `bundle does not implement ${method}() — this extension does not provide this custom source`,
        }));
    }

    /** `GET /api/v3/<ns>/custom/home?sourceId=…` → { sections }. */
    async function handleCustomHome(res, entry, namespace, searchParams) {
        const empty = { sections: [] };
        const bundle = loadCustomBundle(res, entry, namespace, empty);
        if (!bundle) return;
        if (typeof bundle.customHome !== 'function') return customNotImplemented(res, namespace, 'customHome', empty);

        const sourceId = String(searchParams.get('sourceId') || '').trim();
        if (!sourceId) {
            res.writeHead(400, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, ...empty, error: 'sourceId is required' }));
        }
        try {
            const result = await bundle.customHome(sourceId);
            const sections = Array.isArray(result?.sections) ? result.sections : [];
            res.writeHead(200, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, sourceId, sections, fetchedAt: nowISO() }));
        } catch (err) {
            logger?.warn?.(`[ExtHost] ${namespace}/custom/home ${sourceId} failed: ${err.message}`);
            res.writeHead(502, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, ...empty, error: err.message }));
        }
    }

    /** `GET /api/v3/<ns>/custom/search?sourceId=…&q=…&page=…` → { results, hasNextPage? }. */
    async function handleCustomSearch(res, entry, namespace, searchParams) {
        const empty = { results: [] };
        const bundle = loadCustomBundle(res, entry, namespace, empty);
        if (!bundle) return;
        if (typeof bundle.customSearch !== 'function') return customNotImplemented(res, namespace, 'customSearch', empty);

        const sourceId = String(searchParams.get('sourceId') || '').trim();
        const query = String(searchParams.get('q') || searchParams.get('query') || '').trim();
        const pageNum = Number(searchParams.get('page'));
        const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
        if (!sourceId) {
            res.writeHead(400, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, ...empty, error: 'sourceId is required' }));
        }
        try {
            const result = await bundle.customSearch(sourceId, query, page);
            const results = Array.isArray(result?.results) ? result.results : [];
            res.writeHead(200, JSON_HEADERS);
            return res.end(JSON.stringify({
                namespace, sourceId, results,
                hasNextPage: !!result?.hasNextPage, fetchedAt: nowISO(),
            }));
        } catch (err) {
            logger?.warn?.(`[ExtHost] ${namespace}/custom/search ${sourceId} failed: ${err.message}`);
            res.writeHead(502, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, ...empty, error: err.message }));
        }
    }

    /** `GET /api/v3/<ns>/custom/info?sourceId=…&id=…` → { id,title,…,entries }. */
    async function handleCustomInfo(res, entry, namespace, searchParams) {
        const empty = { entries: [] };
        const bundle = loadCustomBundle(res, entry, namespace, empty);
        if (!bundle) return;
        if (typeof bundle.customInfo !== 'function') return customNotImplemented(res, namespace, 'customInfo', empty);

        const sourceId = String(searchParams.get('sourceId') || '').trim();
        const id = String(searchParams.get('id') || '').trim();
        if (!sourceId || !id) {
            res.writeHead(400, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, ...empty, error: 'sourceId and id are required' }));
        }
        try {
            const info = await bundle.customInfo(sourceId, id);
            if (!info || typeof info !== 'object') {
                res.writeHead(404, JSON_HEADERS);
                return res.end(JSON.stringify({ namespace, ...empty, error: `Not found: ${id}` }));
            }
            res.writeHead(200, JSON_HEADERS);
            return res.end(JSON.stringify({
                namespace, sourceId,
                id: info.id ?? id,
                title: info.title ?? '',
                image: info.image ?? null,
                description: info.description ?? null,
                meta: info.meta && typeof info.meta === 'object' ? info.meta : {},
                entries: Array.isArray(info.entries) ? info.entries : [],
                fetchedAt: nowISO(),
            }));
        } catch (err) {
            logger?.warn?.(`[ExtHost] ${namespace}/custom/info ${sourceId}/${id} failed: ${err.message}`);
            res.writeHead(502, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, ...empty, error: err.message }));
        }
    }

    /**
     * `GET /api/v3/<ns>/custom/watch?sourceId=…&id=…&episodeId=…` → { sources }.
     *
     * Reuses the streaming `SourceResult` shape so the existing VideoPlayer
     * consumes it unchanged. Each source is normalized and run through the local
     * proxy (Referer/Origin replay for HLS/MP4 + subtitle tracks) exactly like
     * the anime path.
     */
    async function handleCustomWatch(res, entry, namespace, searchParams) {
        const empty = { sources: [] };
        const bundle = loadCustomBundle(res, entry, namespace, empty);
        if (!bundle) return;
        if (typeof bundle.customWatch !== 'function') return customNotImplemented(res, namespace, 'customWatch', empty);

        const sourceId = String(searchParams.get('sourceId') || '').trim();
        const id = String(searchParams.get('id') || '').trim();
        const episodeId = String(searchParams.get('episodeId') || '').trim();
        if (!sourceId || !id || !episodeId) {
            res.writeHead(400, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, ...empty, error: 'sourceId, id and episodeId are required' }));
        }
        try {
            const result = await bundle.customWatch(sourceId, id, episodeId);
            const raw = Array.isArray(result?.sources) ? result.sources : [];
            const sources = raw
                .filter((s) => s && typeof s === 'object' && s.url)
                .map((s) => applyProxy(normalizeSource(s), s.headers, localProxy, logger));
            logger?.info?.(`[ExtHost] ${namespace}/custom/watch ${sourceId}/${id}/${episodeId} → ${sources.length} sources`);
            res.writeHead(200, JSON_HEADERS);
            return res.end(JSON.stringify({
                namespace, sourceId, count: sources.length, sources,
                ...categorize(sources), fetchedAt: nowISO(),
            }));
        } catch (err) {
            logger?.warn?.(`[ExtHost] ${namespace}/custom/watch ${sourceId}/${id}/${episodeId} failed: ${err.message}`);
            res.writeHead(502, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, ...empty, error: err.message }));
        }
    }

    /**
     * `GET /api/v3/<ns>/custom/read?sourceId=…&id=…&chapterId=…` → { pages }.
     *
     * Reuses the manga-page shape so the existing reader consumes it unchanged.
     * Page images with headers are registered with the local proxy (many CDNs
     * 403 an unproxied request), yielding a `proxiedImageUrl`.
     */
    async function handleCustomRead(res, entry, namespace, searchParams) {
        const empty = { pages: [] };
        const bundle = loadCustomBundle(res, entry, namespace, empty);
        if (!bundle) return;
        if (typeof bundle.customRead !== 'function') return customNotImplemented(res, namespace, 'customRead', empty);

        const sourceId = String(searchParams.get('sourceId') || '').trim();
        const id = String(searchParams.get('id') || '').trim();
        const chapterId = String(searchParams.get('chapterId') || '').trim();
        if (!sourceId || !id || !chapterId) {
            res.writeHead(400, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, ...empty, error: 'sourceId, id and chapterId are required' }));
        }
        try {
            const result = await bundle.customRead(sourceId, id, chapterId);
            const rawPages = Array.isArray(result?.pages) ? result.pages : [];
            const canProxy = localProxy && typeof localProxy.registerSource === 'function';
            const pages = rawPages
                .filter((p) => p && p.imageUrl)
                .map((p) => {
                    let proxiedImageUrl = p.imageUrl;
                    const hasHeaders = p.headers && typeof p.headers === 'object' && Object.keys(p.headers).length > 0;
                    if (canProxy && hasHeaders && /^https?:\/\//i.test(p.imageUrl)) {
                        try {
                            proxiedImageUrl = localProxy.registerSource({ url: p.imageUrl, headers: p.headers });
                        } catch (err) {
                            logger?.warn?.(`[ExtHost] custom page proxy failed: ${err.message}`);
                        }
                    }
                    return { pageNumber: p.pageNumber, imageUrl: p.imageUrl, proxiedImageUrl };
                });
            if (pages.length === 0) {
                res.writeHead(404, JSON_HEADERS);
                return res.end(JSON.stringify({ namespace, ...empty, error: `Chapter not found: ${chapterId}` }));
            }
            res.writeHead(200, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, sourceId, count: pages.length, pages, fetchedAt: nowISO() }));
        } catch (err) {
            logger?.warn?.(`[ExtHost] ${namespace}/custom/read ${sourceId}/${id}/${chapterId} failed: ${err.message}`);
            res.writeHead(502, JSON_HEADERS);
            return res.end(JSON.stringify({ namespace, ...empty, error: err.message }));
        }
    }

    /**
     * Reachability check for a URL the renderer cannot test itself.
     *
     * Embed sources are loaded in an `<iframe>`, and an iframe gives the page no
     * usable failure signal: a 502 or a Cloudflare interstitial still fires
     * `onLoad` (the frame *did* load — an error document), and `fetch` from the
     * renderer is refused by CORS, so a dead embed host looks exactly like a
     * working one. The result is a player stuck on a blank frame while the
     * app's failover machinery waits for an error that never arrives.
     *
     * The host has no such restriction, so it does the request and reports the
     * status. Deliberately namespace-agnostic — nothing here is specific to one
     * extension, and every extension's embeds have the same problem.
     */
    async function handleProbe(res, searchParams) {
        const target = String(searchParams.get('url') || '').trim();
        let parsedTarget;
        try {
            parsedTarget = new URL(target);
        } catch {
            res.writeHead(400, JSON_HEADERS);
            return res.end(JSON.stringify({ ok: false, error: 'invalid or missing url' }));
        }
        if (!/^https?:$/.test(parsedTarget.protocol)) {
            res.writeHead(400, JSON_HEADERS);
            return res.end(JSON.stringify({ ok: false, error: 'only http(s) can be probed' }));
        }

        const referer = String(searchParams.get('referer') || '').trim();
        const headers = { 'User-Agent': PROBE_USER_AGENT, Accept: '*/*' };
        if (referer) {
            headers.Referer = referer;
            try { headers.Origin = new URL(referer).origin; } catch { /* referer need not be absolute */ }
        }

        const attempt = async (method) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
            try {
                const reqHeaders = method === 'GET' ? { ...headers, Range: 'bytes=0-0' } : headers;
                const upstream = await fetch(parsedTarget.href, {
                    method,
                    headers: reqHeaders,
                    redirect: 'follow',
                    signal: controller.signal,
                });
                // Drain so the socket is released rather than left half-read.
                try { await upstream.arrayBuffer(); } catch { /* HEAD has no body */ }
                return { status: upstream.status, finalUrl: upstream.url || parsedTarget.href };
            } finally {
                clearTimeout(timer);
            }
        };

        try {
            let result = await attempt('HEAD');
            // Plenty of embed hosts simply refuse HEAD; that says nothing about
            // whether the page itself is up, so re-ask with a one-byte GET.
            if (result.status === 405 || result.status === 501 || result.status === 403) {
                try { result = await attempt('GET'); } catch { /* keep the HEAD verdict */ }
            }
            res.writeHead(200, JSON_HEADERS);
            return res.end(JSON.stringify({
                ok: result.status > 0 && result.status < 400,
                status: result.status,
                finalUrl: result.finalUrl,
                checkedAt: nowISO(),
            }));
        } catch (err) {
            const aborted = err?.name === 'AbortError';
            res.writeHead(200, JSON_HEADERS);
            return res.end(JSON.stringify({
                ok: false,
                status: 0,
                error: aborted ? `probe timed out after ${PROBE_TIMEOUT_MS}ms` : String(err?.message || err),
                checkedAt: nowISO(),
            }));
        }
    }

    async function handler(req, res) {
        let parsed;
        try {
            parsed = new URL(req.url, 'http://127.0.0.1');
        } catch {
            res.writeHead(400, JSON_HEADERS);
            return res.end(JSON.stringify({ error: 'Bad request' }));
        }
        const pathname = parsed.pathname;
        const searchParams = parsed.searchParams;

        // Preflight (renderer EventSource / fetch from localhost origin)
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': '*',
            });
            return res.end();
        }

        // Host-level health
        if (pathname === '/health' || pathname === '/api/v3/health') {
            res.writeHead(200, JSON_HEADERS);
            return res.end(JSON.stringify({ ok: true, service: 'extension-api-host', namespaces: listNamespaces() }));
        }

        // Host-level URL reachability check (see handleProbe).
        if (pathname === '/api/v3/probe') {
            return handleProbe(res, searchParams);
        }

        // /api/v3/<namespace>/<route>
        const match = pathname.match(/^\/api\/v3\/([^/]+)\/(.+)$/);
        if (!match) {
            res.writeHead(404, JSON_HEADERS);
            return res.end(JSON.stringify({ error: 'Not found' }));
        }
        const namespace = match[1];
        const route = match[2].replace(/\/+$/, '');

        const found = findNamespaceEntry(namespace);
        if (!found) {
            res.writeHead(404, JSON_HEADERS);
            return res.end(JSON.stringify({ error: `Unknown or untrusted namespace '${namespace}'` }));
        }

        const api = found.entry.manifest.apiServer;
        const healthRoute = String(api.healthPath || '/health').replace(/^\/+/, '');
        if (route === healthRoute || route === 'health') {
            res.writeHead(200, JSON_HEADERS);
            return res.end(JSON.stringify({ ok: true, namespace, extensionId: found.id }));
        }

        const allowedRoutes = Array.isArray(api.routes) ? api.routes : ['sources', 'stream', 'torrent'];

        // Per-provider routes are always available for a `streaming-sources-v3`
        // bundle; they are diagnostics over the same providers the aggregate
        // routes use, so they are not gated on `manifest.apiServer.routes`.
        if (route === 'providers') {
            return handleProviderList(res, found.entry, namespace);
        }
        const providerMatch = route.match(/^providers\/([^/]+)$/);
        if (providerMatch) {
            const providerName = decodeURIComponent(providerMatch[1]);
            try {
                await handleSingleProvider(req, res, found.entry, namespace, providerName, searchParams);
            } catch (err) {
                logger?.error?.(`[ExtHost] provider handler crashed: ${err.message}`);
                if (!res.headersSent) {
                    res.writeHead(502, JSON_HEADERS);
                    res.end(JSON.stringify({ provider: providerName, sources: [], count: 0, error: err.message }));
                } else {
                    try { res.end(); } catch (_) { /* noop */ }
                }
            }
            return;
        }

        // Manga routes — available whenever the bundle implements the manga
        // contract, independent of `apiServer.routes` (which gate the streaming
        // routes). Any extension, not just Toko, gets these by exposing
        // getMangaChapters/getMangaPages; the 501 inside each handler covers a
        // streaming-only bundle.
        if (route === 'manga/chapters') {
            try {
                await handleMangaChapters(res, found.entry, namespace, searchParams);
            } catch (err) {
                logger?.error?.(`[ExtHost] manga chapters handler crashed: ${err.message}`);
                if (!res.headersSent) {
                    res.writeHead(502, JSON_HEADERS);
                    res.end(JSON.stringify({ namespace, chapters: [], count: 0, error: err.message }));
                }
            }
            return;
        }
        if (route === 'manga/pages') {
            try {
                await handleMangaPages(res, found.entry, namespace, searchParams);
            } catch (err) {
                logger?.error?.(`[ExtHost] manga pages handler crashed: ${err.message}`);
                if (!res.headersSent) {
                    res.writeHead(502, JSON_HEADERS);
                    res.end(JSON.stringify({ namespace, pages: [], count: 0, error: err.message }));
                }
            }
            return;
        }

        // Custom-source routes — ungated like the manga routes. Any extension
        // whose bundle implements the `custom*` methods answers here; the 501
        // inside each handler covers a bundle that doesn't. These verticals are
        // isolated from the anime/manga watchlist/readlist by design.
        const customHandlers = {
            'custom/home': handleCustomHome,
            'custom/search': handleCustomSearch,
            'custom/info': handleCustomInfo,
            'custom/watch': handleCustomWatch,
            'custom/read': handleCustomRead,
        };
        if (customHandlers[route]) {
            try {
                await customHandlers[route](res, found.entry, namespace, searchParams);
            } catch (err) {
                logger?.error?.(`[ExtHost] ${route} handler crashed: ${err.message}`);
                if (!res.headersSent) {
                    res.writeHead(502, JSON_HEADERS);
                    res.end(JSON.stringify({ namespace, error: err.message }));
                }
            }
            return;
        }

        if (!['sources', 'stream', 'torrent'].includes(route) || !allowedRoutes.includes(route)) {
            res.writeHead(404, JSON_HEADERS);
            return res.end(JSON.stringify({ error: `Unknown route '${route}' for namespace '${namespace}'` }));
        }

        try {
            await handleSourceRequest(req, res, route, found.entry, searchParams);
        } catch (err) {
            logger?.error?.(`[ExtHost] request handler crashed: ${err.message}`);
            if (!res.headersSent) {
                res.writeHead(502, JSON_HEADERS);
                res.end(JSON.stringify({ error: err.message }));
            } else {
                try { res.end(); } catch (_) { /* noop */ }
            }
        }
    }

    return {
        handler,
        listNamespaces,
        invalidateBundles: () => {
            bundleLoader.invalidate();
            // A reloaded bundle can produce different sources, so cached results
            // from the previous one are no longer trustworthy.
            resultCache.clear();
        },
    };
}

module.exports = {
    createHostApp,
    // Exported for unit testing / reuse
    normalizeSource,
    resolveSourceType,
    inferLanguage,
    optionsFromQuery,
    http, // re-export so supervisor shares the same module instance
};
