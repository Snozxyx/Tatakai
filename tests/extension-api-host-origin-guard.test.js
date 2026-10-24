/**
 * Regression test — Extension-API host request-origin defences.
 *
 * SEC audit finding EXT-3: the extension API host binds 127.0.0.1 on a *stable*
 * preferred port (8099), answered every request with
 * `Access-Control-Allow-Origin: *` and performed no request-origin check. Any
 * page the user had open — or a DNS-rebinding hostname aimed at that port —
 * could read `/api/v3/<namespace>/sources` (provider lists, search results,
 * proxied media URLs) out of the desktop app.
 *
 * The guard is pure, so it is tested directly rather than through a socket.
 */
import { describe, it, expect } from 'bun:test';
import { createRequire } from 'node:module';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { evaluateRequestOrigin, isAllowedHostHeader } = require('../desktop/runtime/extension-api-host/host-server.cjs');

const allowed = (headers) => evaluateRequestOrigin(headers).ok;

describe('extension API host origin guard (EXT-3)', () => {
    it('accepts the renderer origins the app actually uses', () => {
        for (const origin of [
            'http://localhost:8090',
            'http://127.0.0.1:8090',
            'app://tatakai',
            'file://',
            'capacitor://localhost',
        ]) {
            expect(allowed({ host: '127.0.0.1:8099', origin })).toBe(true);
        }
    });

    it('accepts requests with no Origin (media elements, non-browser clients)', () => {
        expect(allowed({ host: '127.0.0.1:8099' })).toBe(true);
        expect(allowed({ host: 'localhost:8099' })).toBe(true);
    });

    it('refuses a random website reading the host', () => {
        // This is the finding: with `ACAO: *` this request succeeded.
        const result = evaluateRequestOrigin({ host: '127.0.0.1:8099', origin: 'https://evil.example' });
        expect(result.ok).toBe(false);
        expect(result.allowOrigin).toBe('');
    });

    it('refuses a nullable origin that a real browser initiated (sandboxed iframe)', () => {
        expect(allowed({ host: '127.0.0.1:8099', origin: 'null', 'sec-fetch-mode': 'cors' })).toBe(false);
        expect(allowed({ host: '127.0.0.1:8099', origin: 'null', 'sec-fetch-site': 'cross-site' })).toBe(false);
        // An Electron `file://` renderer sends Origin: null without Sec-Fetch-*.
        expect(allowed({ host: '127.0.0.1:8099', origin: 'null' })).toBe(true);
    });

    it('refuses a public hostname in Host (DNS rebinding)', () => {
        expect(isAllowedHostHeader('attacker.example:8099')).toBe(false);
        expect(allowed({ host: 'attacker.example:8099', origin: 'http://attacker.example' })).toBe(false);
        expect(isAllowedHostHeader('localhost:8099')).toBe(true);
        expect(isAllowedHostHeader('127.0.0.1:8099')).toBe(true);
        expect(isAllowedHostHeader('[::1]:8099')).toBe(true);
        expect(isAllowedHostHeader(String(os.hostname()))).toBe(true);
        expect(isAllowedHostHeader('')).toBe(false);
    });

    it('echoes a trusted origin instead of a wildcard', () => {
        expect(evaluateRequestOrigin({ host: '127.0.0.1:8099', origin: 'http://localhost:8090' }).allowOrigin)
            .toBe('http://localhost:8090');
        // No Origin → wildcard is inert (no browser enforces CORS on it).
        expect(evaluateRequestOrigin({ host: '127.0.0.1:8099' }).allowOrigin).toBe('*');
    });

    it('refuses a malformed Origin header', () => {
        expect(allowed({ host: '127.0.0.1:8099', origin: 'not a url' })).toBe(false);
    });
});
