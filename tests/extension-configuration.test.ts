import { it, expect } from 'bun:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { configuredManifest, openConfigureWindow } = require('../desktop/runtime/extension/configure-window.cjs');
it('captures configured Stremio links into Tatakai without an OS handler', async () => {
  const sent: any[] = []; const handlers: Record<string, any> = {}; let popup: any; let closed = false;
  class Window {
    webContents = { on: (name: string, fn: any) => handlers[name] = fn, setWindowOpenHandler: (fn: any) => popup = fn };
    on() {} loadURL() { return Promise.resolve(); } close() { closed = true; }
  }
  const parent = { isDestroyed: () => false, focus() {}, webContents: { send: (...args: any[]) => sent.push(args) } };
  const result = openConfigureWindow(Window, parent, 'https://gtsubs.strem.top/configure');
  let prevented = false;
  handlers['will-navigate']({ preventDefault: () => prevented = true }, 'stremio://gtsubs.strem.top/ja/manifest.json');
  expect(await result).toEqual({ success: true, manifestUrl: 'https://gtsubs.strem.top/ja/manifest.json' });
  expect(prevented).toBe(true); expect(closed).toBe(true);
  expect(sent).toEqual([['extension:configured', 'https://gtsubs.strem.top/ja/manifest.json']]);
  expect(popup({ url: 'stremio://gtsubs.strem.top/ja/manifest.json' })).toEqual({ action: 'deny' });
  expect(sent).toHaveLength(1);
  expect(configuredManifest('stremio://user:password@fixture.test/manifest.json')).toBeNull();
  expect(configuredManifest('javascript:alert(1)')).toBeNull();
});

it('repairs custom media wrappers before the desktop host registers a stream', () => {
  const { applyProxy, normalizeSource } = require('../desktop/runtime/extension-api-host/host-server.cjs');
  const calls: any[] = [];
  const proxy = { registerSource: (input: any) => { calls.push(input); return 'http://127.0.0.1:1234/stream/token'; } };
  const source = normalizeSource({ url: 'http://127.0.0.1:8099/?url=https%3A%2F%2Ffixture.test%2Fvideo.mp4&password=legacy', sourceType: 'mp4', headers: { Referer: 'https://fixture.test/' } });
  const result = applyProxy(source, source.headers, proxy);
  expect(calls[0].url).toBe('https://fixture.test/video.mp4');
  expect(result.originalUrl).toBe('https://fixture.test/video.mp4');
  expect(result.url).toContain('/stream/token');
});

it('merges challenge headers without duplicating lowercased cookies or user agents', () => {
  const { LocalProxyServer } = require('../desktop/runtime/proxy/local-proxy-server.cjs');
  const headers = LocalProxyServer.prototype._extensionRequestHeaders.call({}, { headers: { cookie: 'mature=1', 'user-agent': 'Provider agent', referer: 'https://fixture.test/', host: '127.0.0.1' } });
  expect(headers).toEqual({ Cookie: 'mature=1', 'User-Agent': 'Provider agent', Referer: 'https://fixture.test/' });
});
