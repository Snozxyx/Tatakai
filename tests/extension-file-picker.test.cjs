const { test, expect } = require('bun:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const register = require('../desktop/ipc/ipc-library.cjs');

test('native package picker handles cancellation and returns selected bytes', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tatakai-picker-'));
    const filename = path.join(directory, 'fixture.json');
    fs.writeFileSync(filename, '{"id":"fixture","name":"Preview","version":"1"}');
    const handlers = new Map(); let selection = { canceled: true, filePaths: [] };
    register({ handle: (name, handler) => handlers.set(name, handler) }, {}, { showOpenDialog: async () => selection }, {}, fs, path, {}, () => undefined);
    try {
        const pick = handlers.get('extension:pick-package');
        expect(await pick()).toBeNull();
        selection = { canceled: false, filePaths: [filename] };
        const result = await pick();
        expect(result.name).toBe('fixture.json');
        expect(Buffer.from(result.bytes).toString()).toBe(fs.readFileSync(filename, 'utf8'));
        const oversized = path.join(directory, 'oversized.kai');
        fs.writeFileSync(oversized, ''); fs.truncateSync(oversized, 30 * 1024 * 1024 + 1);
        selection = { canceled: false, filePaths: [oversized] };
        await expect(pick()).rejects.toThrow('under 30 MB');
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
