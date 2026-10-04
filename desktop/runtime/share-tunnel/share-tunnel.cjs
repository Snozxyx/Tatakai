'use strict';

/**
 * share-tunnel.cjs
 *
 * Host-hosted watch-party streaming. The desktop host resolves a stream
 * locally (via the toko extension + LocalProxyServer, which mints a
 * loopback `/stream/<token>` URL) and then exposes the proxy port to the
 * internet through a Cloudflare **quick tunnel** (`cloudflared tunnel --url`).
 * Every participant — on any platform — plays the host's single public URL,
 * synced to the host clock, so a watch party shares one real source.
 *
 * Quick tunnels are zero-config and ephemeral: each run gets a fresh random
 * `https://<name>.trycloudflare.com` URL and needs no Cloudflare account. The
 * URL changes on every (re)start, so a restart requires the host to republish
 * the new URL to the room — we therefore do NOT silently auto-restart; an
 * unexpected exit is surfaced via getStatus() and the renderer republishes.
 *
 * `cloudflared` is bundled per-platform under resources/bin (electron-builder
 * extraResources); if it's missing we fall back to a `cloudflared` on PATH,
 * then to a previously auto-installed copy in <userData>/bin. If none exist we
 * **auto-install** it: download the official per-platform/per-arch binary from
 * Cloudflare's GitHub releases (same assets the CI bundles) via the command
 * line (`curl`, falling back to PowerShell on Windows / `wget` on unix) into
 * <userData>/bin — a writable, app-owned dir, so no admin/UAC or PATH juggling.
 * Only if the download also fails does hosting degrade to a host-pasted URL.
 */

const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const BINARY_NAME = IS_WIN ? 'cloudflared.exe' : 'cloudflared';
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const START_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 180_000; // cloudflared is tens of MB; allow slow links
const RELEASE_BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download';
const MIN_BINARY_BYTES = 1_000_000; // sanity floor — a real cloudflared is >15MB

