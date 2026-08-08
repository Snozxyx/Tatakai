/**
 * Worker helper tests — __tatakai_fetch__ permission and forwarding
 * Requirements: 14.1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  __tatakai_fetch__,
  __tatakai_parse_html__,
  __tatakai_anitomy__,
  createTatakaiFetch,
} from '../../desktop/runtime/extension/extension-worker-pool.cjs';

// ── __tatakai_fetch__ ─────────────────────────────────────────────────────────

describe('__tatakai_fetch__', () => {
  it('throws PermissionDeniedError for non-allowlisted hostname', async () => {
    const allowed = ['allowed.example.com'];
    const fn = (url: string, init?: RequestInit) => __tatakai_fetch__(allowed, url, init);

    const err = await fn('https://blocked.evil.com/api').catch(e => e);
    expect(err.name).toBe('PermissionDeniedError');
    expect(err.message).toMatch(/blocked\.evil\.com/);
  });

  it('throws PermissionDeniedError without making any network request', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const allowed: string[] = [];
    const fn = (url: string, init?: RequestInit) => __tatakai_fetch__(allowed, url, init);

    await fn('https://blocked.com/api').catch(() => {});
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('forwards request to allowlisted domain with correct Referer and User-Agent', async () => {
    const mockResponse = new Response('{"ok":true}', { status: 200 });
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

    const allowed = ['api.example.com'];
    const fn = (url: string, init?: RequestInit) => __tatakai_fetch__(allowed, url, init);

    await fn('https://api.example.com/data', {
      headers: {
        Referer: 'https://example.com/',
        'User-Agent': 'TestAgent/1.0',
      },
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, callInit] = fetchSpy.mock.calls[0] as any[];
    const headers = callInit?.headers ?? {};
    expect(headers['Referer']).toBe('https://example.com/');
    expect(headers['User-Agent']).toBe('TestAgent/1.0');
    fetchSpy.mockRestore();
  });

  it('does NOT add default headers when caller omits them', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

    const allowed = ['api.example.com'];
    const fn = (url: string, init?: RequestInit) => __tatakai_fetch__(allowed, url, init);

    await fn('https://api.example.com/data');

    const [, callInit] = fetchSpy.mock.calls[0] as any[];
    const headers = callInit?.headers ?? {};
    expect(headers['User-Agent']).toBeUndefined();
    expect(headers['Referer']).toBeUndefined();
    fetchSpy.mockRestore();
  });

  it('throws FetchTimeoutError when request stalls past 30s', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
      new Promise(() => { /* never resolves */ })
    );

    const allowed = ['slow.example.com'];
    const fn = (url: string, init?: RequestInit) => __tatakai_fetch__(allowed, url, init);

    const errPromise = fn('https://slow.example.com/api').catch(e => e);
    vi.advanceTimersByTime(31_000);
    const err = await errPromise;

    expect(err.name).toBe('FetchTimeoutError');
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it('throws ProxyUnavailableError on ECONNREFUSED', async () => {
    const connRefused = Object.assign(new Error('connect ECONNREFUSED'), { cause: { code: 'ECONNREFUSED' } });
    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(connRefused);

    const allowed = ['api.example.com'];
    const fn = (url: string, init?: RequestInit) => __tatakai_fetch__(allowed, url, init);

    const err = await fn('https://api.example.com/data').catch(e => e);
    expect(err.name).toBe('ProxyUnavailableError');
    fetchSpy.mockRestore();
  });
});

// ── createTatakaiFetch ────────────────────────────────────────────────────────

describe('createTatakaiFetch', () => {
  it('creates a bound (url, init?) function that respects manifest permissions', async () => {
    const manifest = { permissions: ['network:domain:allowed.test'] };
    const fn = createTatakaiFetch(manifest);

    const err = await fn('https://not-allowed.test/api').catch(e => e);
    expect(err.name).toBe('PermissionDeniedError');
  });
});
