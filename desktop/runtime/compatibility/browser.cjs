'use strict';
const { BrowserWindow, session, ipcMain } = require('electron');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { BrowserFiles } = require('./browser-files.cjs');
const httpUrl = value => { const u = new URL(String(value)); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw Error('Invalid extension browser URL'); return u.href; };
const headers = values => Object.fromEntries(Object.entries(values || {}).filter(([k, v]) => typeof v === 'string' && !/[\r\n]/.test(k + v)));

/** Browser-dependent source work stays in an isolated Chromium session on this device. */
class CompatibilityBrowser {
  constructor(getParent, { root } = {}) { this.getParent = getParent; this.pages = new Map(); this.stopped = false; this.files = new BrowserFiles(root); }
  address(page, url) { return page.files && url.startsWith(page.files.base) && page.files.file ? page.files.file + url.slice(page.files.base.length) : url; }
  interfaces(value) {
    if (value == null) return {};
    const names = Object.entries(value);
    if (names.length > 32) throw Error('Too many extension interfaces');
    const valid = name => /^[A-Za-z_$][\w$]{0,100}$/.test(name) && !['__proto__', 'prototype', 'constructor'].includes(name);
    for (const [name, methods] of names) if (!valid(name) || !Array.isArray(methods) || methods.length > 64 || methods.some(method => typeof method !== 'string' || !valid(method))) throw Error('Invalid extension interface');
    return Object.fromEntries(names);
  }
  initialize() {
    if (this.session) return;
    this.session = session.fromPartition('persist:tatakai-compatibility');
    this.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    this.session.setPermissionCheckHandler(() => false);
    this.session.on('will-download', event => event.preventDefault());
    this.session.webRequest.onBeforeSendHeaders((details, callback) => {
      const page = [...this.pages.values()].find(p => p.win.webContents.id === details.webContentsId);
      const extra = headers(page?.headers);
      if (page && new URL(details.url).origin !== new URL(page.url).origin) for (const key of Object.keys(extra)) if (/^(cookie|authorization|proxy-authorization)$/i.test(key)) delete extra[key];
      callback({ requestHeaders: { ...details.requestHeaders, ...extra } });
      if (page?.op === 'page' && !page.done) void page.reply('webPage', { rid: page.rid, type: 'request', url: this.address(page, details.url), method: details.method, mainFrame: details.resourceType === 'mainFrame', headers: { ...details.requestHeaders, ...extra } }).catch(() => {});
    });
    this.session.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !/^https?:\/\//i.test(details.url) && !details.url.startsWith('about:') });
      const page = [...this.pages.values()].find(p => p.win.webContents.id === details.webContentsId);
      if (page?.op === 'resolve') void page.reply('webCaptured', { rid: page.rid, url: details.url, method: details.method }).then(done => { if (done) page.finish(); }).catch(() => {});
    });
  }
  create(event, reply, visible = false) {
    if (this.stopped || this.pages.size >= 8) throw Error('Extension browser capacity reached');
    this.initialize();
    const interfaces = this.interfaces(event.interfaces), answering = this.interfaces(event.answering), channel = `compatibility-page-${randomUUID()}`;
    const win = new BrowserWindow({ parent: this.getParent?.(), width: 960, height: 760, show: visible, title: 'Extension browser',
      webPreferences: { session: this.session, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
        preload: path.join(__dirname, 'browser-preload.cjs'), additionalArguments: ['--tatakai-page=' + JSON.stringify({ channel, interfaces, answering, dialogs: event.op === 'page' })] } });
    const page = { ...event, win, reply, done: false, finish: () => {} };
    let pending = 0;
    const receive = (sender, body) => {
      const sync = body?.type === 'call' || body?.type === 'dialog';
      const deny = () => { if (sync) sender.returnValue = {}; };
      if (page.done || sender.sender !== win.webContents || sender.senderFrame !== win.webContents.mainFrame || typeof body?.message !== 'string' || body.message.length > 65536 || pending >= 8) return deny();
      if (body.type === 'dialog') {
        if (!['alert', 'confirm', 'prompt'].includes(body.kind) || typeof body.defaultText !== 'string' || body.defaultText.length > 10000) return deny();
      } else {
        let call;
        try { call = JSON.parse(body.message); } catch { return deny(); }
        if (!call || typeof call !== 'object') return deny();
        const methods = body.type === 'call' ? answering : body.type === 'message' ? interfaces : {};
        if (!methods[call.name]?.includes(call.method) || !Array.isArray(call.args) || call.args.length > 100) return deny();
      }
      pending++;
      let timer;
      void Promise.race([reply('webPage', { rid: event.rid, type: body.type, message: body.message, ...(body.type === 'dialog' ? { kind: body.kind, defaultText: body.defaultText } : {}), url: this.address(page, win.webContents.getURL()) }),
        new Promise(resolve => { timer = setTimeout(() => resolve({}), 30000); })]).then(result => { if (sync) sender.returnValue = result && typeof result === 'object' ? result : {}; }).catch(deny).finally(() => { clearTimeout(timer); pending--; });
    };
    ipcMain.on(channel, receive);
    win.once('closed', () => { ipcMain.removeListener(channel, receive); page.files?.revoke(); });
    this.pages.set(event.rid, page);
    win.webContents.setWindowOpenHandler(({ url }) => { try { void win.loadURL(httpUrl(url)); } catch {} return { action: 'deny' }; });
    const navigation = (e, url) => { try { httpUrl(url); } catch { e.preventDefault(); } };
    win.webContents.on('will-navigate', navigation); win.webContents.on('will-redirect', navigation);
    return page;
  }
  async cookies(url) { return Object.fromEntries((await this.session.cookies.get({ url: httpUrl(url) })).map(c => [c.name, c.value])); }
  authenticate(url, signal) {
    url = httpUrl(url);
    const rid = randomUUID(), page = this.create({ rid, url, op: 'authenticate' }, () => {}, true), { win } = page;
    win.setTitle('Source sign-in — close this window when finished');
    return new Promise((resolve, reject) => {
      let timer;
      const cancel = () => page.finish(null);
      page.finish = async result => {
        if (page.done) return; page.done = true;
        clearTimeout(timer); signal?.removeEventListener('abort', cancel); this.pages.delete(rid);
        if (!win.isDestroyed()) win.destroy(); resolve(result);
      };
      win.on('close', event => {
        event.preventDefault();
        void this.session.cookies.get({ url }).then(cookies => page.finish({ url, cookies, userAgent: win.webContents.getUserAgent() })).catch(() => page.finish(null));
      });
      timer = setTimeout(cancel, 300000);
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      void win.loadURL(url).catch(() => page.finish(null));
    });
  }
  async handle(event, reply) {
    if (event.op === 'eval') {
      const page = this.pages.get(event.page);
      if (!page || page.win.isDestroyed()) return reply('webReply', { rid: event.rid });
      const result = await page.win.webContents.executeJavaScript(String(event.script || ''));
      return reply('webReply', { rid: event.rid, result: JSON.stringify(result ?? null) });
    }
    if (event.op === 'closePage') { this.pages.get(event.rid)?.finish(); return; }
    if (event.op === 'navigate') {
      const page = this.pages.get(event.rid); if (page) {
        const files = event.serve ? await this.files.register(event.serve) : null;
        page.files?.revoke(); page.files = files; page.headers = event.headers; page.url = files?.url || httpUrl(event.url);
        await page.win.loadURL(page.url);
      } return;
    }
    if (!['solve', 'fetch', 'resolve', 'page'].includes(event.op)) return reply('webReply', { rid: event.rid });
    const files = event.op === 'page' && event.serve ? await this.files.register(event.serve) : null;
    const url = files?.url || httpUrl(event.url);
    let page;
    try { page = this.create({ ...event, url }, reply, ['solve', 'page'].includes(event.op)); page.files = files; }
    catch (error) { files?.revoke(); throw error; }
    const { win } = page;
    if (event.userAgent) win.webContents.setUserAgent(String(event.userAgent).slice(0, 1000));
    return new Promise(resolve => {
      let timer, poll;
      page.finish = async (answer = {}) => {
        if (page.done) return; page.done = true;
        clearTimeout(timer); clearInterval(poll); this.pages.delete(event.rid);
        if (!win.isDestroyed()) win.destroy();
        try { await reply(event.op === 'page' ? 'webPage' : 'webReply', event.op === 'page' ? { rid: event.rid, type: 'closed', url: this.address(page, win.isDestroyed() ? page.url : win.webContents.getURL()) } : { rid: event.rid, ...answer }); } catch {}
        resolve();
      };
      timer = setTimeout(() => void page.finish(), Math.min(Math.max(Number(event.timeoutMs) || 90000, 1000), 180000));
      win.once('closed', () => void page.finish());
      const work = async () => {
        if (event.op === 'page') {
          win.webContents.on('did-start-navigation', (_event, target, _inPlace, mainFrame) => { if (mainFrame) void reply('webPage', { rid: event.rid, type: 'started', url: this.address(page, target) }).catch(() => {}); });
          win.webContents.on('did-fail-load', (_event, code, text, target, mainFrame) => { void reply('webPage', { rid: event.rid, type: 'failed', url: this.address(page, target), code, text, mainFrame }).catch(() => {}); });
          win.webContents.on('did-finish-load', () => void (async () => { const target = win.webContents.getURL(); await reply('webPage', { rid: event.rid, type: 'finished', url: this.address(page, target), title: win.getTitle(), cookies: await this.session.cookies.get({ url: target }) }); })().catch(() => {}));
        }
        const previous = await this.cookies(url);
        await win.loadURL(url, { extraHeaders: Object.entries(headers(event.headers)).map(([k, v]) => `${k}: ${v}`).join('\r\n') });
        if (page.done) return;
        if (event.op === 'fetch') {
          const request = JSON.stringify({ url, method: event.method || 'GET', headers: headers(event.headers), body: event.body });
          const result = await win.webContents.executeJavaScript(`(async()=>{const q=${request};const r=await fetch(q.url,{method:q.method,headers:q.headers,body:['GET','HEAD'].includes(q.method)?undefined:q.body,credentials:'include'});const reader=r.body?.getReader();const chunks=[];let n=0;if(reader)for(;;){const p=await reader.read();if(p.done)break;n+=p.value.length;if(n>10485760){await reader.cancel();throw Error('Response too large')}chunks.push(p.value)}const bytes=new Uint8Array(n);let offset=0;for(const p of chunks){bytes.set(p,offset);offset+=p.length}return{status:r.status,url:r.url,headers:Object.fromEntries(r.headers),body:new TextDecoder().decode(bytes)}})()`);
          await page.finish(result);
        } else if (event.op === 'solve') {
          let polling = false;
          poll = setInterval(() => void (async () => {
            if (page.done || polling) return; polling = true;
            try {
              const cookies = await this.cookies(url);
              const challenge = await win.webContents.executeJavaScript(`!!document.querySelector('#challenge-running, #challenge-stage, form#challenge-form, [name="cf-turnstile-response"]') || /just a moment|checking your browser|verify you are human/i.test(document.title)`);
              if (!challenge) await page.finish({ cookies, userAgent: win.webContents.getUserAgent(), earned: !!cookies.cf_clearance && cookies.cf_clearance !== previous.cf_clearance });
            } finally { polling = false; }
          })().catch(() => {}), 1500);
        } else if (event.op === 'resolve' && event.script) {
          const result = await win.webContents.executeJavaScript(String(event.script));
          if (await reply('webScript', { rid: event.rid, result: JSON.stringify(result ?? null) })) await page.finish();
        }
      };
      void work().catch(() => page.finish());
    });
  }
  closePages() { for (const page of [...this.pages.values()]) if (page.op !== 'authenticate') page.finish(); }
  stop() { this.stopped = true; for (const page of [...this.pages.values()]) page.finish(); this.files.stop(); }
}
module.exports = { CompatibilityBrowser, httpUrl };
