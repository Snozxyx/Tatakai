'use strict';

/**
 * Manga chapter (image-set) download queue — the manga counterpart of
 * ipc-download-manager.cjs. Runs entirely in the MAIN process because chapter
 * pages must be re-resolved here: the extension runtime returns each page as a
 * raw CDN `imageUrl` plus optional per-page `headers` (Referer-locked CDNs),
 * and those `headers` are DROPPED at the main→renderer IPC boundary. A renderer
 * downloader would only see a `127.0.0.1/stream/<token>` proxy URL whose token
 * expires ~15 min later, so it cannot fetch pages reliably. We instead invoke
 * `getMangaPages` through the same registry/workerPool the IPC path uses, keep
 * the headers, and fetch each image with them.
 *
 * Layout on disk:
 *   <root>/Manga/<title>/manifest.json         — series manifest
 *   <root>/Manga/<title>/Chapter_<n>/NNN.<ext>  — 3-digit zero-padded pages
 *   <root>/Manga/<title>/Chapter_<n>/manifest.json
 *
 * Events (dedicated — NOT the shared anime download-* triad, so the anime
 * download-monitor state stays clean):
 *   manga-download-progress   { jobId, anilistId, chapterKey, percent, page, totalPages }
 *   manga-download-completed  { jobId, anilistId, chapterKey, localDir, pageCount, sizeBytes }
 *   manga-download-error      { jobId, anilistId, chapterKey, error }
 */

const axios = require('axios');
const pathMod = require('path');
const fsMod = require('fs');
const { DownloadStorageManager } = require('../runtime/download/storage-manager.cjs');

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'];
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function sanitizeName(name) {
    return (
        String(name || 'Untitled')
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
            .replace(/\s+/g, ' ')
            .trim() || 'Untitled'
    );
}

/** Chapter folder label: `Chapter_12`, `Chapter_12.5`, or `Chapter_<key>` fallback. */
function chapterFolder(chapterNumber, chapterKey) {
    if (chapterNumber != null && Number.isFinite(Number(chapterNumber))) {
        return `Chapter_${String(chapterNumber).replace(/[^\d.]/g, '')}`;
    }
    return `Chapter_${sanitizeName(chapterKey).slice(0, 40)}`;
}

function extFromUrl(url, contentType) {
    try {
        const m = new URL(url).pathname.match(/\.([a-z0-9]+)$/i);
        if (m) {
            const e = m[1].toLowerCase();
            if (IMAGE_EXTS.includes(e)) return e === 'jpeg' ? 'jpg' : e;
        }
    } catch (_) { /* not a parseable URL */ }
    const ct = String(contentType || '').toLowerCase();
    if (ct.includes('png')) return 'png';
    if (ct.includes('webp')) return 'webp';
    if (ct.includes('avif')) return 'avif';
    if (ct.includes('gif')) return 'gif';
    return 'jpg';
}
/**
 * Fetch one page image with its per-page headers into `dir` as `baseName.<ext>`.
 * Skips re-download when a non-empty file with that basename already exists.
 * Retries transient network/5xx blips once; an HTTP 404 is authoritative
 * (dead CDN URL) and is thrown immediately so the caller can fall through to
 * the next source instead of burning retries on a dead link.
 */
function isRetryableImageError(err) {
    const status = err?.response?.status;
    if (status === 404) return false;
    if (typeof status === 'number') return status >= 500 || status === 429;
    const code = String(err?.code || '');
    return code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ECONNRESET' || !status;
}

async function downloadImage(url, dir, baseName, headers, signal) {
    if (!fsMod.existsSync(dir)) fsMod.mkdirSync(dir, { recursive: true });

    const existing = fsMod.readdirSync(dir).find((f) => f.startsWith(`${baseName}.`));
    if (existing) {
        const size = fsMod.statSync(pathMod.join(dir, existing)).size;
        if (size > 0) return { file: existing, size };
    }

    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream',
                timeout: 45000,
                signal,
                headers: {
                    'User-Agent': DEFAULT_UA,
                    Accept: 'image/avif,image/webp,image/apng,image/*,*/*',
                    Referer: headers?.Referer || headers?.referer || undefined,
                    ...(headers || {}),
                },
                maxRedirects: 5,
                validateStatus: (s) => s >= 200 && s < 400,
            });

            const ext = extFromUrl(url, response.headers?.['content-type']);
            const file = `${baseName}.${ext}`;
            const outputPath = pathMod.join(dir, file);
            const writer = fsMod.createWriteStream(outputPath);
            response.data.pipe(writer);

            return await new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    try {
                        const size = fsMod.statSync(outputPath).size;
                        if (size > 0) resolve({ file, size });
                        else {
                            fsMod.unlinkSync(outputPath);
                            reject(new Error('Downloaded image is empty'));
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
                writer.on('error', reject);
                response.data.on('error', (err) => {
                    try { writer.destroy(); } catch (_) { /* empty */ }
                    try { if (fsMod.existsSync(outputPath)) fsMod.unlinkSync(outputPath); } catch (_) { /* empty */ }
                    reject(err);
                });
            });
        } catch (err) {
            lastErr = err;
            if (signal?.aborted) throw err;
            if (!isRetryableImageError(err) || attempt === 1) throw err;
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
    }
    throw lastErr || new Error('Download failed');
}

