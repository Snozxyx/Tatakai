'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const pins = require('./aniyomi-artifacts.json');
const compiled = require('./aniyomi-compiled.json');
const { sourceCookie } = require('./aniyomi-cookies.cjs');
const digest = data => createHash('sha256').update(data).digest('hex');
const operations = new Set(['prepare','sources','repositories','addRepository','removeRepository','packages','installedPackages','install','remove','setEnabled','search','browse','info','chapters','pages','resolve','preferences','setPreference']);
class AniyomiHost {
  constructor({ root, javaHost, browser, bundledRoot = process.resourcesPath ? path.join(process.resourcesPath, 'compatibility-runtimes') : null, bundledRequired = Boolean(process.resourcesPath && !process.defaultApp), requestTimeoutMs = 90000 }) { this.root = root; this.javaHost = javaHost; this.browser = browser; this.bundledRoot = bundledRoot; this.bundledRequired = bundledRequired; this.requestTimeoutMs = requestTimeoutMs; this.pending = new Map(); this.recoveries = new Map(); this.child = null; this.stopped = false; }
  get directory() { return path.join(this.root, 'runtime', pins.desktop.sha256); }
  async bundled(name, sha256, bytes) {
    const file = this.bundledRoot ? path.join(this.bundledRoot, 'aniyomi', pins.desktop.sha256, name) : null;
    const data = file ? await fs.readFile(file).catch(error => { if (error.code !== 'ENOENT') throw error; return null; }) : null;
    if (!data) { if (this.bundledRequired) throw Error('Verified Aniyomi runtime is missing from this installation; repair Tatakai'); return null; }
    if (digest(data) !== sha256 || bytes != null && data.length !== bytes) throw Error('Bundled Aniyomi runtime checksum mismatch; repair Tatakai');
    return data;
  }
  async ready() { return await this.javaHost.ready() && await fs.readFile(path.join(this.directory, '.verified'), 'utf8').catch(() => '') === pins.desktop.sha256; }
  async prepare(signal) {
    if (this.preparing) return this.preparing;
    this.preparing = this.prepareOnce(signal).then(() => { this.preparation = { stage: 'ready', updatedAt: Date.now() }; }).catch(error => { this.preparation = { stage: signal?.aborted ? 'cancelled' : 'error', message: error.message, updatedAt: Date.now() }; throw error; }).finally(() => { this.preparing = null; });
    return this.preparing;
  }
  async prepareOnce(signal) {
    this.preparation = { stage: 'java', updatedAt: Date.now() };
    let aborted;
    try { await Promise.race([this.javaHost.prepare(signal), new Promise((_, reject) => { aborted = () => reject(signal?.reason || Error('Runtime preparation cancelled')); signal?.addEventListener('abort', aborted, { once: true }); if (signal?.aborted) aborted(); })]); }
    finally { signal?.removeEventListener('abort', aborted); }
    signal?.throwIfAborted(); await fs.mkdir(this.directory, { recursive: true });
    let received = 0; const totalBytes = pins.desktop.bytes + pins.verifier.bytes;
    for (const file of [pins.desktop, pins.verifier]) {
      const target = path.join(this.directory, file.name), previous = await fs.readFile(target).catch(() => null);
      if (previous && digest(previous) === file.sha256) { received += file.bytes; continue; }
      const bundled = await this.bundled(file.name, file.sha256, file.bytes);
      if (bundled) { signal?.throwIfAborted(); await fs.writeFile(target + '.partial', bundled); await fs.rename(target + '.partial', target); received += file.bytes; this.preparation = { stage: 'engine', receivedBytes: received, totalBytes, updatedAt: Date.now() }; continue; }
      const response = await fetch(file.url, { headers: { Accept: 'application/octet-stream' }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000) });
      if (!response.ok || new URL(response.url).protocol !== 'https:') throw Error('Pinned Aniyomi runtime download failed; existing packages were preserved');
      const parts = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; if (size > file.bytes) throw Error('Runtime artifact exceeded its pinned size'); parts.push(chunk); this.preparation = { stage: 'engine', receivedBytes: received + size, totalBytes, updatedAt: Date.now() }; }
      const bytes = Buffer.concat(parts); if (size !== file.bytes || digest(bytes) !== file.sha256) throw Error('Aniyomi runtime checksum mismatch');
      signal?.throwIfAborted(); await fs.writeFile(target + '.partial', bytes); await fs.rename(target + '.partial', target); received += size;
    }
    let license = await fs.readFile(path.join(this.directory, 'LICENSE')).catch(() => null);
    if (!license || digest(license) !== pins.licenseSha256) license = await this.bundled('LICENSE', pins.licenseSha256);
    if (!license) { const response = await fetch(`https://raw.githubusercontent.com/aayush2622/DartotsuExtensionBridge/${pins.commit}/LICENSE`, { signal }); if (!response.ok) throw Error('Could not retain the runtime license'); license = Buffer.from(await response.arrayBuffer()); }
    if (digest(license) !== pins.licenseSha256) throw Error('Runtime license checksum mismatch');
    await fs.writeFile(path.join(this.directory, 'LICENSE'), license);
    await fs.writeFile(path.join(this.directory, 'SOURCE.txt'), `${pins.repository}/tree/${pins.commit}\nUnabandon Public License incorporating GPLv3; public source required\n${pins.verifier.source}\nAPK verifier: Apache-2.0\n`);
    signal?.throwIfAborted(); await fs.writeFile(path.join(this.directory, '.verified'), pins.desktop.sha256);
  }
  async start() {
    if (this.stopped) throw Error('Aniyomi host is shutting down'); if (this.starting) return this.starting; if (this.child) return;
    this.starting = this.startOnce().finally(() => { this.starting = null; }); return this.starting;
  }
  async startOnce() {
    if (!await this.ready()) throw Error('Prepare the local Aniyomi runtime in Extensions first');
    for (const file of [pins.desktop, pins.verifier]) if (digest(await fs.readFile(path.join(this.directory, file.name))) !== file.sha256) throw Error('Aniyomi runtime needs repair: checksum mismatch');
    for (const [name, expected] of Object.entries(compiled.sources)) if (digest((await fs.readFile(path.join(__dirname, '../../..', name), 'utf8')).replace(/\r\n/g, '\n')) !== expected) throw Error('Aniyomi bootstrap source and bytecode do not match');
    const classes = path.join(this.directory, 'tatakai');
    for (const [name, file] of Object.entries(compiled.classes)) {
      if (!/^[\w/$.-]+\.class$/.test(name) || name.includes('..')) throw Error('Invalid bootstrap entry'); const bytes = Buffer.from(file.data, 'base64'); if (digest(bytes) !== file.sha256) throw Error('Invalid bootstrap checksum');
      const target = path.join(classes, name); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes);
    }
    const classpath = [classes, path.join(this.directory, pins.desktop.name)].join(path.delimiter);
    // Original providers can parse large embedded JSON with recursive JVM regexes.
    // Keep the heap bounded while allowing their original parser a larger stack.
    const child = spawn(this.javaHost.java, ['-Xmx512m', '-Xss32m', '-Dfile.encoding=UTF-8', '-cp', classpath, 'app.tatakai.compatibility.aniyomi.AniyomiBootstrap', path.join(this.directory, pins.desktop.name), path.join(this.directory, pins.verifier.name), this.root], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    this.child = child; let buffer = '';
    let stderr = ''; child.stderr.setEncoding('utf8'); child.stderr.on('data', data => { stderr = (stderr + data).slice(-32768); });
    child.stdin.on('error', () => {}); child.stdout.setEncoding('utf8');
    child.stdout.on('data', data => {
      buffer += data; if (buffer.length > 8 * 1024 * 1024) { child.kill(); return; }
      let at; while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
        try { const value = JSON.parse(line); if (value.event) { void this.callback(value, child); continue; } const pending = this.pending.get(value.requestId); if (pending) { this.pending.delete(value.requestId); value.ok ? pending.resolve(value.result) : pending.reject(Error(value.error || 'Original runtime failed')); } } catch {}
      }
    });
    const failed = code => { if (this.child !== child) return; this.child = null;
      if (stderr) void fs.mkdir(path.join(this.root, 'data'), { recursive: true }).then(() => fs.writeFile(path.join(this.root, 'data/last-runtime-error.log'), stderr)).catch(() => {});
      const reason = typeof code === 'number' ? `Local Aniyomi host stopped (exit ${code}); retry this source` : 'Local Aniyomi host stopped; retry this source';
      for (const pending of this.pending.values()) pending.reject(Error(reason)); this.pending.clear(); };
    child.once('exit', failed); child.once('error', failed);
    await this.call({ op: 'ping', requestId: randomUUID() }, undefined, true);
  }
  async callback(value, child) {
    let result = null;
    try {
      const args = value.arguments || [];
      if (value.event === 'getUserAgent' && this.browser) { this.browser.initialize(); result = this.browser.session.getUserAgent(); }
      if (value.event === 'getCookies' && this.browser) { this.browser.initialize(); const cookies = await this.browser.session.cookies.get({ url: new URL(args[0]).href }); result = JSON.stringify(cookies.map(cookie => ({ name: cookie.name, value: cookie.value, domain: cookie.domain.replace(/^\./, ''), hostOnly: cookie.hostOnly, path: cookie.path, expires: cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toISOString() : null, secure: cookie.secure, httpOnly: cookie.httpOnly }))); }
      if (value.event === 'setCookies' && this.browser && Array.isArray(args[1]) && args[1].length < 100) {
        this.browser.initialize();
        for (const header of args[1]) { const cookie = sourceCookie(args[0], header); if (!cookie) continue;
          // A rejected cookie must not discard later session cookies in the batch.
          try { await this.browser.session.cookies.set(cookie); } catch { }
        } result = null;
      }
      if (value.event === 'solveCloudflare') result = false; // WebView challenge adaptation is explicit pending work.
    } catch { result = null; }
    if (this.child === child && !child.stdin.destroyed) child.stdin.write(JSON.stringify({ callbackId: value.callbackId, result }) + '\n');
  }
  async call(payload, signal, started = false) {
    if (!started) await this.start(); signal?.throwIfAborted();
    const child = this.child; if (!child) throw Error('Local Aniyomi host is unavailable');
    return new Promise((resolve, reject) => {
      const id = payload.requestId || randomUUID(); if (this.pending.size >= 24 || this.pending.has(id)) { reject(Error('Too many Aniyomi requests')); return; }
      let settled = false;
      const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); this.pending.delete(id); error ? reject(error) : resolve(result); };
      const abort = () => { if (!child.stdin.destroyed) child.stdin.write(JSON.stringify({ op: 'cancel', requestId: randomUUID(), target: id }) + '\n'); finish(signal?.reason || Error('Provider request cancelled')); };
      const timer = setTimeout(() => {
        if (started) child.kill();
        else if (!child.stdin.destroyed) child.stdin.write(JSON.stringify({ op: 'cancel', requestId: randomUUID(), target: id }) + '\n');
        finish(Error('Local Aniyomi request timed out'));
      }, started ? 15000 : this.requestTimeoutMs);
      this.pending.set(id, { resolve: result => finish(null, result), reject: error => finish(error), sourceId: payload.sourceId }); signal?.addEventListener('abort', abort, { once: true });
      child.stdin.write(JSON.stringify({ ...payload, requestId: id }) + '\n');
    });
  }
  async request(payload) {
    if (payload.op === 'cancel') { if (payload.target === this.preparationId) this.preparationController?.abort(); this.recoveries.get(payload.target)?.abort(Error('Provider request cancelled')); const call = this.pending.get(payload.target); if (call) { this.child?.stdin.write(JSON.stringify(payload) + '\n'); call.reject(Error('Provider request cancelled')); } return null; }
    if (!operations.has(payload.op)) throw Error('Unsupported Aniyomi operation');
    if (['installedPackages', 'repositories', 'sources'].includes(payload.op)) {
      let state;
      try { state = JSON.parse(await fs.readFile(path.join(this.root, 'state.json'), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return []; throw Error('Aniyomi inventory needs recovery; existing data was preserved'); }
      if (state.version !== 1 || !state.packages || !state.enabled || !Array.isArray(state.repositories)) throw Error('Invalid Aniyomi inventory; existing data was preserved');
      if (payload.op === 'repositories') return state.repositories;
      const packages = Object.entries(state.packages).map(([id, pkg]) => {
        if (!/^[a-f0-9]{64}$/.test(id) || pkg.id !== id || !Array.isArray(pkg.sources)) throw Error('Invalid installed Aniyomi package');
        return { ...pkg, installed: true, hasUpdate: false };
      });
      if (payload.op === 'installedPackages') return packages;
      return packages.flatMap(pkg => pkg.sources.map(upstream => {
        if (typeof upstream.id !== 'string' || !/^-?\d{1,20}$/.test(upstream.id)) throw Error('Invalid original source ID');
        const id = 'compat-aniyomi-' + digest(JSON.stringify([pkg.repository, pkg.pkgName, upstream.id])).slice(0, 32);
        return { id, upstreamId: upstream.id, packageId: pkg.id, repository: pkg.repository, ecosystem: 'aniyomi', name: upstream.name, extensionName: pkg.name, lang: upstream.lang || pkg.lang || 'unknown', kind: pkg.kind, enabled: state.enabled[id] === true, hasSettings: true };
      }));
    }
    if (payload.op === 'prepare') { const controller = new AbortController(); this.preparationId = payload.requestId; this.preparationController = controller; try { await this.prepare(controller.signal); return { ready: true }; } finally { this.preparationController = null; } }
    try { return await this.call(payload); }
    catch (error) {
      // A failed JVM class initializer stays poisoned for the lifetime of its loader.
      // Reload persisted packages in a clean process, and retry a read only once.
      if (this.stopped || !['search', 'browse', 'info', 'chapters', 'pages', 'resolve', 'preferences'].includes(payload.op) || !/Could not initialize class okhttp3\.HttpUrl/.test(error.message)) throw error;
      const controller = new AbortController(); this.recoveries.set(payload.requestId, controller);
      try {
        if (!this.restarting) this.restarting = this.restartRuntime().finally(() => { this.restarting = null; });
        await this.restarting; return await this.call(payload, controller.signal);
      } finally { this.recoveries.delete(payload.requestId); }
    }
  }
  async restartRuntime() {
    const previous = this.child; this.child = null;
    for (const pending of this.pending.values()) pending.reject(Error('Local Aniyomi runtime is recovering from a failed class initialization'));
    this.pending.clear(); previous?.kill(); await this.start();
  }
  stop() { this.stopped = true; this.preparationController?.abort(); for (const controller of this.recoveries.values()) controller.abort(); this.child?.kill(); }
}
module.exports = { AniyomiHost, pins };
