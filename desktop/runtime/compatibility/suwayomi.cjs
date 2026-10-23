'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { createReadStream, createWriteStream } = require('node:fs');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const VERSION = '2.4.2366';
// One host contract; official runtime artifacts are selected by OS/architecture.
// These digests are from the pinned release's Checksums.sha256.
const RUNTIMES = {
  'win32-x64': { name: 'windows-x64', extension: 'zip', bytes: 343828201, sha256: 'b955f374a8d94b8d1c2750ae28fa7eb2066b479957561b5ba9cf8ac993c8fc13' },
  'linux-x64': { name: 'linux-x64', extension: 'tar.gz', bytes: 337841487, sha256: '7a469f8c820e65305f795d61f1776c783919884531497b587bdff898a7e0fa73' },
  'darwin-x64': { name: 'macOS-x64', extension: 'tar.gz', bytes: 336352325, sha256: '18768b2e3b7fb25bf3eff9e4b4b14b6235b2dfea320701ab172ea7f902eeb97e' },
  'darwin-arm64': { name: 'macOS-arm64', extension: 'tar.gz', bytes: 329964641, sha256: '3b269855928070253a4d9f7c4a57d9ff99d0272102410233c459b02a732e87e7' },
};
const runtimeFor = (platform = process.platform, arch = process.arch) => RUNTIMES[`${platform}-${arch}`] || null;
const digest = async file => { const h = createHash('sha256'); for await (const b of createReadStream(file)) h.update(b); return h.digest('hex'); };

