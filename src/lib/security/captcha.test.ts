import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Capacitor } from '@capacitor/core';
import { getCapApiEndpoint, isCaptchaRequired, requestSecurity, SecurityRequestError } from './captcha';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalNative = Capacitor.isNativePlatform;
const originalPlatform = Capacitor.getPlatform;
const originalEnabled = process.env.VITE_CAPTCHA_ENABLED;
beforeEach(() => { process.env.VITE_CAPTCHA_ENABLED = 'true'; });
afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  Object.assign(Capacitor, { isNativePlatform: originalNative, getPlatform: originalPlatform });
  if (originalEnabled === undefined) delete process.env.VITE_CAPTCHA_ENABLED;
  else process.env.VITE_CAPTCHA_ENABLED = originalEnabled;
});
function runtime(native: boolean, platform: string, protocol = 'https:') {
  Object.assign(Capacitor, { isNativePlatform: () => native, getPlatform: () => platform });
  globalThis.window = { location: { protocol } } as Window;
}

describe('Cap platform policy', () => {
  test('web, iOS, Android, TV and packaged desktop all require verification without a site key', () => {
    for (const [native, platform, protocol] of [
      [false, 'web', 'https:'], [false, 'ios', 'https:'], [true, 'ios', 'capacitor:'],
      [true, 'android', 'https:'], [false, 'web', 'app:'], [false, 'web', 'file:'],
    ] as const) {
      runtime(native, platform, protocol);
      expect(isCaptchaRequired()).toBe(true);
      expect(getCapApiEndpoint('signin')).toEndWith('/api/v3/security/cap/signin/');
      expect(getCapApiEndpoint('recover')).toEndWith('/api/v3/security/cap/recover/');
    }
  });
  test('every platform forwards the actual proof and discards old bypass markers', async () => {
    for (const [native, platform] of [[false, 'web'], [true, 'ios'], [true, 'android']] as const) {
      runtime(native, platform, native && platform === 'ios' ? 'capacitor:' : 'https:');
      let posted: unknown;
      globalThis.fetch = (async (_url, init) => {
        posted = JSON.parse(String(init?.body));
        return Response.json({ success: true, data: { ok: true } });
      }) as typeof fetch;
      const input = { captchaToken: 'cap-proof', clientPlatform: 'ios-capacitor', rating: 5 };
      await requestSecurity('submissions/feedback', input);
      expect(posted).toEqual({ captchaToken: 'cap-proof', rating: 5 });
      expect(input.clientPlatform).toBe('ios-capacitor');
    }
  });
  test('a missing proof cannot send a mutation, including on native iOS', async () => {
    runtime(true, 'ios', 'capacitor:');
    let called = false;
    globalThis.fetch = (async () => { called = true; throw new Error('Unexpected request'); }) as typeof fetch;
    for (const captchaToken of [undefined, null, '', 'has whitespace']) {
      await expect(requestSecurity('submissions/report', { captchaToken, clientPlatform: 'ios-capacitor' })).rejects.toBeInstanceOf(SecurityRequestError);
    }
    expect(called).toBe(false);
  });
});

test('protected request failures never become successful mutations', async () => {
  runtime(false, 'web');
  for (const response of [Response.json({ success: true }), new Response('<html>SPA fallback</html>'), Response.json({ success: false, error: 'Verification failed' }, { status: 403 })]) {
    globalThis.fetch = (async () => response) as typeof fetch;
    await expect(requestSecurity('submissions/report', { captchaToken: 'fixture-token' })).rejects.toBeInstanceOf(SecurityRequestError);
  }
});
test('cancellation aborts the underlying protected request', async () => {
  runtime(false, 'web');
  let signal: AbortSignal | undefined;
  globalThis.fetch = ((_url, init) => new Promise((_resolve, reject) => {
    signal = init?.signal as AbortSignal;
    signal.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError')), { once: true });
  })) as typeof fetch;
  const reset = new AbortController();
  const pending = requestSecurity('submissions/report', { captchaToken: 'fixture-token' }, { signal: reset.signal });
  reset.abort();
  await expect(pending).rejects.toHaveProperty('name', 'AbortError');
  expect(signal?.aborted).toBe(true);
});

test('disabled CAPTCHA makes native submissions without proof and never starts Cap', async () => {
  process.env.VITE_CAPTCHA_ENABLED = 'false';
  runtime(true, 'ios', 'capacitor:');
  expect(isCaptchaRequired()).toBe(false);
  globalThis.fetch = (async (_url, init) => {
    expect(JSON.parse(String(init?.body))).toEqual({ rating: 5 });
    return Response.json({ success: true, data: { ok: true } });
  }) as typeof fetch;
  await requestSecurity('submissions/feedback', { rating: 5, captchaToken: 'old-proof' });
  const { solveCaptcha } = await import('./capClient');
  expect(await solveCaptcha('signin')).toBe('');
});
