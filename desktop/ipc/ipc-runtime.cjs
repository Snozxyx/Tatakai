'use strict';

/**
 * ipc-runtime.cjs
 *
 * IPC handlers for the Tatakai local runtime:
 *   - runtime:health, runtime:resolve-sources
 *   - cache:read, cache:write
 *   - extension:load, extension:unload, extension:invoke
 *   - extension:submit, extension:review-status (marketplace submission)
 *   - network:get-warp-status, network:toggle-warp
 *   - torrent:search, torrent:start, torrent:stop, torrent:stats (stubs — filled by TorrentCore)
 *
 * Registered by main.cjs via:
 *   require('./ipc-runtime.cjs')(ipcMain, app, fs, path, logger, getMainWindow)
 */

const crypto = require('crypto');
const axios = require('axios');
const { ExtensionRegistry } = require('../runtime/extension/extension-registry.cjs');
const { ExtensionWorkerPool } = require('../runtime/extension/extension-worker-pool.cjs');
const { enforcePayloadLimit } = require('../runtime/security/payload-guard.cjs');
const { withCallTimeout, CALL_TIMEOUT_MS } = require('../runtime/security/timeout-guard.cjs');
const { LocalProxyServer } = require('../runtime/proxy/local-proxy-server.cjs');
const { WarpTunnel } = require('../runtime/warp/warp-tunnel.cjs');
const { parseKaiFile, installKaiExtension } = require('../runtime/extension/kai-format.cjs');
const { createExtensionApiHost } = require('../runtime/extension-api-host/supervisor.cjs');

// ── Tatakai API base URL ──────────────────────────────────────────────────────
// Resolves to http://localhost:4001/api/v3 in dev, https://api.tatakai.me/api/v3 in prod.
const TATAKAI_API_BASE = (process.env.VITE_BACKEND_ORIGIN || 'http://localhost:4001') + '/api/v3';

// ── Tatakai Extension Marketplace Public Key (Ed25519) ────────────────────────
// This is the public key used to verify signatures on curated extensions.
// Extensions signed by the Tatakai marketplace will have their bundle content
// verified against this key before being registered.
//
// Property 9: Signature verification gates installation
// Validates: Requirements 6.3, 6.4, 10.1
//
const TATAKAI_PUBLIC_KEY_PEM = process.env.TATAKAI_EXT_PUBLIC_KEY ||
    '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\n-----END PUBLIC KEY-----';

/**
 * Verifies an Ed25519 signature on an extension bundle.
 *
 * The manifest's `signature` field must be a base64-encoded Ed25519 signature
 * over the raw UTF-8 bytes of the bundle file content.
 *
 * @param {string} bundleContent - Raw UTF-8 content of the extension bundle.
 * @param {string} signatureBase64 - Base64-encoded Ed25519 signature from the manifest.
 * @returns {boolean} `true` if the signature is valid, `false` otherwise.
 */
function verifyExtensionSignature(bundleContent, signatureBase64) {
    try {
        const signatureBuffer = Buffer.from(signatureBase64, 'base64');
        const bundleBuffer = Buffer.from(bundleContent, 'utf8');
        return crypto.verify(
            null, // Ed25519 does not use a separate hash algorithm
            bundleBuffer,
            {
                key: TATAKAI_PUBLIC_KEY_PEM,
                format: 'pem',
                type: 'spki',
                dsaEncoding: 'ieee-p1363',
            },
            signatureBuffer
        );
    } catch (_err) {
        // Any error during verification (malformed key, bad signature format, etc.)
        // is treated as a verification failure.
        return false;
    }
}