class SuwayomiHost {
  constructor(root, { fetcher = fetch } = {}) { this.root = root; this.fetcher = fetcher; this.starting = null; this.preparing = null; this.child = null; this.stopped = false; this.pending = new Map(); }
  get runtime() { return runtimeFor(); }
  get distribution() { return path.join(this.root, 'runtime', `Suwayomi-Server-v${VERSION}-${this.runtime?.name || 'unsupported'}`); }
  get java() { return path.join(this.distribution, 'jre/bin', process.platform === 'win32' ? 'java.exe' : 'java'); }
  async filesPresent() { return !!await fs.stat(this.java).catch(() => null) && !!await fs.stat(path.join(this.distribution, 'bin/Suwayomi-Server.jar')).catch(() => null); }
  async ready() { return !!this.runtime && await fs.readFile(path.join(this.distribution, '.tatakai-runtime-sha256'), 'utf8').catch(() => '') === this.runtime.sha256 && await this.filesPresent(); }
  async prepare(signal) {
    if (!this.runtime) throw Error('No verified runtime artifact exists for this OS/architecture yet');
    if (this.preparing) return this.preparing;
    this.preparation = { stage: 'checking', updatedAt: Date.now() };
    this.preparing = this.prepareOnce(signal).then(() => { this.preparation = { stage: 'ready', updatedAt: Date.now() }; }).catch(error => {
      this.preparation = { stage: signal?.aborted ? 'cancelled' : 'error', message: String(error.message || 'Runtime preparation failed').replace(/https?:\/\/\S+/g, '[runtime URL]').slice(0, 300), updatedAt: Date.now() }; throw error;
    }).finally(() => { this.preparing = null; });
    return this.preparing;
  }
  async prepareOnce(signal) {
    signal?.throwIfAborted();
    if (await this.ready()) return;
    await fs.mkdir(this.root, { recursive: true });
    const archive = path.join(this.root, `runtime-${this.runtime.name}.${this.runtime.extension}`);
    if (!await fs.stat(archive).catch(() => null) || await digest(archive) !== this.runtime.sha256) {
      const download = `https://github.com/Suwayomi/Suwayomi-Server/releases/download/v${VERSION}/Suwayomi-Server-v${VERSION}-${this.runtime.name}.${this.runtime.extension}`;
      const stall = new AbortController();
      let idle;
      const heartbeat = () => { clearTimeout(idle); idle = setTimeout(() => stall.abort(Error('Runtime download stalled for 60 seconds; retry the download')), 60000); };
      const downloadSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(600000), stall.signal]);
      this.preparation = { stage: 'downloading', receivedBytes: 0, totalBytes: this.runtime.bytes, updatedAt: Date.now() };
      heartbeat();
      let response;
      try { response = await this.fetcher(download, { signal: downloadSignal }); } catch (error) { clearTimeout(idle); throw error; }
      if (!response.ok || Number(response.headers.get('content-length')) > 400 * 1024 * 1024) { clearTimeout(idle); throw Error('Runtime download failed'); }
      let bytes = 0;
      const { Transform } = require('node:stream');
      const owner = this;
      const limit = new Transform({ transform(chunk, _encoding, callback) { bytes += chunk.length; heartbeat(); owner.preparation = { stage: 'downloading', receivedBytes: bytes, totalBytes: owner.runtime.bytes, updatedAt: Date.now() }; callback(bytes > 400 * 1024 * 1024 ? Error('Runtime download exceeded size limit') : null, chunk); } });
      const partial = archive + '.partial';
      try {
        await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(partial), { signal: downloadSignal });
        clearTimeout(idle); this.preparation = { stage: 'verifying', updatedAt: Date.now() };
        if (await digest(partial) !== this.runtime.sha256) throw Error('Runtime checksum mismatch');
        signal?.throwIfAborted();
        await fs.rename(partial, archive);
      } finally { clearTimeout(idle); await fs.rm(partial, { force: true }).catch(() => {}); }
    }
    const destination = path.join(this.root, 'runtime');
    signal?.throwIfAborted();
    await fs.mkdir(destination, { recursive: true });
    this.preparation = { stage: 'extracting', updatedAt: Date.now() };
    await new Promise((resolve, reject) => {
      const command = process.platform === 'win32' ? 'powershell.exe' : 'tar';
      // PowerShell is external to Electron and cannot read inside app.asar.
      const helper = path.join(__dirname, 'expand-runtime.ps1').replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
      const args = process.platform === 'win32' ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Archive', archive, '-Destination', destination] : ['-xzf', archive, '-C', destination];
      const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      let output = '';
      child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => {
        if (signal?.aborted) return;
        output += chunk;
        if (output.length > 65536) { child.kill(); return; }
        let at;
        while ((at = output.indexOf('\n')) >= 0) {
          const line = output.slice(0, at); output = output.slice(at + 1);
          try { const p = JSON.parse(line); if (p.stage === 'extracting' && Number.isSafeInteger(p.receivedBytes) && Number.isSafeInteger(p.totalBytes) && p.receivedBytes >= 0 && p.totalBytes >= p.receivedBytes) this.preparation = { stage: 'extracting', receivedBytes: p.receivedBytes, totalBytes: p.totalBytes, updatedAt: Date.now() }; } catch {}
        }
      });
      const timer = setTimeout(() => { child.kill(); reject(Error('Runtime extraction timed out')); }, 180000);
      const cancel = () => { child.kill(); reject(signal.reason); };
      signal?.addEventListener('abort', cancel, { once: true });
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
      child.once('error', error => { cleanup(); reject(error); }); child.once('exit', code => { cleanup(); code === 0 ? resolve() : reject(Error('Runtime extraction failed')); });
      if (signal?.aborted) cancel();
    });
    signal?.throwIfAborted();
    if (!await this.filesPresent()) throw Error('Runtime extraction did not produce Java and the host JAR');
    signal?.throwIfAborted();
    await fs.writeFile(path.join(this.distribution, '.tatakai-runtime-sha256'), this.runtime.sha256);
  }
  async start() {
    if (this.stopped) throw Error('Compatibility host is shutting down');
    if (this.starting) return this.starting;
    if (this.child && this.child.exitCode === null && this.base) return;
    this.starting = this.startOnce().finally(() => { this.starting = null; });
    return this.starting;
  }
  async startOnce() {
    if (!await this.ready()) throw Error('Download the Mihon compatibility runtime in Extensions first');
    const reservation = net.createServer();
    await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    this.base = `http://127.0.0.1:${port}`;
    const password = randomBytes(32).toString('hex');
    this.authorization = `Basic ${Buffer.from('tatakai:' + password).toString('base64')}`;
    const properties = { rootDir: path.join(this.root, 'data'), ip: '127.0.0.1', port, initialOpenInBrowserEnabled: false,
      webUIEnabled: false, kcefEnabled: false, updateCheckInterval: 0, webUIUpdateCheckInterval: 0, authMode: 'BASIC_AUTH', authUsername: 'tatakai', authPassword: password };
    const compiled = require('./bootstrap/compiled.json');
    const source = (await fs.readFile(path.join(__dirname, 'bootstrap/SuwayomiBootstrap.java'), 'utf8')).replace(/\r\n/g, '\n');
    const bytes = Buffer.from(compiled.base64, 'base64');
    const hash = value => createHash('sha256').update(value).digest('hex');
    if (hash(source) !== compiled.sourceSha256 || hash(bytes) !== compiled.sha256) throw Error('Local runtime bootstrap needs rebuilding');
    const bootstrap = path.join(this.root, 'bootstrap', compiled.sha256);
    const classFile = path.join(bootstrap, 'app/tatakai/compatibility/SuwayomiBootstrap.class');
    await fs.mkdir(path.dirname(classFile), { recursive: true }); await fs.writeFile(classFile, bytes);
    if (this.stopped) throw Error('Compatibility host is shutting down');
    const jar = path.join(this.distribution, 'bin/Suwayomi-Server.jar');
    const args = ['-Xmx512m', ...Object.entries(properties).map(([key, value]) => `-Dsuwayomi.tachidesk.config.server.${key}=${value}`), '-cp', [bootstrap, jar].join(path.delimiter), 'app.tatakai.compatibility.SuwayomiBootstrap', jar];
    const child = spawn(this.java, args, { windowsHide: true, cwd: this.distribution, stdio: ['pipe', 'pipe', 'ignore'] });
    this.child = child;
    let launchError;
    child.once('error', error => { launchError = error; if (this.child === child) { this.child = null; this.base = null; } for (const call of [...this.pending.values()]) call.reject(Error('Compatibility runtime could not start')); });
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 1024 * 1024) { child.kill(); return; }
      let at;
      while ((at = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
        try { const reply = JSON.parse(line); const call = this.pending.get(reply.id); if (call) reply.error ? call.reject(Error(String(reply.error))) : call.resolve(reply.result); } catch { child.kill(); }
      }
    });
    child.once('exit', () => { if (this.child === child) { this.child = null; this.base = null; for (const call of [...this.pending.values()]) call.reject(Error('Compatibility runtime stopped')); } });
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if (this.stopped || launchError || child.exitCode !== null) throw Error('Compatibility runtime could not start');
      try { await this.graphql('{ __typename }', {}, AbortSignal.timeout(1500)); }
      catch { await new Promise(resolve => setTimeout(resolve, 400)); continue; }
      let metadata;
      try { metadata = JSON.parse(await fs.readFile(path.join(this.root, 'browser.json'), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') { child.kill(); this.child = null; this.base = null; throw Error('Source browser settings need recovery; existing file was preserved'); } }
      if (metadata && (metadata.version !== 1 || typeof metadata.userAgent !== 'string' || metadata.userAgent.length > 1000 || /[\r\n]/.test(metadata.userAgent))) { child.kill(); this.child = null; this.base = null; throw Error('Invalid source browser settings; existing file was preserved'); }
      if (metadata?.userAgent) await this.sendCommand('cookies', { url: 'https://example.invalid/', cookies: [], userAgent: metadata.userAgent }, AbortSignal.timeout(10000));
      return;
    }
    child.kill(); throw Error('Compatibility runtime startup timed out');
  }
  async graphql(query, variables = {}, signal) {
    if (!this.base) throw Error('Compatibility runtime is not running');
    const response = await fetch(this.base + '/api/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: this.authorization },
      body: JSON.stringify({ query, variables }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000) });
    if (!response.ok) throw Error(`Compatibility runtime HTTP ${response.status}`);
    const body = await response.json();
    if (body.errors?.length) throw Error(String(body.errors[0].message).replace(/https?:\/\/\S+/g, '[source URL]').slice(0, 300));
    if (!body.data) throw Error('Invalid compatibility runtime response');
    return body.data;
  }
  async command(method, params, signal) {
    if (method !== 'cookies') throw Error('Unsupported compatibility command');
    await this.start(); signal?.throwIfAborted();
    const result = await this.sendCommand(method, params, signal);
    if (params.userAgent) {
      const file = path.join(this.root, 'browser.json');
      await fs.writeFile(file + '.tmp', JSON.stringify({ version: 1, userAgent: params.userAgent }), { mode: 0o600 }); await fs.rename(file + '.tmp', file);
    }
    return result;
  }
  sendCommand(method, params, signal) {
    signal?.throwIfAborted();
    if (this.pending.size >= 16) throw Error('Compatibility command queue is full');
    const id = randomUUID(), line = JSON.stringify({ id, method, params });
    if (line.length > 256 * 1024) throw Error('Compatibility command too large');
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); this.pending.delete(id); };
      const cancel = () => { cleanup(); reject(signal.reason); };
      const timer = setTimeout(() => { cleanup(); reject(Error('Compatibility command timed out')); }, 30000);
      this.pending.set(id, { resolve: value => { cleanup(); resolve(value); }, reject: error => { cleanup(); reject(error); } });
      signal?.addEventListener('abort', cancel, { once: true });
      this.child.stdin.write(line + '\n', error => { if (error) this.pending.get(id)?.reject(Error('Local runtime connection failed')); });
      if (signal?.aborted) cancel();
    });
  }
  stop() { this.stopped = true; this.child?.kill(); this.child = null; this.base = null; for (const call of [...this.pending.values()]) call.reject(Error('Compatibility runtime stopped')); }
}
module.exports = { SuwayomiHost, VERSION, RUNTIMES, runtimeFor };
