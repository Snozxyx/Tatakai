import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Capacitor } from '@capacitor/core';
import { needsHostedTurnstile, readHostedTurnstileMessage } from '../src/lib/security/turnstile';

const platform = Capacitor.getPlatform;
const native = Capacitor.isNativePlatform;
afterEach(() => Object.assign(Capacitor, { getPlatform: platform, isNativePlatform: native }));

describe('iOS CAPTCHA bridge', () => {
  test('uses HTTPS hosting only in native iOS, preserving Safari and Android', () => {
    Capacitor.getPlatform = () => 'ios';
    Capacitor.isNativePlatform = () => true;
    expect(needsHostedTurnstile()).toBe(true);
    Capacitor.getPlatform = () => 'android';
    expect(needsHostedTurnstile()).toBe(false);
    Capacitor.getPlatform = () => 'ios';
    Capacitor.isNativePlatform = () => false;
    expect(needsHostedTurnstile()).toBe(false);
  });

  test('rejects forged messages, other frames, stale renders and malformed tokens', () => {
    const source = {} as Window;
    const data = { type: 'tatakai-turnstile', id: 'current', event: 'token', token: 'fresh-token' };
    const message = { origin: 'https://tatakai.me', source, data } as MessageEvent;
    expect(readHostedTurnstileMessage(message, source, 'current')).toEqual(data);
    for (const patch of [
      { origin: 'https://evil.example' }, { source: {} },
      { data: { ...data, id: 'previous' } }, { data: { ...data, token: '' } },
      { data: { ...data, token: 'x'.repeat(2049) } }, { data: { ...data, token: 42 } },
      { data: { ...data, event: 'unknown' } }, { data: null },
    ]) {
      expect(readHostedTurnstileMessage({ ...message, ...patch } as MessageEvent, source, 'current')).toBeNull();
    }
    expect(readHostedTurnstileMessage(message, null, 'current')).toBeNull();
  });

  function loadPage(search: string) {
    const html = readFileSync(new URL('../public/security/turnstile.html', import.meta.url), 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    const messages: any[] = [];
    const scripts: any[] = [];
    let options: any;
    const context = {
      URLSearchParams, location: { search },
      parent: { postMessage: (message: any) => messages.push(message) },
      window: { turnstile: { render: (_selector: string, opts: any) => { options = opts; } } },
      document: { createElement: () => ({}), head: { appendChild: (element: any) => scripts.push(element) } },
    };
    runInNewContext(script, context);
    return { messages, scripts, options: () => options };
  }

  test('hosted page forwards fresh tokens and lifecycle events without redeeming tokens', () => {
    const page = loadPage('?id=' + 'a'.repeat(32) + '&sitekey=public-key&action=login');
    expect(page.scripts).toHaveLength(1);
    expect(page.scripts[0].src).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
    page.scripts[0].onload();
    const options = page.options();
    expect(options.sitekey).toBe('public-key');
    expect(options.action).toBe('login');
    options.callback('single-use-token');
    options['expired-callback']();
    options['error-callback']();
    options['timeout-callback']();
    expect(page.messages.map(message => message.event)).toEqual(['ready', 'token', 'expired', 'error', 'timeout']);
    expect(page.messages[1].token).toBe('single-use-token');
    expect(page.messages.every(message => message.id === 'a'.repeat(32))).toBe(true);
  });

  test('reports blocked scripts and rejects invalid page parameters', () => {
    const page = loadPage('?id=' + 'a'.repeat(32) + '&sitekey=key');
    page.scripts[0].onerror();
    expect(page.messages[0].event).toBe('error');
    expect(loadPage('?id=invalid&sitekey=key').scripts).toHaveLength(0);
    expect(loadPage('?id=' + 'a'.repeat(32) + '&sitekey=key&action=bad%20action').scripts).toHaveLength(0);
  });
});
