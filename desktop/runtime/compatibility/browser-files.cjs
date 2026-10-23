'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createServer } = require('node:http');
const { randomUUID } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const inside = (root, target) => { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
const types = { '.html': 'text/html', '.htm': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2' };
/** Read-only, capability-addressed files inside the engine's private files/cache folders. */
class BrowserFiles {
  constructor(root) { this.root = root; this.folders = new Map(); this.server = null; this.starting = null; this.stopped = false; this.active = 0; }
  async start() {
    if (this.stopped) throw Error('Extension browser stopped');
    if (this.starting) return this.starting;
    if (this.server) return;
    this.starting = (async () => {
      const server = createServer((req, res) => {
        if (this.active >= 8) { res.writeHead(429); res.end(); return; }
        this.active++;
        void this.respond(req, res).catch(() => { if (!res.headersSent) res.writeHead(404); res.end(); }).finally(() => { this.active--; });
      });
      server.maxConnections = 16; server.requestTimeout = 30000; server.headersTimeout = 15000;
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      if (this.stopped) { server.close(); throw Error('Extension browser stopped'); }
      this.server = server;
    })().finally(() => { this.starting = null; });
    return this.starting;
  }
  async register(serve) {
    if (!this.root) throw Error('Local extension files are unavailable');
    const root = await fs.realpath(this.root), folder = await fs.realpath(String(serve.folder));
    if (!['files', 'cache'].some(name => inside(path.join(root, name), folder))) throw Error('Extension folder is outside its runtime data');
    if (!(await fs.stat(folder)).isDirectory()) throw Error('Invalid extension folder');
    await this.start();
    const key = randomUUID(), base = `http://127.0.0.1:${this.server.address().port}/${key}/`;
    const url = new URL(String(serve.path), base);
    if (!url.href.startsWith(base)) throw Error('Invalid extension file address');
    this.folders.set(key, folder);
    return { url: url.href, base, file: String(serve.file || ''), revoke: () => this.folders.delete(key) };
  }
  async respond(req, res) {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const url = new URL(req.url, 'http://127.0.0.1'), parts = url.pathname.split('/'), folder = this.folders.get(parts[1]);
    if (!folder) throw Error('Unknown folder');
    const relative = decodeURIComponent(parts.slice(2).join('/'));
    if (!relative || relative.includes('\0') || relative.includes('\\')) throw Error('Invalid file');
    const file = await fs.realpath(path.resolve(folder, relative));
    if (!inside(folder, file)) throw Error('File outside extension folder');
    const handle = await fs.open(file, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw Error('Invalid extension file');
      res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': stat.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      if (req.method === 'HEAD' || stat.size === 0) res.end();
      else await pipeline(handle.createReadStream({ start: 0, end: stat.size - 1, autoClose: false }), res);
    } finally { await handle.close(); }
  }
  stop() { this.stopped = true; this.folders.clear(); this.server?.closeAllConnections(); this.server?.close(); this.server = null; }
}
module.exports = { BrowserFiles, inside };