module.exports = function registerMangaDownloadManager(ipcMain, app, fs, path, logger, getMainWindow, runtimeApi) {
    const storageManager = new DownloadStorageManager({ app, fs, path });
    const { registry, workerPool, ensureExtensionFetchProxy } = runtimeApi || {};

    /** jobId → { cancelled, abort } */
    const activeDownloads = new Map();
    const downloadQueue = [];

    const send = (channel, payload) => {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    };

    const processQueue = () => {
        if (downloadQueue.length > 0 && activeDownloads.size < 3) {
            const next = downloadQueue.shift();
            if (next) next();
        }
    };

    function resolveDownloadRoot(payload) {
        const raw = payload?.downloadPath || payload?.localStoragePath || '';
        if (raw && raw.trim()) return raw.trim();
        return storageManager.defaultLibraryRoot();
    }

    /** Loaded, non-kill-switched manga extensions (mirrors ipc-runtime's helper). */
    const listMangaExtensionEntries = () => {
        const out = [];
        if (!registry) {
            logger.warn('[MangaDL] listMangaExtensionEntries: no registry on runtimeApi');
            return out;
        }
        for (const id of registry.listLoaded()) {
            if (registry.isKillSwitched(id)) continue;
            const entry = registry.lookup(id);
            const caps = Array.isArray(entry?.manifest?.capabilities) ? entry.manifest.capabilities : [];
            if (!caps.includes('manga') && !caps.includes('chapters')) continue;
            if (!entry.bundlePath || !fs.existsSync(entry.bundlePath)) continue;
            out.push({ id, entry });
        }
        logger.info(`[MangaDL] manga-capable extensions: ${out.length ? out.map((e) => e.id).join(', ') : '(none)'}`);
        return out;
    };

    /**
     * Re-resolve a chapter's pages WITH per-page headers in-main.
     *
     * CRUCIAL: the `provider` field on a chapter source is the SUB-PROVIDER name
     * (e.g. "mangadex" / "allmanga"), NOT the extension namespace id
     * ("tatakai.extension.toko"). chapterKeys are prefixed with it
     * (`mangadex:<uuid>`). An extension's `getMangaPages` routes internally by
     * that sub-provider; passing the namespace id yields "Chapter not found".
     *
     * We therefore mirror the working reader/IPC path exactly (see
     * ipc-runtime.cjs `getMangaPages`, which forwards the raw renderer payload
     * verbatim): for each source (primary + declared alternatives, each carrying
     * its own sub-provider name), invoke every loaded manga extension worker
     * with `provider` = the sub-provider until one yields pages. A chapter is
     * owned by exactly one extension, so foreign extensions return nothing.
     *
     * @returns {Promise<Array<{ imageUrl, headers }>>}
     */
    function buildChapterSources(chapter) {
        // Each "source" keeps its own sub-provider name + chapterKey. The reader
        // lets the user pick a provider; honor that (and any alternatives) here.
        const sources = [];
        const pushSource = (provider, chapterKey, providerChapterId) => {
            if (!chapterKey) return;
            if (sources.some((s) => s.provider === provider && s.chapterKey === chapterKey)) return;
            sources.push({
                provider: provider ?? null,
                chapterKey,
                providerChapterId: providerChapterId ?? chapterKey,
            });
        };
        pushSource(chapter.provider, chapter.chapterKey, chapter.providerChapterId);
        for (const alt of Array.isArray(chapter.alternatives) ? chapter.alternatives : []) {
            pushSource(alt.provider, alt.chapterKey, alt.providerChapterId);
        }
        return sources;
    }

    async function resolveSingleSourcePages(source, chapter, mangaExts) {
        let lastError = null;
        for (const { id, entry } of mangaExts) {
            try {
                const code = fs.readFileSync(entry.bundlePath, 'utf8');
                await workerPool.getOrSpawn(id, code, entry.manifest);
                const result = await workerPool.invoke(id, 'getMangaPages', [
                    {
                        chapterKey: source.chapterKey,
                        provider: source.provider, // SUB-PROVIDER (e.g. "mangadex") — matches the reader
                        providerChapterId: source.providerChapterId,
                        anilistId: chapter.anilistId,
                    },
                ]);
                const rawPages = Array.isArray(result) ? result : result?.pages || [];
                const pages = [];
                for (const p of Array.isArray(rawPages) ? rawPages : []) {
                    const imageUrl = String(p?.imageUrl || '');
                    if (!imageUrl) continue;
                    const headers =
                        p.headers && typeof p.headers === 'object' && Object.keys(p.headers).length > 0
                            ? p.headers
                            : null;
                    pages.push({ imageUrl, headers });
                }
                logger.info(`[MangaDL] ${id}.getMangaPages(provider=${source.provider}) → ${pages.length} usable page(s) (raw=${Array.isArray(rawPages) ? rawPages.length : 0})`);
                if (pages.length > 0) return pages;
            } catch (err) {
                lastError = err.message;
                logger.warn(`[MangaDL] getMangaPages failed for ext=${id} provider=${source.provider}: ${err.message}`);
            }
        }
        throw new Error(lastError || `No pages returned for source ${source.provider || '(none)'}`);
    }

    async function resolvePagesWithHeaders(chapter) {
        if (!workerPool) throw new Error('extension worker pool unavailable (runtimeApi not wired)');
        const mangaExts = listMangaExtensionEntries();
        if (mangaExts.length === 0) throw new Error('No manga extension loaded');
        if (ensureExtensionFetchProxy) await ensureExtensionFetchProxy();

        const sources = buildChapterSources(chapter);
        logger.info(
            `[MangaDL] resolving pages for chapterKey=${chapter.chapterKey} — ${sources.length} source(s): ` +
            sources.map((s) => s.provider || '(none)').join(' → '),
        );

        let lastError = null;
        for (const source of sources) {
            try {
                return await resolveSingleSourcePages(source, chapter, mangaExts);
            } catch (err) {
                lastError = err.message;
            }
        }
        throw new Error(lastError || 'No pages returned for chapter');
    }

    /** Download one chapter to disk, emitting progress. Resolves its manifest entry. */
    async function runChapterDownload(series, chapter) {
        const jobId = `manga:${series.anilistId}:${chapter.chapterKey}`;
        if (activeDownloads.has(jobId)) return { success: false, error: 'already_downloading' };

        // Reject path traversal in the caller-supplied root before resolving.
        const rawPath = series.downloadPath || '';
        if (rawPath.includes('../') || rawPath.includes('..\\')) {
            return { success: false, error: 'invalid_download_path' };
        }

        const state = { cancelled: false, abort: new AbortController() };
        activeDownloads.set(jobId, state);

        const root = resolveDownloadRoot(series);
        const title = sanitizeName(series.title);
        const seriesDir = path.join(root, 'Manga', title);
        const chapDir = path.join(seriesDir, chapterFolder(chapter.chapterNumber, chapter.chapterKey));
        logger.info(`[MangaDL] start ${jobId} — provider=${chapter.provider || '?'} → ${chapDir}`);

        try {
            if (!fs.existsSync(chapDir)) fs.mkdirSync(chapDir, { recursive: true });

            // Try each source's pages for DOWNLOAD, not just resolution: the
            // primary source may resolve pages whose CDN URLs are dead (HTTP
            // 404 from rotated/signed links) while an alternative scanlator
            // serves fine. First source with >0 downloaded pages wins.
            const chapterWithAnilist = { ...chapter, anilistId: series.anilistId };
            const sources = buildChapterSources(chapterWithAnilist);
            if (!workerPool) throw new Error('extension worker pool unavailable (runtimeApi not wired)');
            const mangaExts = listMangaExtensionEntries();
            if (mangaExts.length === 0) throw new Error('No manga extension loaded');
            if (ensureExtensionFetchProxy) await ensureExtensionFetchProxy();

            let pages = [];
            let usedSource = sources[0] || null;
            let lastResolveError = null;
            let downloadedFromSource = null;
            let pageEntries = [];
            let sizeBytes = 0;
            let totalPages = 0;

            for (const source of sources) {
                if (state.cancelled) throw new Error('cancelled');
                let candidatePages = [];
                try {
                    candidatePages = await resolveSingleSourcePages(source, chapterWithAnilist, mangaExts);
                } catch (err) {
                    lastResolveError = err.message;
                    logger.warn(`[MangaDL] source ${source.provider || '(none)'} resolve failed: ${err.message}`);
                    continue;
                }
                if (state.cancelled) throw new Error('cancelled');

                // Clean partial files from a previous dead source attempt so
                // extensions/stale pages never mix across scanlators.
                if (downloadedFromSource !== null) {
                    try {
                        for (const f of fsMod.readdirSync(chapDir)) {
                            if (/^\d{3}\./.test(f)) fsMod.unlinkSync(pathMod.join(chapDir, f));
                        }
                    } catch (_) { /* best-effort */ }
                }

                const attemptEntries = [];
                let attemptBytes = 0;
                for (let i = 0; i < candidatePages.length; i++) {
                    if (state.cancelled) throw new Error('cancelled');
                    const baseName = String(i + 1).padStart(3, '0');
                    try {
                        const { file, size } = await downloadImage(
                            candidatePages[i].imageUrl,
                            chapDir,
                            baseName,
                            candidatePages[i].headers,
                            state.abort.signal,
                        );
                        attemptBytes += size;
                        attemptEntries.push({ pageNumber: i + 1, file, sizeBytes: size });
                    } catch (err) {
                        if (state.cancelled) throw new Error('cancelled');
                        logger.warn(`[MangaDownload] page ${i + 1} failed (${jobId}, src=${source.provider || '?'}): ${err.message}`);
                    }
                    send('manga-download-progress', {
                        jobId,
                        anilistId: series.anilistId,
                        chapterKey: chapter.chapterKey,
                        page: i + 1,
                        totalPages: candidatePages.length,
                        percent: candidatePages.length ? Math.round(((i + 1) / candidatePages.length) * 100) : 0,
                    });
                }

                if (attemptEntries.length > 0) {
                    pages = candidatePages;
                    usedSource = source;
                    downloadedFromSource = source;
                    pageEntries = attemptEntries;
                    sizeBytes = attemptBytes;
                    totalPages = candidatePages.length;
                    if (source !== sources[0]) {
                        logger.info(`[MangaDL] ${jobId} fell through to alternative source ${source.provider} (${pageEntries.length}/${totalPages} pages)`);
                    }
                    break;
                }
                logger.warn(`[MangaDL] source ${source.provider || '(none)'} downloaded 0/${candidatePages.length} pages — trying next source`);
                lastResolveError = `Source ${source.provider || '(none)'} returned dead image links (404)`;
            }

            if (pageEntries.length === 0) {
                const all404 = /404/.test(String(lastResolveError || ''));
                throw new Error(
                    lastResolveError
                        ? all404
                            ? `${lastResolveError}. The chapter's image links are dead — try another provider/source.`
                            : lastResolveError
                        : 'No pages downloaded',
                );
            }

            // Chapter manifest.
            const effectiveProvider = usedSource?.provider ?? chapter.provider ?? null;
            const chapterManifest = {
                chapterKey: chapter.chapterKey,
                chapterNumber: chapter.chapterNumber ?? null,
                volume: chapter.volume ?? null,
                provider: effectiveProvider,
                pageCount: pageEntries.length,
                sizeBytes,
                pages: pageEntries,
                downloadedAt: new Date().toISOString(),
            };
            fs.writeFileSync(path.join(chapDir, 'manifest.json'), JSON.stringify(chapterManifest, null, 2));

            // Series manifest (upsert this chapter).
            writeSeriesManifest(seriesDir, series, {
                chapterKey: chapter.chapterKey,
                chapterNumber: chapter.chapterNumber ?? null,
                volume: chapter.volume ?? null,
                provider: effectiveProvider,
                dir: path.basename(chapDir),
                pageCount: pageEntries.length,
                sizeBytes,
                downloadedAt: chapterManifest.downloadedAt,
            });

            activeDownloads.delete(jobId);
            send('manga-download-completed', {
                jobId,
                anilistId: series.anilistId,
                chapterKey: chapter.chapterKey,
                chapterNumber: chapter.chapterNumber ?? null,
                volume: chapter.volume ?? null,
                provider: effectiveProvider,
                title: series.title,
                localDir: chapDir,
                pageCount: pageEntries.length,
                sizeBytes,
            });
            logger.info(`[MangaDL] done ${jobId} — ${pageEntries.length} page(s), ${(sizeBytes / 1048576).toFixed(1)} MB`);
            processQueue();
            return { success: true, jobId, localDir: chapDir, pageCount: pageEntries.length, sizeBytes };
        } catch (err) {
            activeDownloads.delete(jobId);
            const cancelled = state.cancelled || err.message === 'cancelled';
            if (cancelled) {
                // Best-effort: drop the partial chapter folder.
                try { fs.rmSync(chapDir, { recursive: true, force: true }); } catch (_) { /* empty */ }
            } else {
                logger.error(`[MangaDownload] chapter failed (${jobId}): ${err.message}`);
            }
            send('manga-download-error', {
                jobId,
                anilistId: series.anilistId,
                chapterKey: chapter.chapterKey,
                error: cancelled ? 'cancelled' : err.message,
            });
            processQueue();
            return { success: false, error: cancelled ? 'cancelled' : err.message };
        }
    }

    /** Upsert one chapter row into the series-level manifest.json. */
    function writeSeriesManifest(seriesDir, series, chapterRow) {
        const manifestPath = path.join(seriesDir, 'manifest.json');
        let manifest = { anilistId: series.anilistId, title: series.title, posterUrl: series.posterUrl || null, kind: series.kind || 'manga', chapters: [] };
        if (fs.existsSync(manifestPath)) {
            try {
                const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                manifest = {
                    anilistId: existing.anilistId ?? series.anilistId,
                    title: existing.title || series.title,
                    posterUrl: existing.posterUrl || series.posterUrl || null,
                    kind: existing.kind || series.kind || 'manga',
                    chapters: Array.isArray(existing.chapters) ? existing.chapters : [],
                };
            } catch (_) { /* rebuild on parse failure */ }
        }
        const idx = manifest.chapters.findIndex((c) => c.chapterKey === chapterRow.chapterKey);
        if (idx === -1) manifest.chapters.push(chapterRow);
        else manifest.chapters[idx] = chapterRow;
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }

    /** Queue a single chapter behind the concurrency cap. */
    function enqueueChapter(series, chapter) {
        const jobId = `manga:${series.anilistId}:${chapter.chapterKey}`;
        if (activeDownloads.has(jobId)) return { success: false, error: 'already_downloading' };
        const start = () => { void runChapterDownload(series, chapter); };
        if (activeDownloads.size < 3) start();
        else downloadQueue.push(start);
        return { success: true, jobId, status: 'queued' };
    }

    // ── IPC channels ──────────────────────────────────────────────────────────
    ipcMain.handle('manga-download:enqueue-chapter', async (_event, payload) => {
        const { chapter, ...series } = payload || {};
        logger.info(`[MangaDL] enqueue-chapter received: anilistId=${series.anilistId}, chapterKey=${chapter?.chapterKey}, provider=${chapter?.provider}`);
        if (!series.anilistId || !chapter?.chapterKey) {
            logger.warn('[MangaDL] enqueue-chapter rejected: invalid_payload');
            return { success: false, error: 'invalid_payload' };
        }
        return enqueueChapter(series, chapter);
    });

    ipcMain.handle('manga-download:enqueue-all', async (_event, payload) => {
        const { chapters, ...series } = payload || {};
        logger.info(`[MangaDL] enqueue-all received: anilistId=${series.anilistId}, title="${series.title}", chapters=${Array.isArray(chapters) ? chapters.length : 0}, downloadPath=${series.downloadPath || '(default)'}`);
        if (!series.anilistId || !Array.isArray(chapters) || chapters.length === 0) {
            logger.warn('[MangaDL] enqueue-all rejected: invalid_payload');
            return { success: false, error: 'invalid_payload' };
        }
        const jobs = chapters
            .filter((c) => c?.chapterKey)
            .map((chapter) => enqueueChapter(series, chapter));
        return { success: true, queued: jobs.length, jobs };
    });

    ipcMain.handle('manga-download:cancel', async (_event, params) => {
        const { jobId } = params || {};
        const state = activeDownloads.get(jobId);
        if (state) {
            state.cancelled = true;
            try { state.abort.abort(); } catch (_) { /* empty */ }
            return { success: true };
        }
        // Not active — drop it from the pending queue if present (best-effort:
        // queued jobs are opaque closures, so just report not-found).
        return { success: false, error: 'not_active' };
    });

    ipcMain.handle('manga-download:list', async () => ({
        active: Array.from(activeDownloads.keys()),
        queued: downloadQueue.length,
    }));
};

