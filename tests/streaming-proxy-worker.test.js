/**
 * Regression test — Cloudflare streaming proxy hardening.
 *
 * SEC audit findings PW-1..PW-3:
 *   PW-1  shared password is shipped to browsers, so it is a speed bump, not a
 *         secret → constant-time compare + per-IP rate limit.
 *   PW-2  `redirect: 'follow'` let an allowed upstream bounce the proxy to a
 *         private address, defeating the isBlockedHost() SSRF guard.
 *   PW-3  upstream error text was echoed back to the caller.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import worker from '../cloudflare-worker/src/index.js';

const PROXY = 'https://proxy.test/api/v1/streamingProxy';
const realFetch = globalThis.fetch;

function proxyRequest(params, init = {}) {
  const url = new URL(PROXY);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Request(url.toString(), init);
}

describe('streaming proxy worker', () => {
  beforeEach(() => {
    globalThis.fetch = realFetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('answers health checks', async () => {
    const res = await worker.fetch(new Request('https://proxy.test/health'), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, path: '/api/v1/streamingProxy' });
  });

  it('refuses targets that are loopback / link-local / private (SSRF)', async () => {
    for (const target of [
      'http://169.254.169.254/latest/meta-data/',
      'http://127.0.0.1:8099/api/v3/toko/sources',
      'http://localhost:9001/proxy',
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://[::1]/',
    ]) {
      const res = await worker.fetch(proxyRequest({ url: target }), {});
      expect(res.status).toBe(403);
    }
  });

  it('refuses non-http(s) schemes', async () => {
    const res = await worker.fetch(proxyRequest({ url: 'file:///etc/passwd' }), {});
    expect(res.status).toBe(400);
  });

  it('re-validates every redirect hop instead of following blindly (PW-2)', async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/iam/' },
      });
    };

    const res = await worker.fetch(proxyRequest({ url: 'https://cdn.example/manifest.m3u8' }), {});
    expect(res.status).toBe(403);
    // The private hop must never be requested.
    expect(calls).toEqual(['https://cdn.example/manifest.m3u8']);
  });

  it('follows an allowed redirect chain and stops after 3 hops', async () => {
    let hop = 0;
    globalThis.fetch = async () => {
      hop += 1;
      return new Response(null, {
        status: 302,
        headers: { location: `https://cdn.example/hop-${hop}` },
      });
    };
    const res = await worker.fetch(proxyRequest({ url: 'https://cdn.example/start' }), {});
    expect(res.status).toBe(403);
    expect(hop).toBe(4); // start + 3 hops, then refused instead of looping
  });

  it('enforces the configured password in constant time', async () => {
    globalThis.fetch = async () =>
      new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });

    const env = { PROXY_PASSWORD: 'super-secret-value' };
    const denied = await worker.fetch(proxyRequest({ url: 'https://cdn.example/a', password: 'nope' }), env);
    expect(denied.status).toBe(403);

    const allowed = await worker.fetch(
      proxyRequest({ url: 'https://cdn.example/a', password: 'super-secret-value' }),
      env
    );
    expect(allowed.status).toBe(200);
  });

  it('does not leak upstream error details (PW-3)', async () => {
    globalThis.fetch = async () => {
      throw new Error('getaddrinfo ENOTFOUND internal-corp-host.local');
    };
    const res = await worker.fetch(proxyRequest({ url: 'https://cdn.example/a' }), {});
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).not.toContain('internal-corp-host');
    expect(body).not.toContain('ENOTFOUND');
  });

  it('honours ALLOWED_UPSTREAM_HOSTS', async () => {
    globalThis.fetch = async () => new Response('ok', { status: 200 });
    const env = { ALLOWED_UPSTREAM_HOSTS: 'cdn.example,media.example' };
    const blocked = await worker.fetch(proxyRequest({ url: 'https://other.example/a' }), env);
    expect(blocked.status).toBe(403);
    const allowed = await worker.fetch(proxyRequest({ url: 'https://cdn.example/a' }), env);
    expect(allowed.status).toBe(200);
  });

  it('rate-limits a single client looping the proxy', async () => {
    globalThis.fetch = async () => new Response('ok', { status: 200 });
    const env = { RATE_LIMIT_PER_10S: '2' };
    const make = () =>
      new Request(`${PROXY}?url=${encodeURIComponent('https://cdn.example/a')}`, {
        headers: { 'cf-connecting-ip': '203.0.113.77' },
      });
    expect((await worker.fetch(make(), env)).status).toBe(200);
    expect((await worker.fetch(make(), env)).status).toBe(200);
    expect((await worker.fetch(make(), env)).status).toBe(429);
  });
});
