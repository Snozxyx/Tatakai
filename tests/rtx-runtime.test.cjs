const { test, expect } = require('bun:test');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const register = require('../desktop/runtime/rtx-video/index.cjs');

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
