const { test, expect } = require('bun:test');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const register = require('../desktop/runtime/rtx-video/index.cjs');

function mockCapabilityRuntime(getGPUInfo) {
    const filename = path.resolve(__dirname, '../desktop/runtime/rtx-video/index.cjs');
    let probes = 0;
    const context = {
        module: { exports: {} }, __dirname: path.dirname(filename),
        process: { platform: 'win32', arch: 'x64' },
        require(name) {
            if (name === 'node:fs') return { existsSync: () => true, readFileSync: () => { throw new Error('No GPU preference'); } };
            if (name === 'node:util') return { promisify: operation => operation };
            if (name === 'node:child_process') return { execFile: async () => {
                probes++;
                return { stdout: JSON.stringify({ protocol: 1, sdk: 'nvidia-rtx-video', initialized: true, adapter: 'NVIDIA RTX' }) };
            } };
            return require(name);
        },
        // Keep a real timeout, shortened only for the simulated stalled GPU query.
        setTimeout: (callback, delay) => setTimeout(callback, delay === 5000 ? 5 : delay), clearTimeout,
    };
    vm.runInNewContext(readFileSync(filename, 'utf8'), context, { filename });
    const handlers = new Map();
    context.module.exports({ handle: (name, handler) => handlers.set(name, handler) }, {
        isPackaged: false, getAppPath: () => path.resolve(__dirname, '..'), getPath: () => tmpdir(), getGPUInfo,
    }, { sharedTexture: { importSharedTexture() {} } });
    return { capability: handlers.get('rtx-video:capability'), probes: () => probes };
}

test('both Electron development launch styles resolve the same staged RTX runtime', () => {
    const project = path.resolve(__dirname, '..');
    const expected = path.join(project, 'resources', 'bin', 'rtx-video');
    expect(register.resolveBinaryRoot({ isPackaged: false, getAppPath: () => project })).toBe(expected);
    expect(register.resolveBinaryRoot({ isPackaged: false, getAppPath: () => path.join(project, 'desktop') })).toBe(expected);
    expect(register.resolveBinaryRoot({ isPackaged: true }, path.join(project, 'packaged-resources'))).toBe(path.join(project, 'packaged-resources', 'bin', 'rtx-video'));
});

test('RTX accepts bounded BGRA frames and supported configurations only', () => {
    expect(register.configuration({ quality: 'balanced', maxOutputHeight: 1080 })).toMatchObject({ quality: 'balanced', hdr: false });
    expect(() => register.configuration({ quality: 'invented', maxOutputHeight: 1080 })).toThrow();
    expect(() => register.configuration({ quality: 'high', maxOutputHeight: 4000 })).toThrow();
    expect(() => register.validateFrame({ width: 1920, height: 1080, timestamp: 0, generation: 0, bytes: new Uint8Array(16) })).toThrow();
    expect(() => register.validateFrame({ width: 2, height: 2, timestamp: 0, generation: 0, bytes: new Uint8Array(16) })).not.toThrow();
});
test('a missing native runtime stays unavailable and cannot create a fake active session', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tatakai-rtx-test-')), handlers = new Map();
    register({ handle: (name, handler) => handlers.set(name, handler) }, { getPath: () => root, getAppPath: () => root, isPackaged: false }, { sharedTexture: { importSharedTexture() {} } });
    try {
        const capability = await handlers.get('rtx-video:capability')();
        expect(capability.available).toBe(false); expect(capability.reason.length).toBeGreaterThan(10);
        await expect(handlers.get('rtx-video:start')({ sender: { id: 1 } }, { quality: 'balanced', maxOutputHeight: 1080 })).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
});

test('a stalled Electron GPU query returns an unavailable result and permits a retry', async () => {
    let stalled = true;
    const runtime = mockCapabilityRuntime(() => stalled ? new Promise(() => {}) : Promise.resolve({ gpuDevice: [{ active: true, vendorId: 0x10de }] }));
    const result = await runtime.capability();
    expect(result).toMatchObject({ available: false, reason: expect.stringContaining('timed out') });
    stalled = false;
    expect(await runtime.capability()).toMatchObject({ available: true, adapter: 'NVIDIA RTX' });
});

test('concurrent compatibility requests share one native probe and can be checked again', async () => {
    const runtime = mockCapabilityRuntime(async () => ({ gpuDevice: [{ active: true, vendorId: 0x10de }] }));
    const first = runtime.capability(), second = runtime.capability();
    expect(first).toBe(second);
    expect((await Promise.all([first, second])).every(result => result.available)).toBe(true);
    expect(runtime.probes()).toBe(1);
    await runtime.capability();
    expect(runtime.probes()).toBe(2);
});

test('a supported NVIDIA helper still requires Chromium to use the NVIDIA adapter', async () => {
    const runtime = mockCapabilityRuntime(async () => ({ gpuDevice: [{ active: true, vendorId: 0x8086 }, { active: false, vendorId: 0x10de }] }));
    expect(await runtime.capability()).toMatchObject({ available: false, restartRequired: true, reason: expect.stringContaining('Restart using the NVIDIA GPU') });
});
