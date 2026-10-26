/**
 * Regression test — Tatakai Home Server request-origin defences.
 *
 * SEC audit findings HOME-1 / HOME-2:
 *   HOME-1  the server trusted every loopback request as admin AND answered with
 *           `Access-Control-Allow-Origin: *`, so any web page (or a DNS-rebinding
 *           hostname that resolves to 127.0.0.1) could drive a LAN-exposed media
 *           server: read the library, delete files, start torrents.
 *   HOME-2  /auth/login was only covered by the global 120/min bucket.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createHomeServer } = require('../desktop/runtime/home-server/server.cjs');
const { createHomeServerStore } = require('../desktop/runtime/home-server/store.cjs');

const PORT = 18787;

function fakeStore() {
    const config = {
        enabled: true,
        port: PORT,
        bindMode: 'localhost',
        passwordHash: 'hash',
        passwordSalt: 'salt',
        users: [{ id: 'admin', name: 'Admin', role: 'admin', permissions: ['*'] }],
        tokens: {},
        // Simulate the wildcard saved by the previous release, rather than
        // testing only a clean install with the new safe defaults.
        corsOrigins: ['*'],
        rateLimitPerMinute: 500,
        requireConsent: false,
        consentRequests: [],
    };
    let saved = JSON.stringify(config);
    return createHomeServerStore({
        app: { getPath: () => import.meta.dir },
        fs: {
            existsSync: () => true,
            readFileSync: () => saved,
            writeFileSync: (_path, value) => { saved = value; },
        },
        logger: { warn() {} },
    });
}

const adapters = new Proxy(
    {},
    {
        get: () => async () => ({ success: true }),
    }
);

let server;

beforeAll(async () => {
    server = createHomeServer({
        store: fakeStore(),
        adapters,
        logger: { info() {}, warn() {}, error() {} },
    });
    await server.start({ bindMode: 'localhost', port: PORT });
});

afterAll(async () => {
    await server.stop();
});

function request({ path = '/api/home/health', method = 'GET', headers = {}, body = null }) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            { host: '127.0.0.1', port: PORT, path, method, headers, setHost: false },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () =>
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: Buffer.concat(chunks).toString('utf8'),
                    })
                );
            }
        );
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

describe('home server origin guard', () => {
    it('serves a loopback request with a loopback Host header', async () => {
        const res = await request({ headers: { host: `127.0.0.1:${PORT}` } });
        expect(res.status).toBe(200);
        expect(res.body).toContain('Tatakai Home Server');
    });

    it('rejects a DNS-rebinding Host header (HOME-1)', async () => {
        const res = await request({ headers: { host: `attacker.example:${PORT}` } });
        expect(res.status).toBe(403);
        expect(res.body).toContain('host_not_allowed');
    });

    it('rejects a cross-origin browser request (HOME-1)', async () => {
        const res = await request({
            path: '/api/home/status',
            headers: { host: `127.0.0.1:${PORT}`, origin: 'https://attacker.example' },
        });
        expect(res.status).toBe(403);
        expect(res.body).toContain('origin_not_allowed');
    });

    it('does not hand out a wildcard CORS header by default (HOME-1)', async () => {
        // Same-origin (its own web UI): allowed, but with no CORS grant.
        const res = await request({
            headers: { host: `127.0.0.1:${PORT}`, origin: `http://127.0.0.1:${PORT}` },
        });
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBeUndefined();

        // A different origin on the same machine is a different origin: refused.
        const other = await request({
            headers: { host: `127.0.0.1:${PORT}`, origin: 'http://localhost:8787' },
        });
        expect(other.status).toBe(403);
        expect(other.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('allows same-origin browser requests from its own UI', async () => {
        const res = await request({
            headers: { host: `127.0.0.1:${PORT}`, origin: `http://127.0.0.1:${PORT}` },
        });
        expect(res.status).toBe(200);
    });

    it('rate-limits password brute force on /auth/login (HOME-2)', async () => {
        const attempt = () =>
            request({
                path: '/api/home/auth/login',
                method: 'POST',
                headers: {
                    host: `127.0.0.1:${PORT}`,
                    'content-type': 'application/json',
                    'content-length': '16',
                },
                body: '{"password":"x"}',
            });
        let sawTooMany = false;
        for (let i = 0; i < 14; i += 1) {
            const res = await attempt();
            if (res.status === 429) {
                sawTooMany = true;
                break;
            }
            expect(res.status).toBe(401);
        }
        expect(sawTooMany).toBe(true);
    });

    it('does not echo internal error text from a malformed login body', async () => {
        const res = await request({
            path: '/api/home/auth/login',
            method: 'POST',
            headers: {
                host: `127.0.0.1:${PORT}`,
                'content-type': 'application/json',
                'content-length': '7',
            },
            body: '{oops,}',
        });
        expect([400, 429]).toContain(res.status);
        expect(res.body).not.toContain('Unexpected token');
        expect(res.body).not.toContain('SyntaxError');
    });
});
