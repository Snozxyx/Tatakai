import { describe, expect, it } from 'bun:test';
import { sourceCookie } from '../desktop/runtime/compatibility/aniyomi-cookies.cjs';
import { AniyomiHost } from '../desktop/runtime/compatibility/aniyomi.cjs';

describe('original extension session cookies', () => {
  it('preserves parent-domain scope, expiry, flags and values containing equals', () => {
    expect(sourceCookie('https://api.source.test/anime/title', 'session=abc==; Domain=.source.test; Path=/anime; HttpOnly; Secure; SameSite=Lax; Max-Age=300', 1000))
      .toMatchObject({ name: 'session', value: 'abc==', domain: '.source.test', path: '/anime', httpOnly: true, secure: true, sameSite: 'lax', expirationDate: 1300 });
  });
  it('honors expiry and deletion without widening default path or host scope', () => {
    const cookie = sourceCookie('https://source.test/session/login', 'csrf=value; Expires=Wed, 21 Oct 2037 07:28:00 GMT');
    expect(cookie.path).toBe('/session'); expect(cookie.domain).toBeUndefined(); expect(cookie.expirationDate).toBe(Date.parse('2037-10-21T07:28:00Z') / 1000);
    expect(sourceCookie('https://source.test/', 'session=; Max-Age=0; Expires=Wed, 21 Oct 2037 07:28:00 GMT')).toMatchObject({ expirationDate: 1, httpOnly: true });
    expect(sourceCookie('https://source.test/', 'session=value; Expires=invalid').expirationDate).toBeUndefined();
  });
  it('rejects unrelated domains and malformed cookie input', () => {
    expect(sourceCookie('https://source.test/', 'session=x; Domain=other.test')).toBeNull();
    expect(sourceCookie('https://source.test/', 'session=x\r\nInjected: yes')).toBeNull();
    expect(sourceCookie('https://source.test/', 'bad name=x')).toBeNull();
    expect(() => sourceCookie('file:///local', 'session=x')).toThrow('URL');
  });
  it('retains later session cookies if Chromium rejects one cookie', async () => {
    const written: string[] = [], replies: unknown[] = [];
    const child = { stdin: { destroyed: false, write: (value: string) => replies.push(JSON.parse(value)) } };
    const host = new AniyomiHost({ root: '/unused', javaHost: {}, browser: { initialize() {}, session: { cookies: { async set(cookie: { name: string }) { if (cookie.name === 'rejected') throw Error('Cookie rejected'); written.push(cookie.name); } } } } });
    host.child = child;
    await host.callback({ event: 'setCookies', callbackId: 1, arguments: ['https://source.test/', ['rejected=x', 'session=valid; HttpOnly']] }, child);
    expect(written).toEqual(['session']); expect(replies).toEqual([{ callbackId: 1, result: null }]);
    host.child = null; host.stop();
  });
});
