'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { UpscaleJobQueue } = require('./job-queue.cjs');
const { PythonUpscaler } = require('./python-client.cjs');
const MODELS = { realesrgan: 'RealESRGAN_x4plus_anime_6B.pth', manga: '4x_MangaJaNai_1200p_V1_ESRGAN_70k.pth' };
const QUALITIES = ['light', 'balanced', 'high'];
function validateImage(payload) {
    if (!payload || !Object.hasOwn(MODELS, payload.engine) || ![2, 4].includes(payload.scale) || (payload.quality && !QUALITIES.includes(payload.quality))) throw new Error('Invalid upscaler settings');
    const size = payload.bytes?.byteLength ?? payload.bytes?.length;
    if (!Number.isInteger(size) || size < 1 || size > 20 * 1024 * 1024) throw new Error('Page must be between 1 byte and 20 MB');
    return Buffer.from(payload.bytes);
}
module.exports = function registerUpscaler(ipcMain, app) {
    const root = path.join(app.getPath('userData'), 'upscaler');
    const python = path.join(root, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const models = path.join(root, 'models'), cache = path.join(root, 'cache'), worker = path.join(root, 'worker.py');
    let installing = false, stage = '', setupError = '', setupEngine = null, setupChild = null, setupCancelled = false;
    let downloadBytes = 0, downloadTotal = 0, idleTimer, clearingCache = false;
    const senders = new Map(), observed = new Set(), cancelledRequests = new Map();
    const exists = async file => fs.access(file).then(() => true, () => false);
    const safeSend = (sender, event) => { if (sender && !sender.isDestroyed()) sender.send('upscaler:event', event); };
    const client = new PythonUpscaler(python, worker, models, event => safeSend(senders.get(event.id), event));
    const prepareWorker = async () => {
        await fs.mkdir(root, { recursive: true });
        await fs.writeFile(worker, await fs.readFile(path.join(__dirname, 'worker.py')));
    };
    const list = async directory => (await fs.readdir(directory).catch(() => [])).map(name => path.join(directory, name));
    const usage = async directory => (await Promise.all((await list(directory)).map(file => fs.stat(file).then(s => s.isFile() ? s.size : 0, () => 0)))).reduce((a, b) => a + b, 0);
    const trimCache = async () => {
        const files = await Promise.all((await list(cache)).filter(file => file.endsWith('.png')).map(async file => ({ file, ...await fs.stat(file) })));
        let total = files.reduce((sum, file) => sum + file.size, 0);
        for (const file of files.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
            if (total <= 512 * 1024 * 1024) break;
            await fs.rm(file.file, { force: true }); total -= file.size;
        }
    };
    const jobs = new UpscaleJobQueue(async job => {
        clearTimeout(idleTimer);
        const { payload, bytes } = job;
        const key = createHash('sha256').update(bytes).update(`${payload.engine}:${payload.scale}:${payload.quality || 'balanced'}:v2`).digest('hex');
        const input = path.join(cache, `${key}.input`), output = path.join(cache, `${key}.png`);
        await fs.mkdir(cache, { recursive: true });
        try {
            if (!await exists(output)) {
                await prepareWorker();
                await fs.writeFile(input, bytes);
                if (job.cancelled) throw new Error('Enhancement cancelled');
                senders.set(job.id, job.sender);
                try { await client.request({ id: job.id, engine: payload.engine, scale: payload.scale, quality: payload.quality || 'balanced', input, output }); }
                catch (error) { await fs.rm(output, { force: true }); throw error; }
            }
            if (job.cancelled) throw new Error('Enhancement cancelled');
            const result = new Uint8Array(await fs.readFile(output));
            await fs.utimes(output, new Date(), new Date());
            await trimCache();
            return result;
        } finally {
            senders.delete(job.id); await fs.rm(input, { force: true });
            idleTimer = setTimeout(() => client.stop(), 120000); idleTimer.unref?.();
        }
    }, id => client.cancel(id));
    const stopSetupChild = child => {
        if (!child || child.exitCode !== null || child.killed || !child.pid) return;
        if (process.platform === 'win32') {
            const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false });
            killer.on('error', () => child.kill());
        } else child.kill();
    };
    const setupRun = (command, args, timeout = 1800000) => new Promise((resolve, reject) => {
        if (setupCancelled) { reject(new Error('Setup cancelled. Choose Set up to resume.')); return; }
        const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
        setupChild = child;
        let tail = '';
        const timer = setTimeout(() => { stopSetupChild(child); reject(new Error('Setup timed out. Choose Set up to resume.')); }, timeout);
        const lines = readline.createInterface({ input: child.stdout });
        lines.on('line', line => {
            try { const event = JSON.parse(line); if (event.type === 'download') { downloadBytes = event.bytes; downloadTotal = event.total; } } catch { tail = (tail + line).slice(-2000); }
        });
        child.stderr.on('data', chunk => { tail = (tail + chunk).slice(-2000); });
        child.on('error', error => { clearTimeout(timer); lines.close(); reject(error); });
        child.on('close', code => { clearTimeout(timer); lines.close(); if (setupChild === child) setupChild = null; code === 0 && !setupCancelled ? resolve() : reject(new Error(setupCancelled ? 'Setup cancelled. Choose Set up to resume.' : tail || `Setup exited (${code})`)); });
    });
    ipcMain.handle('upscaler:status', async () => ({
        installing, stage, error: setupError, setupEngine, downloadBytes, downloadTotal,
        realesrgan: await exists(python) && await exists(path.join(models, 'realesrgan.ready')) && await exists(path.join(models, MODELS.realesrgan)),
        manga: await exists(python) && await exists(path.join(models, 'manga.ready')) && await exists(path.join(models, MODELS.manga)),
        cacheBytes: await usage(cache), modelBytes: await usage(models), queued: jobs.size, loadedEngine: client.engine,
    }));
    ipcMain.handle('upscaler:install', async (_event, engine) => {
        if (!Object.hasOwn(MODELS, engine)) throw new Error('Unknown upscaler');
        if (installing || jobs.size) throw new Error('Wait for the current setup or enhancement to finish.');
        installing = true; setupCancelled = false; setupError = ''; setupEngine = engine; downloadBytes = downloadTotal = 0;
        client.stop();
        void (async () => {
            try {
                await prepareWorker();
                if (!await exists(python)) {
                    stage = 'Creating the AI environment…';
                    let created = false;
                    for (const [command, ...prefix] of process.platform === 'win32' ? [['py', '-3'], ['python']] : [['python3']]) {
                        try {
                            await setupRun(command, [...prefix, '-c', 'import sys; assert sys.version_info >= (3,10)'], 30000);
                            await setupRun(command, [...prefix, '-m', 'venv', path.join(root, 'venv')]); created = true; break;
                        } catch { if (setupCancelled) throw new Error('Setup cancelled. Choose Set up to resume.'); }
                    }
                    if (!created) throw new Error('Install Python 3.10 or newer, then choose Set up again.');
                }
                stage = 'Installing AI dependencies. This can take several minutes…';
                await setupRun(python, ['-m', 'pip', 'install', 'spandrel==0.4.1', 'Pillow>=10,<13', 'numpy>=1.26,<3']);
                if (!await exists(path.join(models, MODELS[engine]))) {
                    stage = 'Downloading model. Interrupted downloads can be resumed…';
                    await setupRun(python, [worker, '--download', '--engine', engine, '--models', models]);
                }
                stage = 'Verifying the model…';
                await setupRun(python, ['-c', 'from spandrel import ModelLoader; import sys; ModelLoader().load_from_file(sys.argv[1])', path.join(models, MODELS[engine])]);
                if (setupCancelled) throw new Error('Setup cancelled. Choose Set up to resume.');
                await fs.writeFile(path.join(models, `${engine}.ready`), '2'); stage = 'Ready';
            } catch (error) { setupError = error.message; stage = ''; }
            finally { installing = false; setupChild = null; }
        })();
        return { started: true };
    });
    ipcMain.handle('upscaler:cancel-setup', () => { setupCancelled = true; stopSetupChild(setupChild); return { cancelled: installing }; });
    ipcMain.handle('upscaler:clear-cache', async () => {
        if (jobs.size) throw new Error('Wait for enhancement to finish before clearing the cache.');
        clearingCache = true;
        try { for (const file of await list(cache)) if (/\.(png|input)$/.test(file)) await fs.rm(file, { force: true }); }
        finally { clearingCache = false; }
        return { cleared: true };
    });
    ipcMain.handle('upscaler:cancel', (event, id) => {
        if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('Invalid job id');
        const owner = event?.sender?.id || 0;
        if (!jobs.cancel(id, owner)) {
            // Cancellation can arrive while readiness is still being checked.
            const key = `${owner}:${id}`;
            if (cancelledRequests.size < 1024) { cancelledRequests.set(key, true); const timer = setTimeout(() => cancelledRequests.delete(key), 30000); timer.unref?.(); }
        }
        return { cancelled: true };
    });
    ipcMain.handle('upscaler:enhance', async (event, payload) => {
        const bytes = validateImage(payload);
        const id = payload.id || randomUUID(), owner = event?.sender?.id || 0;
        if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('Invalid job id');
        if (installing) throw new Error('AI setup is still running. Try again when it finishes.');
        if (!await exists(path.join(models, `${payload.engine}.ready`)) || !await exists(python) || !await exists(path.join(models, MODELS[payload.engine]))) throw new Error('Set up this upscaler in Reader settings first.');
        if (cancelledRequests.delete(`${owner}:${id}`)) throw new Error('Enhancement cancelled');
        if (installing || clearingCache) throw new Error('AI setup or cache maintenance is in progress. Try again in a moment.');
        const sender = event?.sender;
        if (sender && !observed.has(owner)) {
            observed.add(owner); sender.once('destroyed', () => { jobs.cancelOwner(owner); observed.delete(owner); });
        }
        return jobs.submit({ id, owner, sender, bytes, payload, priority: Math.min(100, Math.max(0, Number(payload.priority) || 0)) });
    });
    app.once?.('before-quit', () => { clearTimeout(idleTimer); setupCancelled = true; stopSetupChild(setupChild); jobs.close(); client.stop(); });
};
module.exports.validateImage = validateImage;
