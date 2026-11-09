import { afterEach, beforeEach, expect, test, spyOn } from 'bun:test';
import { Capacitor } from '@capacitor/core';
import { requestProtectedAuth } from './protectedAuth';

const originalFetch = globalThis.fetch;
const originalEnabled = process.env.VITE_CAPTCHA_ENABLED;
beforeEach(() => { process.env.VITE_CAPTCHA_ENABLED = 'true'; });
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEnabled === undefined) delete process.env.VITE_CAPTCHA_ENABLED;
  else process.env.VITE_CAPTCHA_ENABLED = originalEnabled;
});

test('missing CAPTCHA proof stops the auth request before any network access', async () => {
  let called = false;
  globalThis.fetch = (async () => { called = true; throw new Error('Unexpected request'); }) as typeof fetch;
  await expect(requestProtectedAuth('sign-in', { email: 'test@example.invalid', password: 'example' })).rejects.toThrow('verification challenge');
  expect(called).toBe(false);
});

test('sign-in sends its proof only to the protected API and rejects incomplete sessions', async () => {
  globalThis.fetch = (async (url, init) => {
    expect(String(url)).toEndWith('/api/v3/security/auth/sign-in');
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'test@example.invalid', password: 'example', captchaToken: 'proof' });
    return Response.json({ success: true, data: { session: { access_token: 'access' } } });
  }) as typeof fetch;
  await expect(requestProtectedAuth('sign-in', { email: 'test@example.invalid', password: 'example', captchaToken: 'proof' })).rejects.toThrow('Invalid authentication response');
});

test('operations signup preserves restricted mode without accepting an invalid mode', async () => {
  globalThis.fetch = (async url => {
    expect(String(url)).toEndWith('/api/v3/auth/signup');
    return Response.json({ mode: 'restricted' });
  }) as typeof fetch;
  expect((await requestProtectedAuth('sign-up', { captchaToken: 'proof' }, true)).mode).toBe('restricted');
  globalThis.fetch = (async () => Response.json({ mode: 'unexpected' })) as typeof fetch;
  await expect(requestProtectedAuth('sign-up', { captchaToken: 'proof' }, true)).rejects.toThrow('Invalid registration response');
});

test('auth failures and malformed success envelopes never authenticate a caller', async () => {
  for (const response of [Response.json({ data: { ok: true } }), Response.json({ success: false, error: 'Complete a new challenge' }, { status: 403 }), new Response('invalid JSON')]) {
    globalThis.fetch = (async () => response) as typeof fetch;
    await expect(requestProtectedAuth('recover', { captchaToken: 'proof' })).rejects.toThrow();
  }
});

test('native iOS auth requires and forwards its Cap proof without a platform bypass', async () => {
  const native = spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  const platform = spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
  try {
    globalThis.fetch = (async (url, init) => {
      expect(String(url)).toEndWith('/api/v3/security/auth/sign-in');
      expect(JSON.parse(String(init?.body))).toEqual({ email: 'test@example.invalid', password: 'example', captchaToken: 'cap-proof' });
      return Response.json({ success: true, data: { session: { access_token: 'access', refresh_token: 'refresh' } } });
    }) as typeof fetch;
    await expect(requestProtectedAuth('sign-in', { email: 'test@example.invalid', password: 'example', captchaToken: 'cap-proof' })).resolves.toHaveProperty('session');
    await expect(requestProtectedAuth('sign-in', { email: 'test@example.invalid', password: 'example', clientPlatform: 'ios-capacitor' })).rejects.toThrow('verification challenge');
  } finally {
    native.mockRestore(); platform.mockRestore();
  }
});

test('web auth cannot insert an iOS marker through the helper', async () => {
  const native = spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
  try {
    globalThis.fetch = (async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ captchaToken: 'proof' });
      return Response.json({ success: true, data: { ok: true } });
    }) as typeof fetch;
    await requestProtectedAuth('recover', { captchaToken: 'proof', clientPlatform: 'ios-capacitor' });
  } finally { native.mockRestore(); }
});

test('disabled CAPTCHA sends sign-in without a proof or platform marker', async () => {
  process.env.VITE_CAPTCHA_ENABLED = 'false';
  globalThis.fetch = (async (_url, init) => {
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'test@example.invalid', password: 'example' });
    return Response.json({ success: true, data: { session: { access_token: 'access', refresh_token: 'refresh' } } });
  }) as typeof fetch;
  await expect(requestProtectedAuth('sign-in', { email: 'test@example.invalid', password: 'example', captchaToken: 'old-proof', clientPlatform: 'ios-capacitor' })).resolves.toHaveProperty('session');
});
