'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const artifacts = require('./skystream-artifacts.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Pinned, unmodified GPL engine in its own JVM; no provider source conversion. */
class SkyStreamHost {
  constructor({ root, javaHost, browser }) {
    this.root = root; this.javaHost = javaHost;
    this.pending = new Map(); this.child = null; this.starting = null; this.preparing = null; this.browser = browser; this.stopped = false;
  }
  get directory() { return path.join(this.root, 'engine', artifacts.commit); }
  async ready() {
    if (!await this.javaHost.ready()) return false;
    return await fs.readFile(path.join(this.directory, '.verified'), 'utf8').catch(() => '') === artifacts.commit;
  }
  async prepare(signal) {
    if (this.preparing) return this.preparing;
    this.preparation = { stage: 'java', updatedAt: Date.now() };
    this.preparing = this.prepareOnce(signal).then(() => { this.preparation = { stage: 'ready', updatedAt: Date.now() }; }).catch(error => {
      this.preparation = { stage: signal?.aborted ? 'cancelled' : 'error', message: String(error.message || 'CloudStream preparation failed').replace(/https?:\/\/\S+/g, '[runtime URL]').slice(0, 300), updatedAt: Date.now() }; throw error;
    }).finally(() => { this.preparing = null; });
    return this.preparing;
  }
  async prepareOnce(signal) {
    await this.javaHost.prepare(signal);
    await fs.mkdir(this.directory, { recursive: true });
    const workers = new AbortController();
    signal = signal ? AbortSignal.any([signal, workers.signal]) : workers.signal;
    let next = 0, receivedBytes = 0;
    const totalBytes = artifacts.files.reduce((n, file) => n + file.bytes, 0);
    const progress = bytes => { receivedBytes += bytes; this.preparation = { stage: 'engine', receivedBytes, totalBytes, updatedAt: Date.now() }; };
    progress(0);
    const downloads = await Promise.allSettled(Array.from({ length: 4 }, async () => {
      try {
      while (next < artifacts.files.length) {
        signal?.throwIfAborted();
        const file = artifacts.files[next++], target = path.join(this.directory, file.name);
        const existing = await fs.readFile(target).catch(() => null);
        if (existing && hash(existing) === file.sha256) { progress(file.bytes); continue; }
        const url = `https://raw.githubusercontent.com/akashdh11/skystream/${artifacts.commit}/packages/cs3_engine/assets/engine/${encodeURIComponent(file.name)}`;
        const deadline = AbortSignal.timeout(120000);
        const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
        if (!response.ok || Number(response.headers.get('content-length')) > file.bytes) throw Error('CloudStream engine download failed');
        const chunks = []; let length = 0;
        for await (const chunk of response.body) { length += chunk.length; if (length > file.bytes) throw Error('CloudStream engine artifact exceeded size limit'); chunks.push(chunk); }
        const bytes = Buffer.concat(chunks);
        if (length !== file.bytes || hash(bytes) !== file.sha256) throw Error('CloudStream engine checksum mismatch');
        signal?.throwIfAborted();
        await fs.writeFile(target + '.partial', bytes); await fs.rename(target + '.partial', target);
        progress(file.bytes);
      }
      } catch (error) { workers.abort(error); throw error; }
    }));
    const failure = downloads.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    signal?.throwIfAborted();
    this.preparation = { stage: 'license', updatedAt: Date.now() };
    // Keep the upstream license and exact corresponding-source location with the runtime.
    const licenseResponse = await fetch(`https://raw.githubusercontent.com/akashdh11/skystream/${artifacts.commit}/packages/cs3_engine/LICENSE`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
    if (!licenseResponse.ok) throw Error('Could not fetch the CloudStream runtime license');
    const license = Buffer.from(await licenseResponse.arrayBuffer());
    if (hash(license) !== artifacts.licenseSha256) throw Error('Runtime license checksum mismatch');
    await fs.writeFile(path.join(this.directory, 'LICENSE'), license);
    await fs.writeFile(path.join(this.directory, 'SOURCE.txt'), `${artifacts.repository}/tree/${artifacts.commit}/packages/cs3_engine\nGPL-3.0\n`);
    signal.throwIfAborted();
    await fs.writeFile(path.join(this.directory, '.verified'), artifacts.commit);
  }
  async start() {
    if (this.stopped) throw Error('CloudStream host is shutting down');
    if (this.starting) return this.starting;
    if (this.child && this.child.exitCode === null) return;
    this.starting = this.startOnce().finally(() => { this.starting = null; });
    return this.starting;
  }
  async startOnce() {
    if (!await this.ready()) throw Error('Download the CloudStream compatibility runtime in Extensions first');
    // Verify files again before loading executable code, including after an app restart.
    for (const file of artifacts.files) if (hash(await fs.readFile(path.join(this.directory, file.name))) !== file.sha256) throw Error('CloudStream engine needs repair: checksum mismatch');
    await fs.mkdir(path.join(this.root, 'data'), { recursive: true });
    if (this.stopped) throw Error('CloudStream host is shutting down');
    const child = spawn(this.javaHost.java, ['-Xmx512m', '-Dfile.encoding=UTF-8', '-cp', path.join(this.directory, '*'), 'dev.akash.cs3engine.jvm.MainKt', '--stdio', path.join(this.root, 'data')], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    this.child = child;
    this.generation = (this.generation || 0) + 1;
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 8 * 1024 * 1024) { child.kill(); return; }
      let at;
      while ((at = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
        try {
          const response = JSON.parse(line);
          if (response.event) this.onEvent?.(response);
          if (response.event === 'webRequest') {
            const reply = (method, params) => this.send(method, params);
            if (this.browser) void this.browser.handle(response, reply).catch(() => this.send('webReply', { rid: response.rid }).catch(() => {}));
            else void this.send('webReply', { rid: response.rid }).catch(() => {});
          }
          const call = this.pending.get(response.id);
          if (call) response.error ? call.reject(Error(String(response.error.message || response.error.type).replace(/https?:\/\/\S+/g, '[source URL]').slice(0, 300))) : call.resolve(response.result);
        } catch { child.kill(); }
      }
    });
    const ended = () => {
      if (this.child !== child) return;
      this.child = null;
      for (const call of [...this.pending.values()]) call.reject(Error('CloudStream compatibility process stopped'));
    };
    child.once('error', ended); child.once('exit', ended);
    try { await this.send('hello', {}, AbortSignal.timeout(60000)); }
    catch (error) { child.kill(); throw error; }
  }
  async call(method, params = {}, signal) { await this.start(); signal?.throwIfAborted(); return this.send(method, params, signal); }
  send(method, params = {}, signal) {
    signal?.throwIfAborted();
    if (!this.child || this.child.exitCode !== null) return Promise.reject(Error('CloudStream runtime is not running'));
    if (this.pending.size >= 48) return Promise.reject(Error('Too many CloudStream requests'));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); this.pending.delete(id); };
      const cancel = () => { cleanup(); reject(signal.reason); };
      const timer = setTimeout(() => { cleanup(); reject(Error('CloudStream request timed out')); }, 90000);
      this.pending.set(id, { resolve: value => { cleanup(); resolve(value); }, reject: error => { cleanup(); reject(error); } });
      signal?.addEventListener('abort', cancel, { once: true });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n', error => { if (error) this.pending.get(id)?.reject(Error('CloudStream process connection failed')); });
      if (signal?.aborted) cancel();
    });
  }
  reset() { this.browser?.closePages(); this.child?.kill(); this.child = null; for (const call of [...this.pending.values()]) call.reject(Error('CloudStream runtime restarted')); }
  stop() { this.stopped = true; this.browser?.stop(); this.reset(); }
}
module.exports = { SkyStreamHost, artifacts };
