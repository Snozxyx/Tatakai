/**
 * Regression test — desktop IPC hardening (SEC audit findings DESK-1, DESK-2).
 *
 * DESK-1: the preload bridge must not expose a generic `invoke(channel, …)`
 *         passthrough, which would mirror the entire ipcMain surface into the
 *         renderer.
 * DESK-2: every `ipcMain.handle` channel must reject callers whose frame is not
 *         our own renderer.
 */
import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { installIpcSenderGuard, isTrustedFrameUrl } = require('../desktop/security/ipc-guard.cjs');

const ROOT = join(import.meta.dir, '..');

describe('preload IPC surface (DESK-1)', () => {
    it('exposes no generic invoke passthrough', () => {
        const preload = readFileSync(join(ROOT, 'desktop/preload.cjs'), 'utf8');
        const genericInvoke = /invoke:\s*\([^)]*\)\s*=>\s*ipcRenderer\.(invoke|send)/;
        expect(genericInvoke.test(preload)).toBe(false);
        // Sanity: the bridge is still there and still delegates to ipcRenderer.
        expect(preload.includes('contextBridge.exposeInMainWorld')).toBe(true);
    });

    it('has no renderer call sites left on a generic invoke channel', () => {
        const files = [
            'src/utils/debug-extension.ts',
            'src/pages/watch/WatchPage.tsx',
            'src/components/extensions/ExtensionDebugWindow.tsx',
            'src/components/settings/DesktopSettings.tsx',
        ];
        for (const rel of files) {
            const source = readFileSync(join(ROOT, rel), 'utf8');
            expect(source).not.toMatch(/electron\.invoke\(|tatakaiRuntime\.invoke\(/);
        }
    });
});

describe('IPC sender guard (DESK-2)', () => {
    const opts = {
        isDev: false,
        distDir: resolve(ROOT, 'dist'),
        desktopDir: resolve(ROOT, 'desktop'),
    };

    it('trusts the packaged app:// renderer only', () => {
        expect(isTrustedFrameUrl('app://tatakai.me/index.html', opts)).toBe(true);
        expect(isTrustedFrameUrl('app://tatakai.me/', opts)).toBe(true);
        expect(isTrustedFrameUrl('app://evil.example/index.html', opts)).toBe(false);
        expect(isTrustedFrameUrl('app://tatakai.me.evil.example/', opts)).toBe(false);
    });

    it('trusts local files inside the app directories only', () => {
        expect(isTrustedFrameUrl(pathToFileURL(join(opts.distDir, 'index.html')).href, opts)).toBe(true);
        expect(isTrustedFrameUrl(pathToFileURL(join(opts.desktopDir, 'offline.html')).href, opts)).toBe(true);
        expect(isTrustedFrameUrl(pathToFileURL(join(ROOT, 'secrets.txt')).href, opts)).toBe(false);
        expect(isTrustedFrameUrl(pathToFileURL(join(opts.distDir, '../../secrets.txt')).href, opts)).toBe(false);
        expect(isTrustedFrameUrl(pathToFileURL(`${opts.distDir}-other/index.html`).href, opts)).toBe(false);
    });

    it('trusts the dev server only in development', () => {
        expect(isTrustedFrameUrl('http://localhost:8090/', { ...opts, isDev: true })).toBe(true);
        expect(isTrustedFrameUrl('http://localhost:8090/', opts)).toBe(false);
        expect(isTrustedFrameUrl('https://evil.example/', { ...opts, isDev: true })).toBe(false);
    });

    it('denies non-web schemes and malformed URLs', () => {
        for (const url of ['', 'javascript:alert(1)', 'data:text/html,<h1>x', 'about:blank', 'tatakai-media://c/x']) {
            expect(isTrustedFrameUrl(url, opts)).toBe(false);
        }
    });

    it('wraps ipcMain.handle and rejects untrusted senders', async () => {
        const handlers = new Map();
        const fakeIpcMain = {
            handle(channel, listener) { handlers.set(channel, listener); },
        };
        installIpcSenderGuard(fakeIpcMain, opts);

        let executed = 0;
        fakeIpcMain.handle('fs:read-anything', async () => {
            executed += 1;
            return 'secret';
        });
        const handler = handlers.get('fs:read-anything');

        const trusted = { senderFrame: { url: 'app://tatakai.me/index.html' } };
        expect(await handler(trusted, '/etc/passwd')).toBe('secret');
        expect(executed).toBe(1);

        const untrusted = { senderFrame: { url: 'https://evil.example/pwn.html' } };
        await expect(handler(untrusted, '/etc/passwd')).rejects.toThrow(/untrusted sender/);
        expect(executed).toBe(1);

        const destroyed = { senderFrame: null };
        await expect(handler(destroyed, '/etc/passwd')).rejects.toThrow(/untrusted sender/);
        expect(executed).toBe(1);
    });
});
