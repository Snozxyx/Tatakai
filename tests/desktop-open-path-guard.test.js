/**
 * Regression test — desktop `open-path` bridge guard.
 *
 * SEC audit finding DESK-9: `open-path` forwarded whatever the renderer sent to
 * `shell.openPath()`, i.e. "open with the OS default handler". Pointed at a
 * `.exe` / `.bat` / `.lnk` / `.desktop` file that is local code execution, so any
 * script-injection bug in the renderer escalated to running a binary on the
 * user's machine. The app only ever opens a folder or a media file, so the
 * bridge now allows exactly that.
 */
import { describe, it, expect, beforeAll } from 'bun:test';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const registerLibraryHandlers = require('../desktop/ipc/ipc-library.cjs');

const handlers = new Map();
const opened = [];
const fakeIpcMain = {
    handle: (channel, fn) => handlers.set(channel, fn),
    on: () => {},
};
const fakeShell = {
    openPath: async (target) => {
        opened.push(target);
        return '';
    },
    openExternal: async () => {},
};

const workDir = mkdtempSync(join(tmpdir(), 'tatakai-open-path-'));
const logger = { info() {}, warn() {}, error() {}, debug() {} };
const fakeApp = {
    getPath: () => workDir,
    getVersion: () => '0.0.0-test',
};

beforeAll(() => {
    // Real signature: (ipcMain, app, dialog, shell, fs, path, logger, getMainWindow)
    registerLibraryHandlers(fakeIpcMain, fakeApp, { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
        fakeShell, fs, path, logger, () => null);
});

const openPath = () => handlers.get('open-path');

describe('open-path bridge guard (DESK-9)', () => {
    it('opens a directory (Library / Offline folders)', async () => {
        const dir = join(workDir, 'downloads');
        mkdirSync(dir, { recursive: true });
        const result = await openPath()(null, dir);
        expect(result.success).toBe(true);
        expect(opened).toContain(dir);
    });

    it('opens a media file', async () => {
        const file = join(workDir, 'episode-01.mkv');
        writeFileSync(file, 'not really a video');
        const result = await openPath()(null, file);
        expect(result.success).toBe(true);
        expect(opened).toContain(file);
    });

    it('refuses executables and scripts even when they exist', async () => {
        const names = ['payload.exe', 'run.sh', 'autorun.bat', 'x.lnk', 'x.desktop', 'click.js', 'x.ps1'];
        for (const name of names) {
            const file = join(workDir, name);
            writeFileSync(file, '#!');
            const result = await openPath()(null, file);
            expect(result.success).toBe(false);
            expect(result.error).toBe('unsupported-target');
            expect(opened).not.toContain(file);
        }
    });

    it('refuses a missing path and non-string input', async () => {
        expect((await openPath()(null, join(workDir, 'nope.mp4'))).error).toBe('not-found');
        expect((await openPath()(null, 42)).error).toBe('invalid-path');
        expect((await openPath()(null, '   ')).error).toBe('invalid-path');
    });
});
