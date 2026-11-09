import { expect, spyOn, test } from 'bun:test';
import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { Capacitor } from '@capacitor/core';
import { CaptchaWidget, type CaptchaWidgetHandle } from './CaptchaWidget';
import { CAPTCHA_TOKEN_MAX_AGE_MS, SecurityRequestError } from '@/lib/security/captcha';
import { capClient } from '@/lib/security/capClient';

type Solve = { action: string; signal?: AbortSignal; resolve: (token: string) => void; reject: (error: Error) => void };
async function withWidget(run: (root: Root, dom: JSDOM, solves: Solve[]) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://tatakai.me' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement,
    localStorage: globalThis.localStorage, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT };
  const originalNative = Capacitor.isNativePlatform, originalPlatform = Capacitor.getPlatform;
  const originalEnabled = process.env.VITE_CAPTCHA_ENABLED;
  process.env.VITE_CAPTCHA_ENABLED = 'true';
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  const solves: Solve[] = [];
  const solver = spyOn(capClient, 'solve').mockImplementation((action, signal) => new Promise((resolve, reject) => solves.push({ action, signal, resolve, reject })));
  const root = createRoot(dom.window.document.getElementById('root')!);
  try { await run(root, dom, solves); }
  finally {
    await act(async () => root.unmount());
    solver.mockRestore();
    Object.assign(globalThis, previous);
    Object.assign(Capacitor, { isNativePlatform: originalNative, getPlatform: originalPlatform });
    if (originalEnabled === undefined) delete process.env.VITE_CAPTCHA_ENABLED;
    else process.env.VITE_CAPTCHA_ENABLED = originalEnabled;
    dom.window.close();
  }
}

test('iOS, Android and web all solve in the background without a visible challenge', async () => {
  for (const [native, platform] of [[true, 'ios'], [true, 'android'], [false, 'web']] as const) {
    await withWidget(async (root, dom, solves) => {
      Object.assign(Capacitor, { isNativePlatform: () => native, getPlatform: () => platform });
      const tokens: string[] = [];
      await act(async () => root.render(<CaptchaWidget action="signin" onToken={token => tokens.push(token)} />));
      expect(solves).toHaveLength(1);
      expect(solves[0].action).toBe('signin');
      expect(dom.window.document.getElementById('root')?.childElementCount).toBe(0);
      await act(async () => solves[0].resolve('cap-proof'));
      expect(tokens).toEqual(['cap-proof']);
      expect(dom.window.document.querySelectorAll('script,iframe,input,button').length).toBe(0);
    });
  }
});
test('reset and action changes abort previous solves and reject stale completions', () => withWidget(async (root, _dom, solves) => {
  const ref = createRef<CaptchaWidgetHandle>(), tokens: string[] = [];
  await act(async () => root.render(<CaptchaWidget ref={ref} action="signin" onToken={token => tokens.push(token)} />));
  await act(async () => ref.current?.reset());
  expect(solves[0].signal?.aborted).toBe(true);
  await act(async () => { solves[0].resolve('stale-proof'); solves[1].resolve('fresh-proof'); });
  expect(tokens).toEqual(['fresh-proof']);
  await act(async () => root.render(<CaptchaWidget ref={ref} action="signup" onToken={token => tokens.push(token)} />));
  expect(solves[1].signal?.aborted).toBe(true);
  expect(solves[2].action).toBe('signup');
  await act(async () => solves[2].resolve('signup-proof'));
  expect(tokens).toEqual(['fresh-proof', 'signup-proof']);
}));
test('proof refreshes before expiry and cannot retain an expired token', () => withWidget(async (root, _dom, solves) => {
  let token: string | null = null, expire: (() => void) | undefined;
  const originalTimeout = globalThis.setTimeout;
  const timer = spyOn(globalThis, 'setTimeout').mockImplementation(((callback: any, delay?: number, ...args: any[]) => {
    if (delay === CAPTCHA_TOKEN_MAX_AGE_MS) { expire = callback; return 999; }
    return originalTimeout(callback, delay, ...args);
  }) as typeof setTimeout);
  try {
    await act(async () => root.render(<CaptchaWidget action="signin" onToken={value => { token = value; }} onExpire={() => { token = null; }} />));
    await act(async () => solves[0].resolve('first-proof'));
    expect(token).toBe('first-proof');
    expect(expire).toBeDefined();
    await act(async () => expire!());
    expect(token).toBeNull();
    expect(solves).toHaveLength(2);
    await act(async () => solves[1].resolve('new-proof'));
    expect(token).toBe('new-proof');
  } finally { timer.mockRestore(); }
}));
test('an unavailable solve clears proof, shows a retry, and keeps failures closed', () => withWidget(async (root, dom, solves) => {
  let errors = 0, token: string | null = null;
  await act(async () => root.render(<CaptchaWidget action="report" onToken={value => { token = value; }} onError={() => { errors++; }} />));
  await act(async () => solves[0].reject(new Error('Unavailable')));
  expect(token).toBeNull();
  expect(errors).toBe(1);
  expect(dom.window.document.querySelector('[role="status"]')).not.toBeNull();
  await act(async () => dom.window.document.querySelector<HTMLButtonElement>('button')!.click());
  await act(async () => solves[1].resolve('retry-proof'));
  expect(token).toBe('retry-proof');
  expect(dom.window.document.querySelector('button')).toBeNull();
}));
test('timeouts use the timeout callback and unmount cancels pending work', () => withWidget(async (root, _dom, solves) => {
  let timeouts = 0;
  await act(async () => root.render(<CaptchaWidget action="recover" onToken={() => {}} onTimeout={() => { timeouts++; }} />));
  await act(async () => solves[0].reject(new SecurityRequestError('Verification timed out', 0, 'timeout')));
  expect(timeouts).toBe(1);
  await act(async () => root.render(null));
  expect(solves[0].signal?.aborted).toBe(true);
}));

test('disabled CAPTCHA mounts nothing and starts no verification', () => withWidget(async (root, dom, solves) => {
  process.env.VITE_CAPTCHA_ENABLED = 'false';
  await act(async () => root.render(<CaptchaWidget action="signin" onToken={() => { throw new Error('Unexpected proof'); }} />));
  expect(solves).toHaveLength(0);
  expect(dom.window.document.getElementById('root')?.childElementCount).toBe(0);
}));