function createShareTunnel({ logger, app, path, fs } = {}) {
    let child = null;
    let publicUrl = null;
    let starting = null; // in-flight start() promise
    let lastError = null;
    let targetUrl = null;
    let resolvedBinary = undefined; // undefined = not looked up yet, null = not found
    let installing = null; // in-flight auto-install promise (dedupes concurrent starts)
    let installState = 'idle'; // idle | installing | installed | failed

    const log = {
        info: (m) => logger?.info?.(`[ShareTunnel] ${m}`),
        warn: (m) => logger?.warn?.(`[ShareTunnel] ${m}`),
        error: (m) => logger?.error?.(`[ShareTunnel] ${m}`),
    };

    /** The app-owned, always-writable dir where we cache an auto-installed binary. */
    function cacheDir() {
        return path.join(app.getPath('userData'), 'bin');
    }

    /**
     * A path is spawnable only if it's a real file on disk. Files that live
     * *inside* an asar archive (…/app.asar/…) pass `fs.existsSync` — Electron's
     * asar-aware fs reports them as present — but cannot be executed by spawn(),
     * which throws ENOENT. `app.asar.unpacked` is a real dir, so allow that.
     * This is the exact bug behind the reported
     * "spawn …\app.asar\resources\bin\cloudflared.exe ENOENT".
     */
    function isSpawnable(p) {
        if (!p) return false;
        const norm = String(p).replace(/\\/g, '/');
        if (norm.includes('/app.asar/') && !norm.includes('/app.asar.unpacked/')) return false;
        try { return fs.existsSync(p); } catch (_) { return false; }
    }

    /** Locate the cloudflared binary: env override → bundled → dev → cache → PATH. */
    async function findBinary() {
        if (resolvedBinary !== undefined) return resolvedBinary;

        const candidates = [];
        if (process.env.CLOUDFLARED_PATH) candidates.push(process.env.CLOUDFLARED_PATH);
        // Bundled (prod): <resources>/bin/cloudflared[.exe] — copied here by
        // electron-builder `extraResources`, so it's a real spawnable file.
        if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'bin', BINARY_NAME));
        // Dev: <projectRoot>/resources/bin/cloudflared[.exe]. In a packaged build
        // app.getAppPath() is …/app.asar, so this candidate resolves inside the
        // archive — isSpawnable() rejects it (see above) and we fall through.
        try { candidates.push(path.join(app.getAppPath(), 'resources', 'bin', BINARY_NAME)); } catch (_) {}
        // Unpacked variant, in case resources/bin is ever asarUnpack'd instead of
        // shipped via extraResources.
        try { candidates.push(path.join(app.getAppPath().replace(/app\.asar([\\/]|$)/, 'app.asar.unpacked$1'), 'resources', 'bin', BINARY_NAME)); } catch (_) {}
        // Previously auto-installed: <userData>/bin/cloudflared[.exe]
        try { candidates.push(path.join(cacheDir(), BINARY_NAME)); } catch (_) {}

        for (const c of candidates) {
            if (isSpawnable(c)) { resolvedBinary = c; return c; }
        }

        // PATH fallback
        try {
            const finder = IS_WIN ? 'where' : 'which';
            const { stdout } = await execFileAsync(finder, ['cloudflared'], { timeout: 3000 });
            const first = String(stdout || '').trim().split('\n')[0]?.trim();
            if (first) { resolvedBinary = first; return first; }
        } catch (_) {}

        resolvedBinary = null;
        return null;
    }

    /**
     * Download `url` to `dest` from the command line. Prefers `curl` (shipped on
     * Windows 10+/macOS/most Linux), falling back to PowerShell on Windows and
     * `wget` on unix. Throws if every downloader fails or the file is too small.
     */
    async function downloadFile(url, dest) {
        const attempts = [
            ['curl', ['-fL', '--retry', '2', '--connect-timeout', '15', url, '-o', dest]],
        ];
        if (IS_WIN) {
            attempts.push(['powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
                `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '${url}' -OutFile '${dest}'`]]);
        } else {
            attempts.push(['wget', ['-O', dest, url]]);
        }

        let lastErr = null;
        for (const [cmd, args] of attempts) {
            try {
                log.info(`downloading via ${cmd}: ${url}`);
                await execFileAsync(cmd, args, { timeout: DOWNLOAD_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
                if (fs.existsSync(dest) && fs.statSync(dest).size >= MIN_BINARY_BYTES) return true;
                lastErr = new Error(`downloaded file missing or too small`);
            } catch (err) {
                lastErr = err;
                log.warn(`${cmd} download failed: ${err?.message || err}`);
            }
            try { if (fs.existsSync(dest) && fs.statSync(dest).size < MIN_BINARY_BYTES) fs.unlinkSync(dest); } catch (_) {}
        }
        throw new Error(`download failed: ${lastErr?.message || 'no downloader available'}`);
    }

    /**
     * Auto-install cloudflared into <userData>/bin by downloading the official
     * per-platform/per-arch release asset (the same assets the CI bundles).
     * Returns the installed path, or null on failure.
     */
    async function installBinary() {
        const dir = cacheDir();
        try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
        const dest = path.join(dir, BINARY_NAME);

        // Windows only ships amd64/386 exes (arm64 Windows runs amd64 emulated);
        // mac/linux ship amd64 + arm64.
        const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';

        if (IS_WIN) {
            await downloadFile(`${RELEASE_BASE}/cloudflared-windows-amd64.exe`, dest);
        } else if (IS_MAC) {
            const tgz = path.join(dir, 'cloudflared.tgz');
            await downloadFile(`${RELEASE_BASE}/cloudflared-darwin-${arch}.tgz`, tgz);
            await execFileAsync('tar', ['-xzf', tgz, '-C', dir], { timeout: 60_000 });
            try { fs.unlinkSync(tgz); } catch (_) {}
            try { fs.chmodSync(dest, 0o755); } catch (_) {}
        } else {
            await downloadFile(`${RELEASE_BASE}/cloudflared-linux-${arch}`, dest);
            try { fs.chmodSync(dest, 0o755); } catch (_) {}
        }

        if (fs.existsSync(dest) && fs.statSync(dest).size >= MIN_BINARY_BYTES) return dest;
        return null;
    }

    /**
     * Resolve cloudflared, auto-installing it on first use if it's not bundled
     * and not on PATH. Concurrent callers share one in-flight install.
     */
    async function ensureBinary() {
        const found = await findBinary();
        if (found) return found;
        if (installing) return installing;

        installing = (async () => {
            log.info('cloudflared not found — auto-installing into userData/bin…');
            installState = 'installing';
            try {
                const bin = await installBinary();
                if (bin) {
                    resolvedBinary = bin; // memoize so findBinary/getStatus see it
                    installState = 'installed';
                    log.info(`cloudflared installed: ${bin}`);
                    return bin;
                }
                installState = 'failed';
                return null;
            } catch (err) {
                lastError = `cloudflared auto-install failed: ${err?.message || err}`;
                log.error(lastError);
                installState = 'failed';
                return null;
            }
        })().finally(() => { installing = null; });

        return installing;
    }

    /**
     * Start a quick tunnel pointing at `target` (the loopback proxy origin,
     * e.g. http://127.0.0.1:<proxyPort>). Resolves with the public
     * https://*.trycloudflare.com URL, or rejects if cloudflared is missing
     * or the URL isn't seen within START_TIMEOUT_MS.
     */
    function start(target) {
        if (child && publicUrl) return Promise.resolve({ publicUrl });
        if (starting) return starting;

        starting = (async () => {
            const bin = await ensureBinary();
            if (!bin) {
                const detail = lastError ? ` (${lastError})` : '';
                lastError = `cloudflared is required to host a watch party, but it couldn't be found or installed automatically${detail}. Download it manually, add it to your PATH, and reopen the room.`;
                log.warn(lastError);
                throw new Error(lastError);
            }

            targetUrl = String(target || '').replace(/\/+$/, '');
            if (!targetUrl) throw new Error('share tunnel target URL is required');

            lastError = null;
            publicUrl = null;

            const args = [
                'tunnel',
                '--no-autoupdate',
                '--url', targetUrl,
            ];
            log.info(`spawning: ${bin} ${args.join(' ')}`);
            child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

            return await new Promise((resolve, reject) => {
                let settled = false;
                const timer = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    lastError = `timed out after ${START_TIMEOUT_MS}ms waiting for tunnel URL`;
                    log.error(lastError);
                    try { child?.kill(); } catch (_) {}
                    child = null;
                    reject(new Error(lastError));
                }, START_TIMEOUT_MS);

                const scan = (buf) => {
                    const text = String(buf || '');
                    if (!publicUrl) {
                        const m = text.match(URL_RE);
                        if (m) {
                            publicUrl = m[0];
                            log.info(`tunnel ready: ${publicUrl}`);
                            if (!settled) {
                                settled = true;
                                clearTimeout(timer);
                                resolve({ publicUrl });
                            }
                        }
                    }
                };

                // cloudflared prints the URL banner to stderr; scan both.
                child.stderr?.on('data', scan);
                child.stdout?.on('data', scan);

                child.on('error', (err) => {
                    lastError = `spawn error: ${err?.message || err}`;
                    log.error(lastError);
                    child = null;
                    if (!settled) { settled = true; clearTimeout(timer); reject(new Error(lastError)); }
                });

                child.on('exit', (code, signal) => {
                    log.warn(`cloudflared exited (code=${code}, signal=${signal})`);
                    child = null;
                    // Quick tunnels get a fresh URL each run, so we do NOT
                    // auto-restart: the host must republish. Surface via status.
                    if (!settled) {
                        settled = true;
                        clearTimeout(timer);
                        lastError = lastError || `cloudflared exited before URL (code=${code})`;
                        reject(new Error(lastError));
                    } else {
                        publicUrl = null;
                        lastError = `tunnel closed unexpectedly (code=${code}, signal=${signal})`;
                    }
                });
            });
        })().finally(() => { starting = null; });

        return starting;
    }

    /** Kill the tunnel child and clear state. Safe to call when not running. */
    async function stop() {
        const c = child;
        child = null;
        publicUrl = null;
        targetUrl = null;
        if (!c) return;
        try {
            c.removeAllListeners('exit');
            c.kill();
            // Windows: ensure the process tree is gone.
            if (IS_WIN && c.pid) {
                try { await execFileAsync('taskkill', ['/pid', String(c.pid), '/t', '/f'], { timeout: 5000 }); } catch (_) {}
            }
        } catch (err) {
            log.warn(`stop error: ${err?.message || err}`);
        }
    }

    function getPublicUrl() { return publicUrl; }

    function getStatus() {
        return {
            running: !!child && !!publicUrl,
            publicUrl,
            targetUrl,
            lastError,
            installState,
            binaryResolved: resolvedBinary !== undefined && resolvedBinary !== null,
        };
    }

    return { start, stop, getStatus, getPublicUrl, findBinary, ensureBinary };
}

module.exports = { createShareTunnel };
