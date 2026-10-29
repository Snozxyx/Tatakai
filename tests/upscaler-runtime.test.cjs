const { describe, test, expect } = require('bun:test');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const register = require('../desktop/runtime/upscaler/index.cjs');

describe('headless upscaler boundary', () => {
    test('accepts only known engines, supported scales, and bounded image bytes', () => {
        expect(() => register.validateImage({ engine: '../evil', scale: 2, bytes: [1] })).toThrow();
        expect(() => register.validateImage({ engine: '__proto__', scale: 2, bytes: [1] })).toThrow();
        expect(() => register.validateImage({ engine: 'manga', scale: 100, bytes: [1] })).toThrow();
        expect(() => register.validateImage({ engine: 'manga', scale: 2, bytes: [] })).toThrow();
        expect(() => register.validateImage({ engine: 'manga', scale: 2, bytes: new Uint8Array(21 * 1024 * 1024) })).toThrow();
        expect([...register.validateImage({ engine: 'realesrgan', scale: 4, bytes: new Uint8Array([1, 2]) })]).toEqual([1, 2]);
    });
    test('reports missing models and rejects processing before setup', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'tatakai-upscaler-test-'));
        const handlers = new Map();
        register({ handle: (name, handler) => handlers.set(name, handler) }, { getPath: () => root });
        try {
            expect(await handlers.get('upscaler:status')()).toMatchObject({ installing: false, stage: '', error: '', realesrgan: false, manga: false, cacheBytes: 0, modelBytes: 0, queued: 0 });
            await expect(handlers.get('upscaler:install')(null, 'shell-command')).rejects.toThrow('Unknown upscaler');
            await expect(handlers.get('upscaler:enhance')(null, { engine: 'manga', scale: 2, bytes: [1] })).rejects.toThrow('Set up');
        } finally { await rm(root, { recursive: true, force: true }); }
    });
});
