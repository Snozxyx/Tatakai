// Isolated Electron networking/authentication fixture; no third-party credentials.
import { _electron as electron } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve('.cache/compatibility-browser-fixture');
await mkdir(root, { recursive: true });
const data = path.join(root, 'data'), folder = path.join(data, 'files', 'page');
await mkdir(folder, { recursive: true });
await writeFile(path.join(folder, 'index.html'), '<!doctype html><title>Local fixture</title><script>window.fixtureResult=Bridge.sum(2,3);Bridge.report("local-page");window.nodeAvailable=typeof require!=="undefined";window.fixturePrompt=prompt("source prompt", "default");window.fixtureConfirm=confirm("source confirm");</script>');
const server = createServer((req, res) => {
  if (req.url === '/login') {
    res.writeHead(302, { Location: '/signed-in', 'Set-Cookie': 'fixture_session=local-only; HttpOnly; SameSite=Lax; Path=/' }); res.end();
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ cookie: req.headers.cookie, required: req.headers['x-source-fixture'], path: req.url }));
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
await writeFile(path.join(root, 'main.cjs'), `const {app}=require('electron');app.setPath('userData',${JSON.stringify(path.join(root, 'user-data'))});
global.ready=app.whenReady().then(()=>{const{CompatibilityBrowser}=require(${JSON.stringify(path.resolve(process.env.COMPATIBILITY_BROWSER_MODULE || 'desktop/runtime/compatibility/browser.cjs'))});global.bridge=new CompatibilityBrowser(undefined,{root:${JSON.stringify(data)}});
const create=bridge.create.bind(bridge);bridge.create=(...args)=>{args[2]=false;return create(...args)};});app.on('window-all-closed',()=>{});`);
let app;
const checks = [];
try {
  app = await electron.launch({ args: [path.join(root, 'main.cjs')] });
  await app.evaluate(async () => { await global.ready; });
  // No renderer or source can invoke this harness: it runs in the test's main process.
  const result = await app.evaluate(async (_electron, url) => {
    const pending = global.bridge.authenticate(url + '/login');
    const page = [...global.bridge.pages.values()][0];
    await new Promise((resolve, reject) => { page.win.webContents.once('did-finish-load', resolve); page.win.webContents.once('did-fail-load', (_e, code, text) => reject(Error(code + ':' + text))); });
    page.win.close();
    const auth = await pending;
    let response;
    await global.bridge.handle({ rid: 'fetch-fixture', op: 'fetch', url: url + '/protected', headers: { 'X-Source-Fixture': 'required' } }, async (_event, value) => { response = value; });
    const controller = new AbortController();
    const cancelled = global.bridge.authenticate(url + '/login', controller.signal); controller.abort();
    const cancellation = await cancelled;
    global.bridge.stop();
    return { auth, response, cancellation, openPages: global.bridge.pages.size };
  }, url);
  assert(result.auth.cookies.some(c => c.name === 'fixture_session' && c.httpOnly && c.value === 'local-only'));
  assert(result.auth.userAgent.length > 0);
  checks.push('Close sign-in window returns HttpOnly cookies and browser user agent after a redirect');
  assert.equal(result.response.status, 200);
  const body = JSON.parse(result.response.body);
  assert.equal(body.required, 'required'); assert(body.cookie.includes('fixture_session=local-only'));
  checks.push('Browser fetch preserves source headers and session cookies');
  assert.equal(result.cancellation, null); assert.equal(result.openPages, 0);
  checks.push('Cancellation destroys sign-in windows and releases browser capacity');
  const local = await app.evaluate(async (_electron, { folder, data }) => {
    // The previous subtest stopped its bridge; a new owner has fresh page capacity.
    const Bridge = global.bridge.constructor;
    const bridge = new Bridge(undefined, { root: data });
    const create = bridge.create.bind(bridge); bridge.create = (...args) => { args[2] = false; return create(...args); };
    const events = [];
    const pending = bridge.handle({ op: 'page', rid: 100, url: 'file:///fixture/index.html', interfaces: { Bridge: ['report'] }, answering: { Bridge: ['sum'] },
      serve: { folder, path: 'index.html', file: 'file:///fixture/' } }, async (_event, value) => {
        events.push(value);
        if (value.type === 'call') return { value: JSON.parse(value.message).args.reduce((a, b) => a + b, 0) };
        if (value.type === 'dialog') return { accept: true, text: 'source answer' };
        return true;
      });
    // File registration is asynchronous, before BrowserWindow creation.
    const deadline = Date.now() + 15000;
    while (!bridge.pages.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    const page = bridge.pages.get(100); if (!page) throw Error('Local page did not open');
    if (page.win.webContents.isLoading()) await new Promise(resolve => page.win.webContents.once('did-finish-load', resolve));
    const content = await page.win.webContents.executeJavaScript('({result:window.fixtureResult,nodeAvailable:window.nodeAvailable,prompt:window.fixturePrompt,confirm:window.fixtureConfirm})');
    const base = page.files.base;
    const traversal = await fetch(base + '%2e%2e%2foutside.txt').then(r => r.status);
    await bridge.handle({ op: 'closePage', rid: 100 }, async () => {}); await pending;
    const revoked = await fetch(base + 'index.html').then(r => r.status);
    bridge.stop();
    return { content, events, traversal, revoked };
  }, { folder, data });
  assert.equal(local.content.result, 5); assert.equal(local.content.nodeAvailable, false);
  assert.equal(local.content.prompt, 'source answer'); assert.equal(local.content.confirm, true);
  assert(local.events.some(e => e.type === 'message' && JSON.parse(e.message).method === 'report'));
  assert(local.events.some(e => e.type === 'finished' && e.url === 'file:///fixture/index.html'));
  assert.equal(local.traversal, 404); assert.equal(local.revoked, 404);
  checks.push('Local extension files execute declared one-way and synchronous JavaScript interfaces without Node access');
  checks.push('Local file events retain original addresses; traversal and revoked file capabilities are rejected');
  checks.push('Source WebChromeClient-style prompt and confirm answers return synchronously');
} finally { await app?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
await writeFile(path.join(root, 'evidence.json'), JSON.stringify({ recordedAt: new Date().toISOString(), code: process.env.COMPATIBILITY_BROWSER_MODULE ? 'packaged-asar' : 'source', fixture: 'local HTTP only; real protected-source authentication unverified', checks }, null, 2));
console.log(JSON.stringify(checks, null, 2));
