'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const readline = require('node:readline');
const execFileAsync = promisify(execFile);
const QUALITIES = ['light', 'balanced', 'high'];
function configuration(config) {
    if (!config || !QUALITIES.includes(config.quality) || !Number.isInteger(config.maxOutputHeight) || config.maxOutputHeight < 240 || config.maxOutputHeight > 1080) throw new Error('Invalid RTX configuration');
    if (config.purpose && !['playback', 'preview'].includes(config.purpose)) throw new Error('Invalid RTX session purpose');
    return { quality: config.quality, maxOutputHeight: config.maxOutputHeight, purpose: config.purpose || 'playback', hdr: false };
}
function validateFrame(frame) {
    if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 1 || frame.height < 1 || frame.width > 1920 || frame.height > 1080 || !Number.isSafeInteger(frame.generation) || frame.generation < 0 || !Number.isFinite(frame.timestamp) || frame.timestamp < 0) throw new Error('Invalid RTX frame');
    if (!(frame.bytes instanceof Uint8Array) || frame.bytes.byteLength !== frame.width * frame.height * 4) throw new Error('Invalid RTX pixel buffer');
}
function resolveBinaryRoot(app, resourcesPath = process.resourcesPath) {
    if (app.isPackaged) return path.join(resourcesPath, 'bin', 'rtx-video');
    const appRoot = path.resolve(app.getAppPath());
    // `electron desktop/main.cjs` makes getAppPath() point at desktop/, while
    // `electron .` points at the repository root. Support both dev entrypoints.
    const desktopRoot = path.resolve(__dirname, '../..');
    const projectRoot = appRoot === desktopRoot ? path.dirname(appRoot) : appRoot;
    return path.join(projectRoot, 'resources', 'bin', 'rtx-video');
}
function registerRtxVideo(ipcMain, app, electron) {
    const binaryRoot = resolveBinaryRoot(app);
    const executable = path.join(binaryRoot, 'tatakai-rtx-video.exe');
    const sessions = new Map();
    const preferenceFile = path.join(app.getPath('userData'), 'rtx-video-gpu.json');
    const requestedGpu = () => { try { return JSON.parse(fs.readFileSync(preferenceFile, 'utf8')).enabled === true; } catch { return false; } };
    const capability = async () => {
        const unavailable = reason => ({ available: false, reason, maxOutputHeight: 1080, dedicatedGpuRequested: requestedGpu() });
        if (process.platform !== 'win32' || process.arch !== 'x64') return unavailable('RTX Video requires the Windows x64 desktop app.');
        if (!electron.sharedTexture?.importSharedTexture) return unavailable('This desktop build does not support shared GPU textures.');
        if (!fs.existsSync(executable) || !fs.existsSync(path.join(binaryRoot, 'nvngx_vsr.dll'))) return unavailable('RTX Video is unavailable in this build. The official NVIDIA SDK runtime and compiled Windows helper are required.');
        try {
            const { stdout } = await execFileAsync(executable, ['--probe'], { windowsHide: true, timeout: 15000, maxBuffer: 16384, cwd: binaryRoot });
            const probe = JSON.parse(stdout.trim());
            if (probe.protocol !== 1 || probe.sdk !== 'nvidia-rtx-video' || probe.initialized !== true) return unavailable(probe.reason || 'The NVIDIA runtime could not initialize on this GPU/driver.');
            const gpu = await app.getGPUInfo('complete');
            if (gpu.auxAttributes?.displayType && !String(gpu.auxAttributes.displayType).startsWith('ANGLE_D3D11')) return unavailable('RTX Video requires the hardware-accelerated D3D11 renderer. This session uses a different graphics backend.');
            const active = gpu.gpuDevice?.find(device => device.active);
            if (!active || active.vendorId !== 0x10de) return { ...unavailable('RTX Video needs Tatakai to render on the NVIDIA GPU. Restart using the NVIDIA GPU to enable it.'), restartRequired: true, dedicatedGpuRequested: requestedGpu() };
            return { available: true, reason: '', adapter: String(probe.adapter || 'NVIDIA RTX'), maxOutputHeight: 1080, dedicatedGpuRequested: requestedGpu() };
        } catch (error) {
            try { const result = JSON.parse(error.stdout?.trim()); if (result.reason) return unavailable(`RTX Video could not initialize. ${String(result.reason).slice(0, 200)}`); } catch { /* Process or loader failure without a JSON response. */ }
            return unavailable(`RTX Video could not initialize. ${error.message.slice(0, 180)}`);
        }
    };
    const send = (session, metadata, bytes = Buffer.alloc(0)) => {
        const header = Buffer.from(JSON.stringify(metadata));
        const lengths = Buffer.alloc(8); lengths.writeUInt32LE(header.length, 0); lengths.writeUInt32LE(bytes.length, 4);
        session.child.stdin.write(Buffer.concat([lengths, header, bytes]));
    };
    const close = (token, message = 'RTX Video stopped.') => {
        const session = sessions.get(token);
        if (!session) return;
        sessions.delete(token); clearTimeout(session.timer);
        session.pending?.reject(new Error(message)); session.pending = null;
        send(session, { type: 'stop' }); session.child.stdin.end();
        const termination = setTimeout(() => session.child.kill(), 6000); termination.unref();
        session.child.once('close', () => clearTimeout(termination));
        if (!session.sender.isDestroyed()) session.sender.send('rtx-video:status', { session: token, state: 'stopped', message });
    };
    const owned = (event, token) => {
        const session = sessions.get(token);
        if (!session || session.sender.id !== event.sender.id) throw new Error('RTX session is not available');
        return session;
    };
    ipcMain.handle('rtx-video:capability', capability);
    ipcMain.handle('rtx-video:restart-gpu', (_event, enabled) => {
        if (typeof enabled !== 'boolean' || process.platform !== 'win32') throw new Error('Invalid GPU preference');
        fs.mkdirSync(path.dirname(preferenceFile), { recursive: true });
        fs.writeFileSync(preferenceFile, JSON.stringify({ enabled }));
        setTimeout(() => { app.relaunch(); app.exit(0); }, 200);
        return { restarting: true };
    });
    ipcMain.handle('rtx-video:start', async (event, config) => {
        config = configuration(config);
        const caps = await capability();
        if (!caps.available) throw new Error(caps.reason);
        for (const [token, session] of sessions) if (session.sender.id === event.sender.id && session.purpose === config.purpose) close(token);
        const token = randomUUID();
        const child = spawn(executable, ['--serve', '--parent-pid', String(process.pid)], { cwd: binaryRoot, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        const session = { child, sender: event.sender, pending: null, timer: null, configured: false, purpose: config.purpose };
        sessions.set(token, session);
        child.stdin.on('error', () => {}); child.stderr.on('data', () => {});
        child.once('error', error => close(token, error.message));
        child.once('close', () => close(token, 'RTX helper stopped. Original playback restored.'));
        event.sender.once('destroyed', () => close(token));
        const lines = readline.createInterface({ input: child.stdout });
        lines.on('line', async line => {
            try {
                if (line.length > 16384) throw new Error('Invalid RTX helper response');
                const result = JSON.parse(line);
                if (result.type === 'configured') { session.configured = true; return; }
                if (result.type === 'error') throw new Error(result.message || 'RTX processing failed');
                const pending = session.pending;
                if (!pending || result.type !== 'texture' || result.id !== pending.id) return;
                if (!/^[0-9a-fA-F]{1,16}$/.test(result.handle) || !Number.isInteger(result.width) || !Number.isInteger(result.height) || result.width < 1 || result.width > 1920 || result.height < 1 || result.height > 1080 || !Number.isFinite(result.processingMs)) throw new Error('Invalid RTX output texture');
                const handle = Buffer.alloc(8); handle.writeBigUInt64LE(BigInt(`0x${result.handle}`));
                const texture = electron.sharedTexture.importSharedTexture({ textureInfo: {
                    codedSize: { width: result.width, height: result.height }, pixelFormat: 'bgra', handle: { ntHandle: handle }, timestamp: Math.round(pending.timestamp * 1e6),
                }, allReferencesReleased: () => { if (sessions.has(token)) send(session, { type: 'release', id: pending.id }); } });
                const metadata = { session: token, generation: pending.generation, timestamp: pending.timestamp, width: result.width, height: result.height, processingMs: result.processingMs, gpuMemoryBytes: Number.isFinite(result.gpuMemoryBytes) ? result.gpuMemoryBytes : undefined };
                try { await electron.sharedTexture.sendSharedTexture({ frame: session.sender.mainFrame, importedSharedTexture: texture }, metadata); }
                finally { texture.release(); }
                if (session.pending === pending) { clearTimeout(session.timer); session.pending = null; pending.resolve(metadata); }
            } catch (error) { close(token, error.message); }
        });
        send(session, { type: 'configure', ...config });
        return { session: token };
    });
    ipcMain.handle('rtx-video:configure', (event, token, config) => { const session = owned(event, token); session.configured = false; send(session, { type: 'configure', ...configuration(config) }); });
    ipcMain.handle('rtx-video:frame', (event, frame) => {
        validateFrame(frame);
        const session = owned(event, frame.session);
        if (session.pending) throw new Error('An RTX frame is already in flight');
        return new Promise((resolve, reject) => {
            const id = randomUUID(); session.pending = { id, resolve, reject, timestamp: frame.timestamp, generation: frame.generation };
            session.timer = setTimeout(() => close(frame.session, 'RTX processing timed out. Original playback restored.'), 5000);
            send(session, { type: 'frame', id, width: frame.width, height: frame.height, timestamp: frame.timestamp, generation: frame.generation }, Buffer.from(frame.bytes));
        });
    });
    ipcMain.handle('rtx-video:stop', (event, token) => { if (!sessions.has(token)) return; owned(event, token); close(token); });
    app.once?.('before-quit', () => { for (const token of sessions.keys()) close(token); });
}
module.exports = registerRtxVideo;
module.exports.configuration = configuration;
module.exports.validateFrame = validateFrame;
module.exports.resolveBinaryRoot = resolveBinaryRoot;
