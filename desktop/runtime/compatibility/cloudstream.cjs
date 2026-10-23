'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { SkyStreamHost, artifacts } = require('./skystream.cjs');
const digest = value => createHash('sha256').update(value).digest('hex');
const packageKey = (repository, name) => digest(repository + '\0' + name);
const sourceKey = (repository, pkg, name, lang) => 'compat-cloudstream-' + digest([repository, pkg, name, lang].join('\0')).slice(0, 32);
const https = value => { const u = new URL(String(value)); if (u.protocol !== 'https:' || u.username || u.password) throw Error('Use an HTTPS URL without login credentials'); u.hash = ''; return u.href; };

class CloudStreamBroker {
  constructor({ root, javaHost, proxy, host, browser }) {
    this.root = root; this.proxy = proxy; this.host = host || new SkyStreamHost({ root, javaHost, browser });
    this.state = null; this.loaded = new Map(); this.sourcesById = new Map(); this.calls = new Map(); this.mutations = Promise.resolve();
    this.ui = new Map(); this.reloads = new Map();
    this.host.onEvent = event => {
      if (event.event === 'restartRequested') {
        const source = [...this.sourcesById.values()].find(s => s.filename === event.plugin);
        if (source && !this.reloads.has(source.packageId)) {
          const task = this.reloadPackage(source).catch(error => { this.errors ||= new Map(); this.errors.set(source.packageId, error.message); }).finally(() => this.reloads.delete(source.packageId));
          this.reloads.set(source.packageId, task);
        }
        return;
      }
      if (!['ui', 'uiOpened', 'uiClosed'].includes(event.event) || !Number.isInteger(event.session)) return;
      const source = [...this.sourcesById.values()].find(s => s.filename === event.plugin);
      if (!source) return;
      if (this.ui.size >= 32 && !this.ui.has(event.session)) this.ui.delete(this.ui.keys().next().value);
      const previous = this.ui.get(event.session);
      this.ui.set(event.session, { packageId: source.packageId, session: event.session, windows: event.windows || previous?.windows || [], closed: event.event === 'uiClosed', error: event.error ? String(event.error).replace(/https?:\/\/\S+/g, '[source URL]').slice(0, 300) : undefined });
    };
  }
  async load() {
    if (this.state) return;
    await fs.mkdir(this.root, { recursive: true });
    let state;
    try { state = JSON.parse(await fs.readFile(path.join(this.root, 'state.json'), 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw Error('CloudStream settings need recovery; existing file was preserved'); state = { version: 1, repositories: [], packages: {}, enabled: {} }; }
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    if (!state || state.version !== 1 || !Array.isArray(state.repositories) || !object(state.packages) || !object(state.enabled) || Object.values(state.enabled).some(value => typeof value !== 'boolean')) throw Error('Invalid CloudStream settings; existing file was preserved');
    this.state = state;
  }
  async save() { const file = path.join(this.root, 'state.json'); await fs.writeFile(file + '.tmp', JSON.stringify(this.state), { mode: 0o600 }); await fs.rename(file + '.tmp', file); }
  async fetchBytes(url, limit, signal) {
    const response = await fetch(https(url), { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000) });
    if (!response.ok || new URL(response.url).protocol !== 'https:' || Number(response.headers.get('content-length')) > limit) throw Error('CloudStream repository download failed');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > limit) throw Error('CloudStream response too large'); chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  async json(url, signal) { return JSON.parse((await this.fetchBytes(url, 10 * 1024 * 1024, signal)).toString('utf8')); }
  async catalog(signal) {
    const packages = new Map();
    for (const repository of this.state.repositories) {
      const metadata = await this.json(repository.url, signal);
      if (!Array.isArray(metadata.pluginLists) || metadata.pluginLists.length > 20) throw Error('Invalid CloudStream repository');
      for (const list of metadata.pluginLists) {
        const entries = await this.json(new URL(list, repository.url).href, signal);
        if (!Array.isArray(entries)) throw Error('Invalid CloudStream package list');
        for (const pkg of entries) {
          if (typeof pkg.internalName !== 'string' || !Number.isInteger(pkg.version)) continue;
          const id = packageKey(repository.url, pkg.internalName), installed = this.state.packages[id];
          packages.set(id, { ...pkg, id, repository: repository.url, ecosystem: 'cloudstream', installed: !!installed, hasUpdate: !!installed && installed.version < pkg.version, error: this.errors?.get(id) });
        }
      }
    }
    for (const [id, pkg] of Object.entries(this.state.packages)) if (!packages.has(id)) packages.set(id, { ...pkg, id, installed: true, hasUpdate: false, error: this.errors?.get(id) });
    return [...packages.values()];
  }
  async filename(pkg) {
    if (!/^[a-f0-9]{64}$/.test(pkg.id) || !/^[a-f0-9]{64}$/i.test(pkg.digest)) throw Error('Invalid installed CloudStream package');
    const file = path.join(this.root, 'packages', `${pkg.id}.${pkg.digest}.cs3`);
    if (digest(await fs.readFile(file)) !== pkg.digest) throw Error('Installed CloudStream package checksum mismatch');
    return file;
  }
  descriptors(pkg, providers, filename, hasSettings = false) {
    return providers.filter(p => !p.error).map(p => ({ id: sourceKey(pkg.repository, pkg.id, p.name, p.lang), upstreamId: `${p.name}\0${p.lang}`, name: p.name, lang: p.lang, extensionName: pkg.name,
      packageId: pkg.id, repository: pkg.repository, ecosystem: 'cloudstream', kind: 'watch', hasMainPage: p.hasMainPage, hasSettings, filename }));
  }
  async sources(signal) {
    await this.load();
    await Promise.all(this.reloads.values());
    if (!await this.host.ready()) return [];
    await this.host.start();
    if (this.generation !== this.host.generation) { this.loaded.clear(); this.sourcesById.clear(); this.generation = this.host.generation; }
    this.errors ||= new Map();
    for (const pkg of Object.values(this.state.packages)) if (!this.loaded.has(pkg.id)) {
      try {
        const file = await this.filename(pkg);
        const result = await this.host.call('loadPlugin', { path: file, url: pkg.url }, signal);
        const sources = this.descriptors(pkg, result.providers || [], file, result.hasSettings);
        this.loaded.set(pkg.id, sources); for (const source of sources) this.sourcesById.set(source.id, source);
        this.errors.delete(pkg.id);
      } catch (error) { if (signal?.aborted) throw error; this.errors.set(pkg.id, error.message); }
    }
    return [...this.sourcesById.values()].map(({ filename, ...source }) => ({ ...source, enabled: this.state.enabled[source.id] === true }));
  }
  async reloadPackage(source) {
    const pkg = this.state.packages[source.packageId]; if (!pkg) return;
    const result = await this.host.call('reloadPlugin', { path: source.filename, url: pkg.url });
    const descriptors = this.descriptors(pkg, result.providers || [], source.filename, result.hasSettings);
    for (const [id, existing] of this.sourcesById) if (existing.packageId === pkg.id) this.sourcesById.delete(id);
    for (const descriptor of descriptors) this.sourcesById.set(descriptor.id, descriptor);
    this.loaded.set(pkg.id, descriptors);
    for (const state of this.ui.values()) if (state.packageId === pkg.id) state.closed = true;
  }
  async request(p) {
    await this.load();
    if (p.op === 'cancel') { this.calls.get(p.target)?.abort(); return null; }
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), p.op === 'prepare' ? 900000 : 120000);
    if (this.calls.size >= 24 || this.calls.has(p.requestId)) { clearTimeout(timeout); throw Error('Too many CloudStream requests'); }
    this.calls.set(p.requestId, controller); controller.sourceId = p.sourceId;
    const run = () => this.execute(p, controller.signal);
    try {
      const result = ['prepare', 'addRepository', 'removeRepository', 'install', 'remove', 'setEnabled'].includes(p.op) ? await (this.mutations = this.mutations.catch(() => {}).then(run)) : await run();
      controller.signal.throwIfAborted();
      if (p.sourceId && !['setEnabled', 'settings', 'settingsState', 'settingsAction', 'closeSettings'].includes(p.op) && this.state.enabled[p.sourceId] !== true) throw Error('Source was disabled');
      return result;
    } finally { clearTimeout(timeout); this.calls.delete(p.requestId); }
  }
  async execute(p, signal) {
    signal.throwIfAborted();
    if (p.op === 'prepare') { await this.host.prepare(signal); return { ready: true }; }
    if (p.op === 'sources') return this.sources(signal);
    if (p.op === 'installedPackages') return Object.entries(this.state.packages).map(([id, pkg]) => ({ id, name: pkg.name, version: String(pkg.version), repository: pkg.repository, ecosystem: 'cloudstream', installed: true, hasUpdate: false, icon: pkg.iconUrl || pkg.icon, error: this.errors?.get(id) }));
    if (p.op === 'repositories') return this.state.repositories;
    if (p.op === 'addRepository' || p.op === 'removeRepository') {
      const url = https(p.url);
      const previous = this.state.repositories;
      if (p.op === 'addRepository') {
        const metadata = await this.json(url, signal);
        if (!Array.isArray(metadata.pluginLists)) throw Error('Invalid CloudStream repository');
        this.state.repositories = [...this.state.repositories.filter(r => r.url !== url), { url, name: metadata.name || 'CloudStream repository', ecosystem: 'cloudstream' }];
      } else this.state.repositories = this.state.repositories.filter(r => r.url !== url);
      try { await this.save(); } catch (error) { this.state.repositories = previous; throw error; }
      return null;
    }
    if (p.op === 'packages') return this.catalog(signal);
    if (p.op === 'install') return this.install(p.packageId, signal);
    if (p.op === 'remove') {
      const pkg = this.state.packages[p.packageId]; if (!pkg) throw Error('Unknown installed package');
      const file = await this.filename(pkg);
      if (this.loaded.has(pkg.id)) await this.host.call('unloadPlugin', { path: file }, signal);
      const flags = { ...this.state.enabled };
      delete this.state.packages[pkg.id];
      for (const [id, source] of this.sourcesById) if (source.packageId === pkg.id) delete this.state.enabled[id];
      try { await this.save(); }
      catch (error) {
        this.state.packages[pkg.id] = pkg; this.state.enabled = flags;
        this.loaded.delete(pkg.id); for (const [id, source] of this.sourcesById) if (source.packageId === pkg.id) this.sourcesById.delete(id);
        throw error;
      }
      delete this.state.packages[pkg.id]; this.loaded.delete(pkg.id);
      for (const [id, source] of this.sourcesById) if (source.packageId === pkg.id) { delete this.state.enabled[id]; this.sourcesById.delete(id); for (const call of this.calls.values()) if (call.sourceId === id) call.abort(); }
      await fs.rm(file, { force: true }); return null;
    }
    await this.sources(signal);
    const source = this.sourcesById.get(p.sourceId);
    if (!source) throw Error('Source is not installed');
    if (p.op === 'settings') {
      const result = await this.host.call('openSettings', { path: source.filename }, signal);
      if (!this.ui.has(result.session)) this.ui.set(result.session, { packageId: source.packageId, session: result.session, windows: [], closed: false });
      return { session: result.session };
    }
    if (['settingsState', 'settingsAction', 'closeSettings'].includes(p.op)) {
      const state = this.ui.get(p.session);
      if (!state || state.packageId !== source.packageId) throw Error('Settings session does not belong to this extension');
      if (p.op === 'settingsState') { const { packageId, ...publicState } = state; return publicState; }
      if (p.op === 'closeSettings') { await this.host.call('closeUi', { session: p.session, force: true }, signal); this.ui.delete(p.session); return null; }
      if (!Number.isInteger(p.node) || p.node < 0 || !['click', 'check', 'text', 'submit', 'select', 'slide', 'close'].includes(p.action) || JSON.stringify(p.value ?? null).length > 10000) throw Error('Invalid settings action');
      if (state.closed) throw Error('Settings screen has closed');
      await this.host.call('uiAction', { session: p.session, node: p.node, action: p.action, value: p.value }, signal); return null;
    }
    if (p.op === 'setEnabled') {
      if (typeof p.enabled !== 'boolean') throw Error('Invalid enabled state');
      const previous = this.state.enabled[source.id];
      this.state.enabled[source.id] = p.enabled;
      try { await this.save(); } catch (error) { if (previous === undefined) delete this.state.enabled[source.id]; else this.state.enabled[source.id] = previous; throw error; }
      if (!p.enabled) for (const [id, call] of this.calls) if (id !== p.requestId && call.sourceId === source.id) call.abort();
      return null;
    }
    if (!this.state.enabled[source.id]) throw Error('Source is disabled');
    const args = { provider: source.name, plugin: source.filename };
    if (p.op === 'search' || p.op === 'browse') {
      const query = String(p.query || '').trim().slice(0, 300), page = Math.max(1, Math.min(Number(p.page) || 1, 100));
      if (!query && !source.hasMainPage) return { results: [], hasNextPage: false };
      const result = await this.host.call(query ? 'search' : 'mainPage', { ...args, query, page }, signal);
      const items = query ? result.items : (result.sections || []).flatMap(s => s.items || []);
      return { results: await Promise.all((items || []).map(async item => ({ id: this.titleId(source.id, item.url), title: item.name, image: await this.image(item.posterUrl, item.posterHeaders) }))), hasNextPage: !!result.hasNext };
    }
    const url = this.titleUrl(source.id, p.id);
    if (p.op === 'info') return this.info(source, url, signal);
    if (p.op === 'resolve') {
      const detail = await this.host.call('load', { ...args, url }, signal);
      const entry = this.entries(source.id, detail).find(e => e.id === p.episodeId);
      if (!entry) throw Error('Episode does not belong to this title/source');
      const result = await this.host.call('loadLinks', { ...args, data: entry.data, timeoutMs: 30000 }, signal);
      const supported = (result.links || []).filter(link => /^https?:\/\//.test(link.url) && ['VIDEO', 'M3U8', 'DASH'].includes(link.type) && !link.drm);
      if (!supported.length) {
        if (result.links?.some(link => link.drm)) throw Error('This source requires DRM playback, which the compatibility host does not support yet');
        if (result.completed === false) throw Error('The source timed out before returning a supported HTTP stream');
        throw Error('The source returned no supported HTTP streams');
      }
      const browserRank = link => link.type === 'M3U8' ? 5 : /\.(mp4|m4v)(?:\?|$)/i.test(link.url) ? 4 : /\.webm(?:\?|$)/i.test(link.url) ? 3 : link.type === 'DASH' ? 2 : 1;
      supported.sort((a, b) => browserRank(b) - browserRank(a) || Number(b.quality) - Number(a.quality));
      return { sources: supported.map(link => ({
        url: link.url, headers: { ...(link.headers || {}), ...(link.referer ? { Referer: link.referer } : {}) }, quality: Number(link.quality) > 0 ? `${link.quality}p` : 'Auto', sourceType: link.type === 'M3U8' ? 'hls' : link.type === 'DASH' ? 'dash' : 'mp4',
        source: link.name || source.name, providerName: source.extensionName, providerKey: source.id,
        subtitles: (result.subtitles || []).filter(track => /^https?:\/\//.test(track.url)).map(track => ({ ...track, language: track.lang || 'und', label: track.lang || 'Unknown' })),
      })) };
    }
    throw Error('Unsupported CloudStream operation');
  }
  titleId(sourceId, url) { if (!/^https?:\/\//.test(url)) throw Error('Invalid title URL'); return Buffer.from(JSON.stringify([sourceId, url])).toString('base64url'); }
  titleUrl(sourceId, id) {
    if (typeof id !== 'string' || id.length > 20000) throw Error('Invalid title ID');
    const decoded = JSON.parse(Buffer.from(id, 'base64url').toString());
    if (!Array.isArray(decoded) || decoded[0] !== sourceId || !/^https?:\/\//.test(decoded[1])) throw Error('Title does not belong to this source');
    return decoded[1];
  }
  entries(sourceId, detail) {
    const entries = detail.dataUrl ? [{ data: detail.dataUrl, name: 'Play', episode: 1 }] : (detail.episodes || []).filter(e => !e.dub || e.dub === 'Subbed');
    return entries.map((e, index) => ({ id: digest(sourceId + '\0' + e.data), label: e.name || `Episode ${e.episode || index + 1}`, number: e.episode ?? index + 1, data: e.data }));
  }
  async info(source, url, signal) {
    const detail = await this.host.call('load', { provider: source.name, plugin: source.filename, url }, signal);
    // Optional upstream IDs remain hints until the renderer verifies their type/identity.
    const ids = detail.syncIds || detail.syncData || {};
    const catalogIds = { ...(ids.anilist ? { anilist: ids.anilist } : {}), ...(ids.mal ? { mal: ids.mal } : {}) };
    return { id: this.titleId(source.id, url), title: detail.name, description: detail.plot,
      ...(Object.keys(catalogIds).length ? { catalogIds } : {}),
      image: await this.image(detail.posterUrl, detail.posterHeaders),
      banner: await this.image(detail.backgroundPosterUrl, detail.posterHeaders),
      meta: { ...(detail.year ? { Year: String(detail.year) } : {}), ...(detail.showStatus ? { Status: detail.showStatus } : {}), ...(detail.tags?.length ? { Genres: detail.tags.join(', ') } : {}) },
      entries: this.entries(source.id, detail).map(({ data, ...entry }) => entry) };
  }
  async image(url, headers) { if (!url || !/^https?:\/\//.test(url)) return undefined; return headers && Object.keys(headers).length ? this.proxy(url, headers) : url; }
  async install(id, signal) {
    const pkg = (await this.catalog(signal)).find(p => p.id === id); if (!pkg) throw Error('Package is not in an added repository');
    const expected = String(pkg.fileHash || '').replace(/^sha256-/, '');
    if (!/^[a-f0-9]{64}$/i.test(expected)) throw Error('Package does not publish a SHA-256 checksum');
    const bytes = await this.fetchBytes(pkg.url, 50 * 1024 * 1024, signal);
    if (digest(bytes) !== expected.toLowerCase()) throw Error('Package checksum mismatch');
    const candidate = { ...pkg, digest: expected.toLowerCase() }, previous = this.state.packages[id];
    const folder = path.join(this.root, 'packages'); await fs.mkdir(folder, { recursive: true });
    const file = path.join(folder, `${id}.${candidate.digest}.cs3`);
    await fs.writeFile(file + '.partial', bytes); await fs.rename(file + '.partial', file);
    // Load a separate candidate path first. A failed candidate never replaces the persisted package.
    try {
      await this.host.call('loadPlugin', { path: file, url: pkg.url }, signal);
      if (previous && previous.digest !== candidate.digest) await this.host.call('unloadPlugin', { path: await this.filename(previous) }, signal);
      signal?.throwIfAborted();
      this.state.packages[id] = candidate;
      try { await this.save(); } catch (error) { if (previous) this.state.packages[id] = previous; else delete this.state.packages[id]; throw error; }
      this.loaded.delete(id); for (const [key, source] of this.sourcesById) if (source.packageId === id) this.sourcesById.delete(key);
    } catch (error) {
      try {
        if (!previous || previous.digest !== candidate.digest) await this.host.call('unloadPlugin', { path: file });
        if (previous) await this.host.call('loadPlugin', { path: await this.filename(previous), url: previous.url });
      } catch {
        // Retain the persisted previous pointer and recreate the JVM on the next request.
        if (this.host.reset) this.host.reset(); else this.host.stop();
        this.loaded.clear(); this.sourcesById.clear(); this.ui.clear();
        throw Error(`${error.message}; compatibility process reset after failed recovery`);
      }
      throw error;
    }
    return null;
  }
  stop() { for (const call of this.calls.values()) call.abort(); this.host.stop(); }
}
module.exports = { CloudStreamBroker, packageKey, sourceKey, engineBytes: artifacts.files.reduce((n, f) => n + f.bytes, 0) };
