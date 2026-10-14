'use strict';

const { randomUUID } = require('node:crypto');
const { isIP } = require('node:net');

/** Provider-owned, ephemeral browser sessions. No application cookies or Node APIs. */
class SeanimeBrowserHost {
  constructor(domains, BrowserWindow) {
    this.domains = (domains || []).filter(d => typeof d === 'string' && /^[a-z0-9.-]+$/i.test(d) && !isIP(d) && !/^(localhost|.*\.localhost|.*\.local)$/i.test(d));
    this.BrowserWindow = BrowserWindow;
    this.sessions = new Map();
  }

  checkUrl(value) {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !this.domains.some(d => url.hostname === d || url.hostname.endsWith('.' + d))) {
      throw new Error('ChromeDP URL is outside the provider website');
    }
    return url.href;
  }

  async call(method, id, args = []) {
    if (method === 'newBrowser') {
      if (!this.domains.length) throw new Error('ChromeDP requires a permitted public provider website');
      if (this.sessions.size >= 2) throw new Error('ChromeDP browser limit reached');
      const BrowserWindow = this.BrowserWindow || require('electron').BrowserWindow;
      const options = args[0] || {};
      const key = randomUUID();
      const win = new BrowserWindow({ width: 1000, height: 760, title: 'Tatakai · Extension browser', show: options.headless === false,
        webPreferences: { partition: 'tatakai-provider-' + key, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      for (const event of ['will-navigate', 'will-redirect']) win.webContents.on(event, (e, url) => {
        try { this.checkUrl(url); } catch { e.preventDefault(); }
      });
      win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
        let allowed = false;
        try { this.checkUrl(details.url); allowed = true; } catch {
          try { const url = new URL(details.url); allowed = url.protocol === 'https:' && url.hostname === 'challenges.cloudflare.com' && !url.port && !url.username && !url.password; } catch {}
        }
        callback({ cancel: !allowed });
      });
      win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      const timer = setTimeout(() => this.close(key), 150_000);
      timer.unref?.();
      this.sessions.set(key, { win, timer, timeout: Math.min(30, Math.max(1, Number(options.timeout) || 20)) * 1000 });
      win.on('closed', () => { clearTimeout(timer); this.sessions.delete(key); });
      return key;
    }
    const entry = this.sessions.get(id);
    if (!entry || entry.win.isDestroyed()) throw new Error('ChromeDP browser is closed');
    if (method === 'close') { this.close(id); return; }
    if (method === 'sleep') {
      const delay = Number(args[0]);
      if (!Number.isFinite(delay) || delay < 0 || delay > 10_000) throw new Error('Invalid ChromeDP sleep duration');
      return new Promise(resolve => setTimeout(resolve, delay));
    }
    let operation;
    if (method === 'navigate') operation = entry.win.loadURL(this.checkUrl(args[0]));
    else if (method === 'evaluate') {
      this.checkUrl(entry.win.webContents.getURL());
      if (typeof args[0] !== 'string' || args[0].length > 32_768) throw new Error('Invalid ChromeDP expression');
      operation = entry.win.webContents.executeJavaScript(args[0], false);
    } else if (method === 'executeCDP') {
      if (args[0] !== 'Network.getCookies') throw new Error('Unsupported ChromeDP CDP command: ' + args[0]);
      const urls = args[1]?.urls;
      if (!Array.isArray(urls) || !urls.length || urls.length > 10) throw new Error('ChromeDP cookie URLs are required');
      operation = Promise.all(urls.map(url => entry.win.webContents.session.cookies.get({ url: this.checkUrl(url) })))
        .then(results => ({ cookies: results.flat().map(cookie => ({ ...cookie, expires: cookie.expirationDate ?? -1 })) }));
    } else throw new Error('Unsupported ChromeDP browser method: ' + method);
    let timer;
    try {
      const result = await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('ChromeDP operation timed out')), entry.timeout); })]);
      if (JSON.stringify(result ?? null).length > 2_000_000) throw new Error('ChromeDP response is too large');
      return result;
    } finally { clearTimeout(timer); }
  }

  close(id) {
    const entry = this.sessions.get(id);
    if (!entry) return;
    clearTimeout(entry.timer); this.sessions.delete(id);
    if (!entry.win.isDestroyed()) {
      void entry.win.webContents.session.clearStorageData?.().catch(() => {});
      entry.win.destroy();
    }
  }
  closeAll() { for (const id of [...this.sessions.keys()]) this.close(id); }
}

module.exports = { SeanimeBrowserHost };