module.exports = function registerRuntimeHandlers(ipcMain, app, fs, path, logger, getMainWindow) {
    const emitRuntimeEvent = (event) => {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send('player:event', event);
        }
    };

    // ── Extension runtime singletons ──────────────────────────────────────────
    const registry = new ExtensionRegistry();
    const workerPool = new ExtensionWorkerPool(registry, {
        onSuspend: (extensionId) => {
            const entry = registry.lookup(extensionId);
            if (entry) entry.suspendedAt = Date.now();
            emitRuntimeEvent({ type: 'extension-suspended', extensionId, ts: Date.now() });
        },
    });
    const localProxy = new LocalProxyServer(logger, emitRuntimeEvent);
    const ensureExtensionFetchProxy = async () => {
        const proxyBaseUrl = await localProxy.ensureStarted();
        workerPool.setFetchProxyBaseUrl(proxyBaseUrl);
        return proxyBaseUrl;
    };
    // Generic extension-API host (app-owned, in-process). Serves the
    // streaming-sources-v3 contract for any installed extension whose manifest
    // declares `apiServer` (and is `sideloaded`). Started by main.cjs after
    // extensions auto-load; reuses the same registry + localProxy singletons.
    const extensionApiHost = createExtensionApiHost();
    const warp = new WarpTunnel({ app, fs, path, logger });
    const auditPath = path.join(app.getPath('userData'), 'extension-audit.log');
    const appendAudit = (event, payload) => {
        try {
            const line = JSON.stringify({ ts: Date.now(), event, ...(payload || {}) });
            fs.appendFileSync(auditPath, `${line}\n`, 'utf8');
        } catch (_) { }
    };

    // ── runtime:health ────────────────────────────────────────────────────────
    ipcMain.handle('runtime:health', async () => {
        for (const id of registry.listLoaded()) {
            if (registry.isKillSwitched(id)) {
                workerPool.terminate(id);
                registry.unregister(id);
                logger.warn(`[Extension] Kill-switched extension unloaded: ${id}`);
            }
        }
        return {
            status: 'ok',
            version: app.getVersion(),
            loadedExtensions: registry.listLoaded(),
        };
    });

    // ── electron.listInstalledExtensions ──────────────────────────────────────
    //
    // Returns metadata for all currently registered extensions so that
    // manga-extension-runtime.ts and other frontend consumers can discover
    // which extensions are loaded and what capabilities each one exposes.
    //
    // Return shape: Array<{ id, name, version, type, capabilities: string[] }>
    //
    // `capabilities` is populated from manifest.capabilities (Task 1 — new optional
    // string[] field on ExtensionManifest).  Toko sets ["manga","preview","websiteIndex"].
    // Extensions that have no capabilities field get an empty array.
    //
    // Requirements: 1.5, 12.3
    ipcMain.handle('electron.listInstalledExtensions', async () => {
        const loaded = registry.listLoaded();
        return loaded.map((id) => {
            const entry = registry.lookup(id);
            const manifest = entry ? entry.manifest : {};
            return {
                id,
                name: manifest.name ?? null,
                version: manifest.version ?? null,
                type: manifest.type ?? null,
                capabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities : [],
                apiServer: manifest.apiServer && typeof manifest.apiServer === 'object' ? manifest.apiServer : null,
            };
        });
    });

    // ── runtime:get-api-base ──────────────────────────────────────────────────
    //
    // Returns the base URL of the app-owned extension-API host plus the list of
    // currently mounted namespaces, so the renderer never hardcodes the port.
    // The generic SSE consumer (useExtensionSourceStream) resolves this once and
    // builds `${baseUrl}/api/v3/<namespace>/...` from it.
    //
    // Shape: { baseUrl: string|null, namespaces: Array<{ namespace, extensionId, contract, routes }> }
    ipcMain.handle('runtime:get-api-base', async () => {
        return {
            baseUrl: extensionApiHost.getBaseUrl(),
            namespaces: extensionApiHost.listNamespaces(),
        };
    });

    // ── runtime:resolve-sources ───────────────────────────────────────────────
    ipcMain.handle('runtime:resolve-sources', async (_event, payload) => {
        try {
            const method = String(payload?.method || 'single').toLowerCase();
            const invokeMethod = ['single', 'batch', 'movie'].includes(method) ? method : 'single';
            const preferredExtensions = Array.isArray(payload?.extensionIds)
                ? payload.extensionIds.filter((x) => typeof x === 'string')
                : [];
            const loaded = registry.listLoaded();
            const targetExtensionIds = preferredExtensions.length > 0
                ? preferredExtensions.filter((id) => loaded.includes(id))
                : loaded.slice(); // copy so we can mutate without affecting registry state

            // Requirements: 13.1 — Toko-first ordering
            // Splice tatakai.extension.toko to the front when present but not already first.
            const TOKO_ID_RS = 'tatakai.extension.toko';
            const tokoIdx = targetExtensionIds.indexOf(TOKO_ID_RS);
            if (tokoIdx > 0) {
                targetExtensionIds.splice(tokoIdx, 1);
                targetExtensionIds.unshift(TOKO_ID_RS);
            }

            if (targetExtensionIds.length === 0) {
                appendAudit('runtime-source-fallback', { reason: 'no-loaded-extensions' });
                emitRuntimeEvent({
                    type: 'runtime-source-fallback',
                    reason: 'no-loaded-extensions',
                    ts: Date.now(),
                });
                return { success: true, sources: [], headers: {} };
            }

            await ensureExtensionFetchProxy();

            const sourceOptions = {
                anilistId: Number(payload?.anilistId || 0) || 0,
                titles: Array.isArray(payload?.titles) ? payload.titles : [String(payload?.animeName || '')].filter(Boolean),
                episode: Number(payload?.episodeNumber || payload?.episode || 0) || undefined,
                episodeCount: Number(payload?.episodeCount || 0) || undefined,
                resolution: String(payload?.resolution || '1080p'),
                tatakaiId: payload?.tatakaiId ? String(payload.tatakaiId) : undefined,
                countryCode: payload?.countryCode ? String(payload.countryCode) : undefined,
                preferredLanguage: payload?.preferredLanguage ? String(payload.preferredLanguage) : undefined,
                exclusions: Array.isArray(payload?.exclusions) ? payload.exclusions : [],
            };

            const merged = [];
            for (const extensionId of targetExtensionIds) {
                const entry = registry.lookup(extensionId);
                if (!entry || !fs.existsSync(entry.bundlePath)) continue;
                const extensionCode = fs.readFileSync(entry.bundlePath, 'utf8');
                await workerPool.getOrSpawn(extensionId, extensionCode, entry.manifest);
                let rawResult;
                try {
                    rawResult = await withCallTimeout(
                        workerPool.invoke(extensionId, invokeMethod, [sourceOptions]),
                        extensionId,
                        CALL_TIMEOUT_MS
                    );
                } catch (e) {
                    logger.warn(`[Runtime] extension resolve failed ${extensionId}.${invokeMethod}: ${e.message}`);
                    appendAudit('runtime-source-extension-error', { extensionId, method: invokeMethod, error: e.message });
                    emitRuntimeEvent({
                        type: 'runtime-source-extension-error',
                        extensionId,
                        method: invokeMethod,
                        error: e.message,
                        ts: Date.now(),
                    });
                    continue;
                }
                if (!Array.isArray(rawResult)) continue;
                for (const src of rawResult) {
                    if (!src || typeof src !== 'object' || !src.url) continue;
                    const directUrl = String(src.url);
                    const needsProxy = /^https?:\/\//i.test(directUrl) && src.headers && typeof src.headers === 'object';
                    const proxyUrl = needsProxy
                        ? localProxy.registerSource({ url: directUrl, headers: src.headers })
                        : directUrl;
                    merged.push({
                        url: proxyUrl,
                        isM3U8: /\.m3u8($|\?)/i.test(directUrl),
                        quality: src.quality || 'auto',
                        providerName: src.source || extensionId,
                        providerKey: extensionId,
                        headers: src.headers || {},
                        subtitles: Array.isArray(src.subtitles) ? src.subtitles : [],
                        originalUrl: directUrl,
                    });
                }
            }

            emitRuntimeEvent({
                type: merged.length > 0 ? 'runtime-source-local-hit' : 'runtime-source-fallback',
                reason: merged.length > 0 ? 'local-runtime-success' : 'no-local-sources',
                method: invokeMethod,
                extensionCount: targetExtensionIds.length,
                sourceCount: merged.length,
                ts: Date.now(),
            });
            appendAudit(merged.length > 0 ? 'runtime-source-local-hit' : 'runtime-source-fallback', {
                method: invokeMethod,
                extensionCount: targetExtensionIds.length,
                sourceCount: merged.length,
            });
            return { success: true, sources: merged, headers: {} };
        } catch (err) {
            logger.error('[Runtime] resolve-sources error:', err.message);
            appendAudit('runtime-source-fallback', { reason: 'runtime-resolve-error', error: err.message });
            emitRuntimeEvent({
                type: 'runtime-source-fallback',
                reason: 'runtime-resolve-error',
                error: err.message,
                ts: Date.now(),
            });
            return { success: false, sources: [], error: err.message };
        }
    });

    // ── cache:read / cache:write ──────────────────────────────────────────────
    ipcMain.handle('cache:read', async (_event, key) => {
        const cachePath = path.join(app.getPath('userData'), 'runtime_cache', `${key}.json`);
        try {
            if (fs.existsSync(cachePath)) return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        } catch (e) {
            logger.error('[Cache] Read error:', e);
        }
        return null;
    });

    ipcMain.handle('cache:write', async (_event, { key, value }) => {
        const cacheDir = path.join(app.getPath('userData'), 'runtime_cache');
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(path.join(cacheDir, `${key}.json`), JSON.stringify(value), 'utf8');
        return true;
    });

    // ── extension:load ────────────────────────────────────────────────────────
    //
    // Loads an extension into the registry.
    //
    // Flow:
    //   1. Check kill-switch — blocked extensions are never loaded.
    //   2. Resolve the bundle path under <userData>/extensions/<extensionId>/bundle.js.
    //   3. If the bundle exists on disk AND the extension is NOT sideloaded,
    //      verify the Ed25519 signature from manifest.signature against the bundle
    //      content.  An invalid or missing signature aborts loading without writing
    //      any files (Property 9 / Requirement 10.1).
    //   4. If the bundle does not yet exist, persist the manifest to disk so the
    //      directory is created; the bundle must be written separately before
    //      extension:invoke can succeed.
    //   5. Register the extension in the in-memory ExtensionRegistry.
    //
    // Returns: { success: boolean, error?: string }
    ipcMain.handle('extension:load', async (_event, { extensionId, manifest }) => {
        try {
            // Step 1 — Kill-switch check
            if (registry.isKillSwitched(extensionId)) {
                return { success: false, error: 'Extension is blocked by kill-switch' };
            }

            const extensionsDir = path.join(app.getPath('userData'), 'extensions');
            const bundlePath = path.join(extensionsDir, extensionId, 'bundle.js');

            // Step 2/3 — Signature verification for curated (non-sideloaded) extensions
            if (!manifest.sideloaded) {
                if (fs.existsSync(bundlePath)) {
                    // Bundle is already on disk — verify its signature before (re-)registering.
                    const bundleContent = fs.readFileSync(bundlePath, 'utf8');
                    const signature = manifest.signature;

                    if (!signature) {
                        logger.warn(`[Extension] Load rejected — missing signature: ${extensionId}`);
                        return {
                            success: false,
                            error: 'Extension signature invalid — installation aborted',
                        };
                    }

                    const valid = verifyExtensionSignature(bundleContent, signature);
                    if (!valid) {
                        logger.warn(`[Extension] Load rejected — invalid signature: ${extensionId}`);
                        return {
                            success: false,
                            error: 'Extension signature invalid — installation aborted',
                        };
                    }

                    logger.info(`[Extension] Signature verified: ${extensionId}`);
                } else {
                    // Bundle not yet on disk — verify the signature field is present so
                    // that when the bundle is later written and the extension is re-loaded,
                    // the signature check will have something to verify against.
                    if (!manifest.signature) {
                        logger.warn(`[Extension] Load rejected — missing signature (no bundle): ${extensionId}`);
                        return {
                            success: false,
                            error: 'Extension signature invalid — installation aborted',
                        };
                    }

                    // Persist the manifest directory so the bundle can be written later.
                    const extDir = path.join(extensionsDir, extensionId);
                    if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true });
                    fs.writeFileSync(
                        path.join(extDir, 'manifest.json'),
                        JSON.stringify(manifest, null, 2),
                        'utf8'
                    );
                }
            } else {
                // Step 4 — Sideloaded extension: skip signature verification.
                // Persist manifest directory if bundle is not yet present.
                if (!fs.existsSync(bundlePath)) {
                    const extDir = path.join(extensionsDir, extensionId);
                    if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true });
                    fs.writeFileSync(
                        path.join(extDir, 'manifest.json'),
                        JSON.stringify(manifest, null, 2),
                        'utf8'
                    );
                }
                logger.info(`[Extension] Sideloaded (signature skipped): ${extensionId}`);
            }

            // Step 5 — Register in the in-memory registry
            registry.register(extensionId, manifest, bundlePath);
            logger.info(`[Extension] Loaded: ${extensionId} v${manifest.version}`);
            appendAudit('extension-load', { extensionId, version: manifest.version, sideloaded: !!manifest.sideloaded });
            return { success: true };
        } catch (err) {
            logger.error(`[Extension] Load failed for ${extensionId}:`, err);
            appendAudit('extension-load-error', { extensionId, error: err.message });
            return { success: false, error: err.message };
        }
    });

    // ── extension:unload ──────────────────────────────────────────────────────
    ipcMain.handle('extension:unload', async (_event, extensionId) => {
        try {
            workerPool.terminate(extensionId);
            registry.unregister(extensionId);
            logger.info(`[Extension] Unloaded: ${extensionId}`);
            appendAudit('extension-unload', { extensionId });
            return { success: true };
        } catch (err) {
            logger.error(`[Extension] Unload failed for ${extensionId}:`, err);
            appendAudit('extension-unload-error', { extensionId, error: err.message });
            return { success: false, error: err.message };
        }
    });

    // ── extension:invoke ──────────────────────────────────────────────────────
    ipcMain.handle('extension:invoke', async (_event, { extensionId, method, args }) => {
        // ── Toko-specific IPC methods ─────────────────────────────────────────
        // Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
        const TOKO_ID = 'tatakai.extension.toko';
        // The payload for Toko-specific methods is the first element of args
        // (or args itself when it is not an array, mirroring caller convention).
        const tokoPayload = Array.isArray(args) ? args[0] : args;

        if (method === 'getPreviewSource') {
            try {
                const tokoEntry = registry.lookup(TOKO_ID);
                if (!tokoEntry) {
                    return { success: false, error: 'toko_not_loaded' };
                }
                if (!fs.existsSync(tokoEntry.bundlePath)) {
                    return { success: false, error: 'toko_not_loaded' };
                }
                await ensureExtensionFetchProxy();
                const tokoCode = fs.readFileSync(tokoEntry.bundlePath, 'utf8');
                await workerPool.getOrSpawn(TOKO_ID, tokoCode, tokoEntry.manifest);
                const result = await workerPool.invoke(TOKO_ID, 'getPreviewSource', [tokoPayload]);
                return { success: true, data: result };
            } catch (err) {
                logger.error('[Extension] getPreviewSource error:', err.message);
                return { success: false, error: err.message };
            }
        }

        if (method === 'getWebsiteEpisodeIndex') {
            try {
                const tokoEntry = registry.lookup(TOKO_ID);
                if (!tokoEntry) {
                    return { success: false, error: 'toko_not_loaded' };
                }
                if (!fs.existsSync(tokoEntry.bundlePath)) {
                    return { success: false, error: 'toko_not_loaded' };
                }
                await ensureExtensionFetchProxy();
                const tokoCode = fs.readFileSync(tokoEntry.bundlePath, 'utf8');
                await workerPool.getOrSpawn(TOKO_ID, tokoCode, tokoEntry.manifest);
                const result = await workerPool.invoke(TOKO_ID, 'getWebsiteEpisodeIndex', [tokoPayload]);
                return { success: true, data: result };
            } catch (err) {
                logger.error('[Extension] getWebsiteEpisodeIndex error:', err.message);
                return { success: false, error: err.message };
            }
        }

        if (method === 'getMangaChapters') {
            try {
                const tokoEntry = registry.lookup(TOKO_ID);
                if (!tokoEntry) {
                    return { success: false, error: 'toko_not_loaded' };
                }
                if (!fs.existsSync(tokoEntry.bundlePath)) {
                    return { success: false, error: 'toko_not_loaded' };
                }
                await ensureExtensionFetchProxy();
                const tokoCode = fs.readFileSync(tokoEntry.bundlePath, 'utf8');
                await workerPool.getOrSpawn(TOKO_ID, tokoCode, tokoEntry.manifest);
                const result = await workerPool.invoke(TOKO_ID, 'getMangaChapters', [tokoPayload]);
                return { success: true, data: result };
            } catch (err) {
                logger.error('[Extension] getMangaChapters error:', err.message);
                return { success: false, error: err.message };
            }
        }

        // ── Generic extension invoke fallthrough ──────────────────────────────
        const entry = registry.lookup(extensionId);
        if (!entry) return { success: false, error: 'Extension not loaded' };
        if (registry.isKillSwitched(extensionId)) return { success: false, error: 'Extension is blocked by kill-switch' };
        if (entry.suspendedAt !== null) return { success: false, error: 'Extension is suspended (cumulative timeout exceeded)' };

        try {
            if (!fs.existsSync(entry.bundlePath)) {
                return { success: false, error: `Extension bundle not found: ${entry.bundlePath}` };
            }
            await ensureExtensionFetchProxy();
            const extensionCode = fs.readFileSync(entry.bundlePath, 'utf8');
            await workerPool.getOrSpawn(extensionId, extensionCode, entry.manifest);

            const startedAt = Date.now();
            const rawResult = await withCallTimeout(
                workerPool.invoke(extensionId, method, Array.isArray(args) ? args : [args]),
                extensionId,
                CALL_TIMEOUT_MS
            );
            const elapsed = Date.now() - startedAt;

            entry.cumulativeMs += elapsed;
            if (entry.cumulativeMs >= 120_000) {
                entry.suspendedAt = Date.now();
                workerPool.terminate(extensionId);
                const win = getMainWindow();
                if (win && !win.isDestroyed()) {
                    win.webContents.send('player:event', { type: 'extension-suspended', extensionId });
                }
                logger.warn(`[Extension] Suspended (cumulative timeout): ${extensionId}`);
            }

            return enforcePayloadLimit({ success: true, result: rawResult });
        } catch (err) {
            logger.error(`[Extension] Invoke error (${extensionId}.${method}):`, err.message);
            appendAudit('extension-invoke-error', { extensionId, method, error: err.message });
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('extension:set-kill-switch', async (_event, extensionId, blocked) => {
        registry.setKillSwitch(extensionId, !!blocked);
        appendAudit('extension-kill-switch', { extensionId, blocked: !!blocked });
        return { success: true, extensionId, blocked: !!blocked };
    });

    ipcMain.handle('extension:get-audit-log', async (_event, limit = 200) => {
        try {
            if (!fs.existsSync(auditPath)) return [];
            const lines = fs.readFileSync(auditPath, 'utf8').split(/\r?\n/).filter(Boolean);
            return lines.slice(-Math.max(1, Number(limit) || 200)).map((line) => {
                try { return JSON.parse(line); } catch { return null; }
            }).filter(Boolean);
        } catch {
            return [];
        }
    });

    ipcMain.handle('extension:sideload-manifest', async (_event, manifestInput, bundleCode) => {
        try {
            const manifest = typeof manifestInput === 'string' ? JSON.parse(manifestInput) : manifestInput;
            const required = ['id', 'name', 'version', 'type', 'permissions'];
            const missing = required.filter((k) => manifest?.[k] == null || manifest?.[k] === '');
            if (missing.length > 0) return { success: false, error: `missing_fields:${missing.join(',')}` };
            const extensionId = String(manifest.id);
            const extensionsDir = path.join(app.getPath('userData'), 'extensions', extensionId);
            if (!fs.existsSync(extensionsDir)) fs.mkdirSync(extensionsDir, { recursive: true });
            const normalizedManifest = { ...manifest, sideloaded: true };
            fs.writeFileSync(path.join(extensionsDir, 'manifest.json'), JSON.stringify(normalizedManifest, null, 2), 'utf8');
            if (bundleCode && typeof bundleCode === 'string') {
                fs.writeFileSync(path.join(extensionsDir, 'bundle.js'), bundleCode, 'utf8');
            }
            registry.register(extensionId, normalizedManifest, path.join(extensionsDir, 'bundle.js'));
            appendAudit('extension-sideload', { extensionId });
            return { success: true, extensionId };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // ── network:get-warp-status ───────────────────────────────────────────────
    ipcMain.handle('network:get-warp-status', async () => {
        return warp.getStatus();
    });

    // ── network:toggle-warp ───────────────────────────────────────────────────
    ipcMain.handle('network:toggle-warp', async (_event, enabled) => {
        logger.info(`[Network] WARP toggled: ${enabled}`);
        return warp.toggle(enabled);
    });

    ipcMain.handle('network:set-warp-mode', async (_event, mode) => warp.setMode(mode));
    ipcMain.handle('network:warp-route-decision', async (_event, url, context) => ({
        shouldRoute: warp.shouldRoute(url, context),
    }));
    ipcMain.handle('network:get-warp-routing-log', async () => warp.getRoutingLog());

    // ── runtime:cloudflare-bypass-config ──────────────────────────────────────
    // Configure Cloudflare bypass settings
    ipcMain.handle('runtime:cloudflare-bypass-config', async (_event, config) => {
        try {
            if (config.enabled !== undefined) {
                localProxy.setCloudflareBypass(config.enabled);
            }
            if (config.mode !== undefined) {
                localProxy.setBypassMode(config.mode);
            }
            return { success: true };
        } catch (err) {
            logger.error('[Runtime] Cloudflare bypass config error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // ── runtime:cloudflare-bypass-status ──────────────────────────────────────
    // Get Cloudflare bypass status
    ipcMain.handle('runtime:cloudflare-bypass-status', async () => {
        return {
            enabled: localProxy.isCloudflareBypassEnabled(),
            mode: localProxy.getBypassMode(),
        };
    });

    // ── runtime:flaresolverr-config ───────────────────────────────────────────
    // Configure FlareSolverr
    ipcMain.handle('runtime:flaresolverr-config', async (_event, config) => {
        try {
            const result = await localProxy.configureFlareSolverr(config);
            return { success: true, ...result };
        } catch (err) {
            logger.error('[Runtime] FlareSolverr config error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // ── runtime:flaresolverr-status ───────────────────────────────────────────
    // Get FlareSolverr status
    ipcMain.handle('runtime:flaresolverr-status', async () => {
        const config = localProxy.getFlareSolverrStatus();
        const available = config.enabled ? await localProxy._flaresolverr.isAvailable() : false;
        return { ...config, available };
    });

    // ── runtime:embedded-flaresolverr-start ───────────────────────────────────
    // Start embedded FlareSolverr
    ipcMain.handle('runtime:embedded-flaresolverr-start', async () => {
        try {
            const result = await localProxy.startEmbeddedFlareSolverr();
            return result;
        } catch (err) {
            logger.error('[Runtime] Failed to start embedded FlareSolverr:', err.message);
            return { success: false, error: err.message };
        }
    });

    // ── runtime:embedded-flaresolverr-stop ────────────────────────────────────
    // Stop embedded FlareSolverr
    ipcMain.handle('runtime:embedded-flaresolverr-stop', async () => {
        try {
            const result = await localProxy.stopEmbeddedFlareSolverr();
            return result;
        } catch (err) {
            logger.error('[Runtime] Failed to stop embedded FlareSolverr:', err.message);
            return { success: false, error: err.message };
        }
    });

    // ── runtime:embedded-flaresolverr-status ──────────────────────────────────
    // Get embedded FlareSolverr status
    ipcMain.handle('runtime:embedded-flaresolverr-status', async () => {
        return localProxy.getEmbeddedFlareSolverrStatus();
    });

    // ── runtime:bypass-mode ───────────────────────────────────────────────────
    // Set the Cloudflare bypass mode: playwright | flaresolverr | embedded
    ipcMain.handle('runtime:bypass-mode', async (_event, mode) => {
        try {
            localProxy.setBypassMode(mode);
            logger?.info(`[IPC] Bypass mode set to: ${mode}`);
            return { success: true, mode };
        } catch (err) {
            logger?.warn(`[IPC] Failed to set bypass mode: ${err.message}`);
            return { success: false, error: err.message };
        }
    });

    // ── extension:load-kai ─────────────────────────────────────────────────────
    // Accepts a raw .kai file buffer from the renderer (via file picker or URL download)
    // Parses, validates, installs, and registers the extension.
    ipcMain.handle('extension:load-kai', async (_event, { kaiBuffer, skipSignatureCheck }) => {
        try {
            let buf;
            if (Buffer.isBuffer(kaiBuffer)) {
                buf = kaiBuffer;
            } else if (kaiBuffer instanceof Uint8Array) {
                buf = Buffer.from(kaiBuffer);
            } else if (kaiBuffer && typeof kaiBuffer === 'object') {
                buf = Buffer.from(Object.values(kaiBuffer));
            } else {
                return { success: false, error: 'invalid_kai_buffer' };
            }

            const parsed = await parseKaiFile(buf, { skipSignatureCheck: !!skipSignatureCheck });
            const extensionId = parsed.manifest.id;

            if (registry.isKillSwitched(extensionId)) {
                return { success: false, error: 'Extension is blocked by kill-switch' };
            }

            const extensionsDir = path.join(app.getPath('userData'), 'extensions');
            const { bundlePath } = installKaiExtension(parsed, extensionsDir, fs, path);

            registry.register(extensionId, parsed.manifest, bundlePath);
            appendAudit('extension-load-kai', {
                extensionId,
                version: parsed.manifest.version,
                sideloaded: parsed.isSideloaded,
                signatureValid: parsed.signatureValid,
            });

            logger.info(`[Extension] .kai loaded: ${extensionId} v${parsed.manifest.version} sideloaded=${parsed.isSideloaded}`);

            return {
                success: true,
                extensionId,
                manifest: parsed.manifest,
                hasReadme: !!parsed.readme,
                hasIcon: !!parsed.iconBase64,
                isSideloaded: parsed.isSideloaded,
                signatureValid: parsed.signatureValid,
            };
        } catch (err) {
            logger.error('[Extension] .kai load failed:', err.message);
            appendAudit('extension-load-kai-error', { error: err.message });
            return { success: false, error: err.message };
        }
    });

    // ── extension:submit ──────────────────────────────────────────────────────
    //
    // Submits a .kai extension bundle to the Tatakai marketplace.
    //
    // Flow:
    //   1. Parse the .kai buffer using parseKaiFile() (skipSignatureCheck: true for submissions).
    //   2. Validate required manifest fields: id, name, version, type.
    //   3. Reject bundles exceeding 10 MB.
    //   4. POST the manifest JSON to ${TATAKAI_API_BASE}/extensions/submit.
    //   5. On success, append an audit log entry and return { success, submissionId, status }.
    //   6. On network failure (ECONNREFUSED / 503), return marketplace_unavailable.
    //
    // Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6
    ipcMain.handle('extension:submit', async (_event, { kaiBuffer, metadata }) => {
        try {
            // Electron contextBridge sends Uint8Array as Buffer on the main-process side.
            // Handle all possible forms: Buffer, Uint8Array, or plain object {0:b,1:b,...}
            let buf;
            if (Buffer.isBuffer(kaiBuffer)) {
                buf = kaiBuffer;
            } else if (kaiBuffer instanceof Uint8Array) {
                buf = Buffer.from(kaiBuffer);
            } else if (kaiBuffer && typeof kaiBuffer === 'object') {
                // Fallback: plain object from older serialisation path
                buf = Buffer.from(Object.values(kaiBuffer));
            } else {
                return { success: false, error: 'invalid_kai_buffer' };
            }

            // Requirement 14.6 — reject oversized bundles before any parsing or network call
            const MAX_KAI_BYTES = 10 * 1024 * 1024; // 10 MB
            if (buf.length > MAX_KAI_BYTES) {
                return { success: false, error: 'bundle_too_large' };
            }

            // Requirement 14.1 — parse and validate the .kai manifest before any network request
            let parsed;
            try {
                parsed = await parseKaiFile(buf, { skipSignatureCheck: true });
            } catch (parseErr) {
                return { success: false, error: parseErr.message };
            }

            const manifest = parsed.manifest;

            // Merge form metadata as fallback for fields missing from the .kai manifest.
            // This lets users submit extensions where the manifest has minimal fields,
            // with the form providing the display name, description, type, etc.
            const effectiveManifest = {
                id: manifest.id || metadata?.id,
                name: manifest.name || metadata?.name,
                version: manifest.version || metadata?.version || '1.0.0',
                type: manifest.type || metadata?.type,
                description: manifest.description || metadata?.description || '',
                permissions: Array.isArray(manifest.permissions) ? manifest.permissions
                    : (Array.isArray(metadata?.permissions) ? metadata.permissions : []),
            };

            // Requirement 14.2 — validate required fields: id, name, version, type
            const requiredFields = ['id', 'name', 'version', 'type'];
            const missingFields = requiredFields.filter(
                (k) => !effectiveManifest[k] || String(effectiveManifest[k]).trim() === ''
            );
            if (missingFields.length > 0) {
                return {
                    success: false,
                    error: `missing_required_fields: ${missingFields.join(', ')} — ensure your .kai manifest.json contains these fields`,
                };
            }

            // Requirement 14.3 — POST manifest to TatakaiAPI public submission endpoint
            const response = await axios.post(
                `${TATAKAI_API_BASE}/extensions/submit`,
                {
                    extension_id: effectiveManifest.id,
                    name: effectiveManifest.name,
                    version: effectiveManifest.version,
                    type: effectiveManifest.type,
                    main_url: metadata?.mainUrl || '',
                    update_url: metadata?.updateUrl || null,
                    description: effectiveManifest.description,
                    permissions: effectiveManifest.permissions,
                    signature: metadata?.signature || manifest.signature || null,
                    signed_by: metadata?.signedBy || null,
                },
                { timeout: 30000 }
            );

            // Requirement 14.4 — append audit log entry on success
            appendAudit('extension-submit', {
                extensionId: effectiveManifest.id,
                submissionId: effectiveManifest.id,
                version: effectiveManifest.version,
            });

            logger.info(`[Extension] Submitted to marketplace: ${effectiveManifest.id} v${effectiveManifest.version}`);

            return { success: true, submissionId: effectiveManifest.id, status: 'pending' };
        } catch (err) {
            // Requirement 14.5 — return marketplace_unavailable on ECONNREFUSED or 503
            if (err.code === 'ECONNREFUSED' || err.response?.status === 503) {
                return { success: false, error: 'marketplace_unavailable' };
            }
            logger.error('[Extension] Submit failed:', err.message);
            return { success: false, error: err.message };
        }
    });

    // ── extension:get-kai-meta ────────────────────────────────────────────────    // Returns manifest + readme + icon for an already-installed extension.
    ipcMain.handle('extension:get-kai-meta', async (_event, extensionId) => {
        try {
            const extDir = path.join(app.getPath('userData'), 'extensions', extensionId);
            if (!fs.existsSync(extDir)) return { success: false, error: 'not_installed' };

            const manifestPath = path.join(extDir, 'manifest.json');
            const manifest = fs.existsSync(manifestPath)
                ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
                : null;

            const readmePath = path.join(extDir, 'README.md');
            const readme = fs.existsSync(readmePath)
                ? fs.readFileSync(readmePath, 'utf8')
                : null;

            const iconPath = path.join(extDir, 'icon.png');
            let iconBase64 = null;
            if (fs.existsSync(iconPath)) {
                iconBase64 = `data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}`;
            }

            return { success: true, manifest, readme, iconBase64 };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // ── extension:get-source-code ─────────────────────────────────────────────
    //
    // Returns the bundle.js source code for an installed extension.
    //
    // Security constraints (Requirement 17.5):
    //   - Only reads from <userData>/extensions/<extensionId>/bundle.js
    //   - Validates the resolved path starts with the extensions directory to
    //     prevent path traversal attacks
    //   - Never writes to disk, executes code, or accesses paths outside the
    //     extensions directory
    //
    // Truncation (Requirements 17.2, 17.3):
    //   - If the file exceeds 50 KB (51200 bytes), returns the first 50 KB with
    //     truncated: true and totalBytes set to the full file size
    //   - Otherwise returns the complete content with truncated: false
    //
    // Returns: { success: true, source, truncated, totalBytes }
    //       or { success: false, error: string }
    ipcMain.handle('extension:get-source-code', async (_event, extensionId) => {
        try {
            // Requirement 17.4 — look up extensionId in registry
            const entry = registry.lookup(extensionId);
            if (!entry) {
                return { success: false, error: 'Extension not loaded' };
            }

            // Requirement 17.5 — only read from the canonical extensions path;
            // validate the resolved path to prevent path traversal
            const extensionsDir = path.join(app.getPath('userData'), 'extensions');
            const bundlePath = path.join(extensionsDir, extensionId, 'bundle.js');

            // Normalise both paths to catch traversal attempts (e.g. extensionId = '../../etc')
            const resolvedBundle = path.resolve(bundlePath);
            const resolvedExtDir = path.resolve(extensionsDir);

            if (!resolvedBundle.startsWith(resolvedExtDir + path.sep)) {
                logger.warn(`[Extension] get-source-code path traversal attempt: ${extensionId}`);
                return { success: false, error: 'Extension not loaded' };
            }

            if (!fs.existsSync(resolvedBundle)) {
                return { success: false, error: 'Extension bundle not found' };
            }

            const MAX_BYTES = 50 * 1024; // 50 KB

            // Read the full file to determine total size, then slice if needed
            const rawBuffer = fs.readFileSync(resolvedBundle);
            const totalBytes = rawBuffer.length;

            if (totalBytes > MAX_BYTES) {
                // Requirement 17.2 — return first 50 KB with truncated: true
                const source = rawBuffer.slice(0, MAX_BYTES).toString('utf8');
                return { success: true, source, truncated: true, totalBytes };
            }

            // Requirement 17.3 — return full content with truncated: false
            const source = rawBuffer.toString('utf8');
            return { success: true, source, truncated: false, totalBytes };
        } catch (err) {
            logger.error(`[Extension] get-source-code error (${extensionId}):`, err.message);
            return { success: false, error: err.message };
        }
    });

    // ── extension:review-status ───────────────────────────────────────────────
    //
    // Polls the TatakaiAPI for the current review status of a submitted extension.
    //
    // Flow:
    //   GET ${TATAKAI_API_BASE}/extensions/:submissionId/status
    //   Maps API response fields:
    //     - submission_status → status
    //     - main_url          → downloadUrl (only when submission_status === 'approved')
    //     - notes             → notes
    //     - updated_at        → approvedAt
    //
    // Requirements: 15.1, 15.2, 15.3, 15.4
    ipcMain.handle('extension:review-status', async (_event, { submissionId }) => {
        try {
            const response = await axios.get(
                `${TATAKAI_API_BASE}/extensions/${encodeURIComponent(submissionId)}/status`,
                { timeout: 10000 }
            );
            const row = response.data?.data;
            return {
                success: true,
                submissionId,
                // Requirement 15.2 — include status, notes, approvedAt, downloadUrl
                status: row?.submission_status ?? 'pending',
                notes: row?.notes ?? null,
                approvedAt: row?.updated_at ?? null,
                // Requirement 15.3 — downloadUrl is non-null only when approved
                downloadUrl: row?.submission_status === 'approved' ? (row?.main_url ?? null) : null,
            };
        } catch (err) {
            // Requirement 15.4 — return { success: false, error: '...' } on failure
            logger.error(`[Extension] review-status error (${submissionId}):`, err.message);
            return { success: false, error: err.message };
        }
    });

    // ── torrent IPC is registered by ipc-torrent.cjs ───────────────────────────

    // ── autoLoadBundledExtensions ─────────────────────────────────────────────
    //
    // Scans the bundled extension directory on startup and registers every
    // subdirectory that contains both dist/bundle.js and manifest.json.
    //
    // In development:  path.join(__dirname, '..', 'extension')
    // In production:   path.join(process.resourcesPath, 'extension')
    //
    // For each valid subdir:
    //   - Skips kill-switched extensions
    //   - Parses manifest.json (logs warning + continues on parse error)
    //   - Calls registry.register(manifest.id, manifest, bundlePath)
    //   - Logs success or warning per entry
    //
    // Validates: Requirements 2.1.1, 2.1.2, 2.1.3, 2.1.4, 3.1, 3.3
    function autoLoadBundledExtensions(fsArg, pathArg, loggerArg, appArg) {
        const isPackaged = appArg.isPackaged;
        // __dirname is desktop/ipc/ — go up two levels to reach the repo root's extension/ dir
        const extensionBaseDir = isPackaged
            ? pathArg.join(process.resourcesPath, 'extension')
            : pathArg.join(__dirname, '..', '..', 'extension');

        console.log('[AutoLoad] Starting bundled extension scan');
        console.log('[AutoLoad] isPackaged:', isPackaged);
        console.log('[AutoLoad] extensionBaseDir:', extensionBaseDir);
        console.log('[AutoLoad] __dirname:', __dirname);

        let subdirs;
        try {
            subdirs = fsArg.readdirSync(extensionBaseDir);
            console.log('[AutoLoad] Found subdirs:', subdirs);
        } catch (err) {
            console.error('[AutoLoad] Cannot read extension dir:', extensionBaseDir, err.message);
            loggerArg.warn(`[Extensions] Auto-load: cannot read extension dir ${extensionBaseDir}: ${err.message}`);
            return;
        }

        for (const dirName of subdirs) {
            try {
                const subpath = pathArg.join(extensionBaseDir, dirName);

                // Only process directories
                let stat;
                try {
                    stat = fsArg.statSync(subpath);
                } catch (err) {
                    console.warn('[AutoLoad] statSync failed for', dirName, err.message);
                    loggerArg.warn(`[Extensions] Auto-load skipped ${dirName}: ${err.message}`);
                    continue;
                }
                if (!stat.isDirectory()) {
                    console.log('[AutoLoad] Skipping (not a dir):', dirName);
                    continue;
                }

                const bundlePath = pathArg.join(subpath, 'dist', 'bundle.js');
                const manifestPath = pathArg.join(subpath, 'manifest.json');

                const bundleExists = fsArg.existsSync(bundlePath);
                const manifestExists = fsArg.existsSync(manifestPath);
                console.log(`[AutoLoad] ${dirName} — bundle:${bundleExists} manifest:${manifestExists}`);
                console.log(`[AutoLoad]   bundlePath: ${bundlePath}`);
                console.log(`[AutoLoad]   manifestPath: ${manifestPath}`);

                // Both files must exist
                if (!bundleExists || !manifestExists) {
                    console.warn('[AutoLoad] Skipping (missing files):', dirName);
                    continue;
                }

                // Parse manifest
                let manifest;
                try {
                    manifest = JSON.parse(fsArg.readFileSync(manifestPath, 'utf8'));
                    console.log('[AutoLoad] Parsed manifest for', dirName, '— id:', manifest.id, 'v', manifest.version);
                } catch (err) {
                    console.error('[AutoLoad] Manifest parse failed for', dirName, err.message);
                    loggerArg.warn(`[Extensions] Auto-load skipped ${dirName}: ${err.message}`);
                    continue;
                }

                const extensionId = manifest.id;
                if (!extensionId) {
                    console.warn('[AutoLoad] Manifest missing id for', dirName);
                    loggerArg.warn(`[Extensions] Auto-load skipped ${dirName}: manifest missing id`);
                    continue;
                }

                // Skip kill-switched extensions
                if (registry.isKillSwitched(extensionId)) {
                    console.warn('[AutoLoad] Kill-switched, skipping:', extensionId);
                    loggerArg.warn(`[Extensions] Auto-load skipped ${dirName}: kill-switched`);
                    continue;
                }

                registry.register(extensionId, manifest, bundlePath);
                console.log('[AutoLoad] ✅ Registered:', extensionId, 'bundlePath:', bundlePath);
                loggerArg.info(`[Toko] Auto-loaded ${manifest.id} v${manifest.version}`);
            } catch (err) {
                console.error('[AutoLoad] Unexpected error for', dirName, err.message);
                loggerArg.warn(`[Extensions] Auto-load skipped ${dirName}: ${err.message}`);
            }
        }

        console.log('[AutoLoad] Scan complete. Loaded extensions:', registry.listLoaded());
    }

    // Expose registry/workerPool and autoLoadBundledExtensions for main.cjs
    return {
        registry,
        workerPool,
        autoLoadBundledExtensions,
        ensureExtensionFetchProxy,
        extensionApiHost, // Generic extension-API host — main.cjs starts/stops it
        localProxy, // Expose for debugging
    };
};
