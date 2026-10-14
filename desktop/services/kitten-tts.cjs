/**
 * kitten-tts.cjs — optional local neural narration (KittenTTS).
 *
 * The novel reader's narrator prefers this backend when it is ready:
 * real KittenTTS voices (https://github.com/KittenML/KittenTTS, Apache-2.0
 * code) synthesised on-device via a persistent Python daemon. Three models:
 *
 *   nano-int8  ~25 MB   KittenML/kitten-tts-nano-0.8-int8   (lite, CPU-easy)
 *   mini       ~80 MB   KittenML/kitten-tts-mini-0.8        (balanced)
 *   kitten-2   ~506 MB  KittenML/kitten-tts-2 (emb4)        (powerful, 47 voices + cloning)
 *
 * The legacy ONNX voices are always the same eight: Bella, Jasper, Luna,
 * Bruno, Rosie, Hugo, Kiki, Leo. KittenTTS 2 ships 47 built-in voices —
 * enumerated live from the daemon (`available_voices`).
 *
 * Layout: <userData>/kitten-tts/{models/<id>/..., daemon.py, wav/}.
 * Python: `python3`/`python` with the `kittenml` pip package (installed on
 * demand into the user's interpreter). Everything degrades gracefully: no
 * Python / no pip / no network → status { ready:false } and the renderer
 * falls back to system voices.
 */
'use strict';

const { spawn, execFile } = require('child_process');
const https = require('https');

const LEGACY_VOICES = ['Bella', 'Jasper', 'Luna', 'Bruno', 'Rosie', 'Hugo', 'Kiki', 'Leo'];

const MODELS = {
    'nano-int8': {
        id: 'nano-int8',
        label: 'Kitten Nano (lite)',
        description: '15M params · ~25 MB · fastest, 8 voices',
        repo: 'KittenML/kitten-tts-nano-0.8-int8',
        approxBytes: 25 * 1024 * 1024,
        legacy: true,
    },
    mini: {
        id: 'mini',
        label: 'Kitten Mini (balanced)',
        description: '80M params · ~80 MB · best quality/size, 8 voices',
        repo: 'KittenML/kitten-tts-mini-0.8',
        approxBytes: 80 * 1024 * 1024,
        legacy: true,
    },
    'kitten-2': {
        id: 'kitten-2',
        label: 'KittenTTS 2 (powerful)',
        description: '1.7B params · ~506 MB · 47 voices + cloning, needs ~6 GB RAM',
        repo: 'KittenML/kitten-tts-2',
        approxBytes: 506 * 1024 * 1024,
        legacy: false,
    },
};

const DAEMON_SCRIPT = require('fs').readFileSync(require('path').join(__dirname, 'kitten-tts-daemon.py'), 'utf8');

function hfGetJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'Tatakai/6 (kitten-tts)' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(hfGetJson(res.headers.location));
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HF ${res.statusCode} for ${url}`));
            }
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => req.destroy(new Error('HF timeout')));
    });
}

function downloadFile(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'Tatakai/6 (kitten-tts)' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return resolve(downloadFile(res.headers.location, dest, onProgress));
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const total = Number(res.headers['content-length'] || 0);
            let done = 0;
            const fs = require('fs');
            const out = fs.createWriteStream(dest);
            res.on('data', (chunk) => {
                done += chunk.length;
                if (onProgress && total > 0) onProgress(done, total);
            });
            res.pipe(out);
            out.on('finish', () => out.close(resolve));
            out.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(120000, () => req.destroy(new Error('download timeout')));
    });
}

module.exports = function registerKittenTts(ipcMain, app, fs, path, logger, getMainWindow) {
    const baseDir = path.join(app.getPath('userData'), 'kitten-tts');
    const modelsDir = path.join(baseDir, 'models');
    const wavDir = path.join(baseDir, 'wav');
    const daemonPath = path.join(baseDir, 'daemon.py');
    try {
        fs.mkdirSync(modelsDir, { recursive: true });
        fs.mkdirSync(wavDir, { recursive: true });
        fs.writeFileSync(daemonPath, DAEMON_SCRIPT);
    } catch (err) {
        logger?.warn?.(`[KittenTTS] init failed: ${err.message}`);
    }

    const send = (channel, payload) => {
        const win = typeof getMainWindow === 'function' ? getMainWindow() : null;
        if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    };

    let pythonBin = null;
    let kittenmlOk = null; // null = unknown
    let daemon = null; // { proc, modelId, voices, pending: Map }
    let daemonStarting = null;
    let seq = 0;
    const downloading = new Map(); // modelId -> { cancelled }

    function runBin(bin, args, timeoutMs = 20000) {
        return new Promise((resolve) => {
            execFile(bin, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
                if (err) return resolve(null);
                resolve(String(stdout || '').trim());
            });
        });
    }

    async function detectPython() {
        if (pythonBin) return pythonBin;
        for (const bin of ['python3', 'python']) {
            const out = await runBin(bin, ['--version']);
            if (out && /python 3\.(9|1\d)/i.test(out)) {
                pythonBin = bin;
                return bin;
            }
        }
        // Accept any python3 as a last resort (daemon reports real errors).
        for (const bin of ['python3', 'python']) {
            const out = await runBin(bin, ['--version']);
            if (out && /python 3/i.test(out)) {
                pythonBin = bin;
                return bin;
            }
        }
        return null;
    }

    async function ensureKittenml() {
        if (kittenmlOk === true) return true;
        const bin = await detectPython();
        if (!bin) return false;
        const probe = await runBin(bin, ['-c', 'import kittenml; print("ok")']);
        if (probe === 'ok') {
            kittenmlOk = true;
            return true;
        }
        logger?.info?.('[KittenTTS] installing kittenml via pip…');
        send('kitten-tts:progress', { modelId: '__setup__', phase: 'pip-install', done: 0, total: 1 });
        const installed = await new Promise((resolve) => {
            const child = spawn(bin, ['-m', 'pip', 'install', '--quiet', 'kittenml'], { shell: false, windowsHide: true });
            const timer = setTimeout(() => { try { child.kill(); } catch (_) {} resolve(false); }, 10 * 60 * 1000);
            child.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
            child.on('error', () => { clearTimeout(timer); resolve(false); });
        });
        send('kitten-tts:progress', { modelId: '__setup__', phase: 'pip-install', done: 1, total: 1 });
        if (!installed) return false;
        const retest = await runBin(bin, ['-c', 'import kittenml; print("ok")']);
        kittenmlOk = retest === 'ok';
        return kittenmlOk;
    }

    function modelDirOf(modelId) {
        return path.join(modelsDir, modelId);
    }

    function isModelDownloaded(modelId) {
        try {
            const dir = modelDirOf(modelId);
            if (!fs.existsSync(dir)) return false;
            const files = fs.readdirSync(dir);
            if (!files.includes('config.json')) return false;
            const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
            const names = MODELS[modelId]?.legacy ? [config.model_file, config.voices || 'voices.npz'] : [config.lm_emb4 || config.lm_packed, config.voices, config.speaker_embedding];
            return names.every(name => typeof name === 'string' && !name.includes('..') && fs.existsSync(path.join(dir, name)) && fs.statSync(path.join(dir, name)).size > 0);
        } catch {
            return false;
        }
    }

    async function listHfFiles(repo) {
        const meta = await hfGetJson(`https://huggingface.co/api/models/${repo}`);
        const config = await hfGetJson(`https://huggingface.co/${repo}/resolve/main/config.json`);
        const siblings = Array.isArray(meta?.siblings) ? meta.siblings : [];
        const required = new Set(['config.json', config.model_file, config.voices, config.speaker_embedding, config.lm_emb4 || config.lm_packed]);
        return siblings
            .map((s) => s?.rfilename)
            .filter(n => typeof n === 'string' && !n.includes('..') && (required.has(n) || config.type === 'KITTEN2' && /^(lm|speaker|voices)\/.*\.(json|txt|wav)$/.test(n)));
    }

    async function downloadModel(modelId, onProgress) {
        const spec = MODELS[modelId];
        if (!spec) throw new Error(`unknown model: ${modelId}`);
        if (downloading.has(modelId)) throw new Error('already downloading');
        const state = { cancelled: false };
        downloading.set(modelId, state);
        try {
            const files = await listHfFiles(spec.repo);
            if (files.length === 0) throw new Error('model repo is empty');
            const dir = modelDirOf(modelId);
            fs.mkdirSync(dir, { recursive: true });
            let doneBytes = 0;
            // Rough total for progress (per-file lengths refine it).
            let totalBytes = spec.approxBytes;
            for (const name of files) {
                if (state.cancelled) throw new Error('cancelled');
                const dest = path.join(dir, name);
                if (fs.existsSync(dest) && fs.statSync(dest).size > 0) continue;
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                const url = `https://huggingface.co/${spec.repo}/resolve/main/${name.split('/').map(encodeURIComponent).join('/')}`;
                const partial = `${dest}.part`;
                try {
                    await downloadFile(url, partial, done => onProgress?.({ modelId, phase: 'downloading', file: name, doneBytes: doneBytes + done, totalBytes }));
                    if (state.cancelled) throw new Error('cancelled');
                    fs.renameSync(partial, dest);
                } finally { try { fs.unlinkSync(partial); } catch (_) {} }
                try { doneBytes += fs.statSync(dest).size || 0; } catch (_) {}
                onProgress?.({ modelId, phase: 'downloading', file: name, doneBytes, totalBytes });
            }
            if (!isModelDownloaded(modelId)) throw new Error('Incomplete model download. Retry.');
            onProgress?.({ modelId, phase: 'done', doneBytes, totalBytes: doneBytes });
            return true;
        } finally {
            downloading.delete(modelId);
        }
    }

    function stopDaemon() {
        if (daemonStarting) {
            daemonStarting = null;
        }
        if (daemon?.proc) {
            try { daemon.proc.kill(); } catch (_) {}
            for (const [, pending] of daemon.pending) {
                try { pending.reject(new Error('daemon stopped')); } catch (_) {}
            }
        }
        daemon = null;
    }

    async function ensureDaemon(modelId) {
        if (daemon && daemon.modelId === modelId && daemon.proc && !daemon.proc.killed) return daemon;
        if (daemonStarting) return daemonStarting;
        const spec = MODELS[modelId];
        if (!spec) throw new Error(`unknown model: ${modelId}`);
        if (!isModelDownloaded(modelId)) throw new Error('model not downloaded');
        daemonStarting = (async () => {
            const ready = await ensureKittenml();
            if (!ready) throw new Error('Python 3.9+ with the kittenml package is required');
            const bin = await detectPython();
            const dir = modelDirOf(modelId);
            // kittenml resolves HF repos by id; point its cache at our dir so
            // the pre-downloaded weights are used offline when possible.
            const proc = spawn(bin, [daemonPath, spec.repo, dir], {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
            });
            const entry = { proc, modelId, voices: [...LEGACY_VOICES], pending: new Map(), buffer: '' };
            const settle = (fn) => { try { fn(); } catch (_) {} };
            const hello = await new Promise((resolve) => {
                const timer = setTimeout(() => resolve(null), 120000);
                const onData = (chunk) => {
                    entry.buffer += String(chunk);
                    let nl;
                    while ((nl = entry.buffer.indexOf('\n')) >= 0) {
                      const line = entry.buffer.slice(0, nl).trim();
                      entry.buffer = entry.buffer.slice(nl + 1);
                      if (!line) continue;
                      try {
                        const msg = JSON.parse(line);
                        if (msg && typeof msg.ready === 'boolean') {
                            clearTimeout(timer);
                            proc.stdout.off('data', onData);
                            resolve(msg);
                        }
                      } catch (_) {}
                    }
                };
                proc.stdout.on('data', onData);
                proc.stderr.on('data', (c) => logger?.warn?.(`[KittenTTS] daemon stderr: ${String(c).slice(0, 300)}`));
                proc.on('error', (err) => { clearTimeout(timer); resolve({ ready: false, error: err.message }); });
                proc.on('exit', (code) => { clearTimeout(timer); resolve({ ready: false, error: `exit ${code}` }); });
            });
            if (!hello || hello.ready !== true) {
                settle(() => proc.kill());
                throw new Error(hello?.error || 'daemon failed to start');
            }
            if (Array.isArray(hello.voices) && hello.voices.length > 0) entry.voices = hello.voices;
            proc.stdout.on('data', (chunk) => {
                entry.buffer += String(chunk);
                let nl;
                while ((nl = entry.buffer.indexOf('\n')) >= 0) {
                    const line = entry.buffer.slice(0, nl).trim();
                    entry.buffer = entry.buffer.slice(nl + 1);
                    if (!line) continue;
                    try {
                        const msg = JSON.parse(line);
                        const pending = msg?.id != null ? entry.pending.get(msg.id) : null;
                        if (pending) {
                            entry.pending.delete(msg.id);
                            settle(() => (msg.ok ? pending.resolve(msg) : pending.reject(new Error(msg.error || 'synth failed'))));
                        }
                    } catch (_) {}
                }
            });
            proc.on('exit', () => {
                if (daemon === entry) daemon = null;
                for (const [, pending] of entry.pending) settle(() => pending.reject(new Error('daemon exited')));
                entry.pending.clear();
            });
            daemon = entry;
            daemonStarting = null;
            logger?.info?.(`[KittenTTS] daemon ready (${modelId}, ${entry.voices.length} voices)`);
            return entry;
        })();

        try {
            return await daemonStarting;
        } catch (err) {
            daemonStarting = null;
            throw err;
        }
    }

    function synthWithDaemon(entry, { text, voice, speed, timeoutMs }) {
        return new Promise((resolve, reject) => {
            const id = `s${++seq}`;
            const safeVoice = voice && entry.voices.includes(voice) ? voice : entry.voices[0] || 'Luna';
            const dest = path.join(wavDir, `${id}.wav`);
            const timer = setTimeout(() => {
                entry.pending.delete(id);
                reject(new Error('synthesis timeout'));
            }, timeoutMs || 120000);
            entry.pending.set(id, {
                resolve: (msg) => { clearTimeout(timer); resolve({ file: msg.file || dest, voice: safeVoice }); },
                reject: (err) => { clearTimeout(timer); reject(err); },
            });
            try {
                entry.proc.stdin.write(JSON.stringify({ cmd: 'synth', id, text, voice: safeVoice, speed, out: dest }) + '\n');
            } catch (err) {
                entry.pending.delete(id);
                clearTimeout(timer);
                reject(err);
            }
        });
    }

    ipcMain.handle('kitten-tts:status', async () => {
        const bin = await detectPython().catch(() => null);
        return {
            ready: Boolean(daemon && daemon.proc && !daemon.proc.killed),
            activeModel: daemon?.modelId || null,
            voices: daemon?.voices || [],
            python: bin,
            kittenml: kittenmlOk === true,
            models: Object.values(MODELS).map((m) => ({
                id: m.id,
                label: m.label,
                description: m.description,
                approxBytes: m.approxBytes,
                downloaded: isModelDownloaded(m.id),
                downloading: downloading.has(m.id),
            })),
        };
    });

    ipcMain.handle('kitten-tts:download', async (_event, payload) => {
        const modelId = String(payload?.modelId || '');
        if (!MODELS[modelId]) return { success: false, error: 'unknown model' };
        try {
            if (!await ensureKittenml()) throw new Error('Desktop voice setup failed. Install Python 3.9+ and kittenml, then retry.');
            await downloadModel(modelId, (progress) => send('kitten-tts:progress', progress));
            return { success: true };
        } catch (err) {
            send('kitten-tts:progress', { modelId, phase: 'error', error: err.message });
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('kitten-tts:cancel-download', async (_event, payload) => {
        const state = downloading.get(String(payload?.modelId || ''));
        if (state) state.cancelled = true;
        return { success: true };
    });

    ipcMain.handle('kitten-tts:delete-model', async (_event, payload) => {
        const modelId = String(payload?.modelId || '');
        if (!MODELS[modelId]) return { success: false, error: 'unknown model' };
        try {
            if (daemon?.modelId === modelId) stopDaemon();
            const dir = modelDirOf(modelId);
            if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('kitten-tts:synthesize', async (_event, payload) => {
        try {
            const out = await synthesizeText(payload || {});
            return { success: true, ...out };
        } catch (err) {
            logger?.warn?.(`[KittenTTS] synth failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    });

    async function synthesizeText(payload = {}) {
        const text = String(payload?.text || '').slice(0, 1200).trim();
        if (!text) throw new Error('empty text');
        const modelId = String(payload?.modelId || daemon?.modelId || 'nano-int8');
        const voice = String(payload?.voice || '');
        const speed = Number(payload?.speed) > 0 ? Math.min(2, Math.max(0.5, Number(payload.speed))) : 1;
        const entry = await ensureDaemon(modelId);
        const { file, voice: usedVoice } = await synthWithDaemon(entry, { text, voice, speed });
        return { file, voice: usedVoice, model: modelId };
    }

    ipcMain.handle('kitten-tts:stop', async () => {
        stopDaemon();
        return { success: true };
    });

    app.on?.('before-quit', stopDaemon);
    logger?.info?.('[KittenTTS] service registered');

    return {
        MODELS,
        LEGACY_VOICES,
        status: async () => ({
            ready: Boolean(daemon && daemon.proc && !daemon.proc.killed),
            activeModel: daemon?.modelId || null,
        }),
        stop: stopDaemon,
    };
};
