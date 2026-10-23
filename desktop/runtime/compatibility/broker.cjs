'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { SuwayomiHost, runtimeFor } = require('./suwayomi.cjs');
const { CloudStreamBroker, engineBytes } = require('./cloudstream.cjs');
const { PREFERENCE_FIELDS, preferences, preferenceChange } = require('./preferences.cjs');
const { addMihonRepository } = require('./mihon-repository.cjs');
const { AniyomiHost, pins: aniyomiPins } = require('./aniyomi.cjs');
const sourceKey = (repo, pkg, source) => 'compat-mihon-' + createHash('sha256').update(JSON.stringify([repo, pkg, source])).digest('hex').slice(0, 32);
const httpsUrl = value => { const u = new URL(String(value)); if (u.protocol !== 'https:' || u.username || u.password) throw Error('Use an HTTPS repository URL without login credentials'); u.hash = ''; return u.href; };
const positiveId = value => { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) throw Error('Invalid content ID'); return id; };

class CompatibilityBroker {
  constructor({ root, proxy, host, browser }) {
    this.root = root; this.proxy = proxy; this.host = host || new SuwayomiHost(root); this.browser = browser;
    this.state = null; this.calls = new Map(); this.mutations = Promise.resolve();
    this.cloudstream = host ? null : new CloudStreamBroker({ root: path.join(root, '..', 'cloudstream'), javaHost: this.host, proxy, browser });
    this.aniyomi = host ? null : new AniyomiHost({ root: path.join(root, '..', 'aniyomi'), javaHost: this.host, browser });
  }
  async load() {
    if (!this.state) {
      await fs.mkdir(this.root, { recursive: true });
      let state;
      try { state = JSON.parse(await fs.readFile(path.join(this.root, 'state.json'), 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') throw Error('Compatibility settings need recovery; existing file was preserved'); state = { version: 1, enabled: {} }; }
      if (!state || state.version !== 1 || !state.enabled || typeof state.enabled !== 'object' || Array.isArray(state.enabled)) throw Error('Invalid compatibility settings; existing file was preserved');
      if (state.sourceOrigins !== undefined && (!state.sourceOrigins || typeof state.sourceOrigins !== 'object' || Array.isArray(state.sourceOrigins) || Object.values(state.sourceOrigins).some(value => typeof value !== 'string'))) throw Error('Invalid source identities; existing file was preserved');
      this.state = state;
    }
  }
  async save() { const file = path.join(this.root, 'state.json'); await fs.writeFile(file + '.tmp', JSON.stringify(this.state), { mode: 0o600 }); await fs.rename(file + '.tmp', file); }
  async sources(signal) {
    if (!await this.host.ready()) return [];
    await this.host.start();
    const b = await this.host.graphql('{ extensions { nodes { pkgName name isInstalled storeIndexUrl source { nodes { id name lang } } } } }', {}, signal);
    return b.extensions.nodes.filter(e => e.isInstalled).flatMap(e => e.source.nodes.map(s => {
      const repository = this.state.sourceOrigins?.[JSON.stringify([e.pkgName, String(s.id)])] ?? e.storeIndexUrl ?? '';
      const id = sourceKey(repository, e.pkgName, s.id);
      return { id, upstreamId: String(s.id), packageId: e.pkgName, repository, ecosystem: 'mihon', name: s.name,
        extensionName: e.name, lang: s.lang, kind: 'read', enabled: this.state.enabled[id] === true };
    }));
  }
  async rememberSourceOrigins(signal) {
    const installed = await this.sources(signal);
    if (!installed.length) return;
    const previous = this.state.sourceOrigins;
    this.state.sourceOrigins = { ...previous };
    for (const source of installed) this.state.sourceOrigins[JSON.stringify([source.packageId, source.upstreamId])] = source.repository;
    try { await this.save(); } catch (error) { if (previous === undefined) delete this.state.sourceOrigins; else this.state.sourceOrigins = previous; throw error; }
  }
  async mediaUrl(url) {
    if (!url) return undefined;
    const resolved = new URL(url, this.host.base);
    if (!['http:', 'https:'].includes(resolved.protocol) || resolved.username || resolved.password) return undefined;
    // Credentials never enter the renderer or a download descriptor.
    return this.proxy(resolved.href, resolved.origin === this.host.base ? { Authorization: this.host.authorization } : {});
  }
  async request(payload) {
    if (!payload || typeof payload.op !== 'string' || typeof payload.requestId !== 'string' || payload.requestId.length > 100) throw Error('Invalid compatibility request');
    if (!['status', 'cancel', 'prepare', 'sources', 'repositories', 'addRepository', 'removeRepository', 'packages', 'installedPackages', 'install', 'remove', 'setEnabled', 'search', 'browse', 'info', 'chapters', 'pages', 'resolve', 'preferences', 'setPreference', 'settings', 'settingsState', 'settingsAction', 'closeSettings', 'authenticate'].includes(payload.op)) throw Error('Unsupported compatibility operation');
    if (payload.op === 'cancel') { this.calls.get(payload.target)?.controller.abort(); await this.cloudstream?.request(payload); await this.aniyomi?.request(payload); return null; }
    if (payload.ecosystem === 'aniyomi' || String(payload.sourceId || '').startsWith('compat-aniyomi-')) {
      if (!this.aniyomi) throw Error('Aniyomi host is unavailable'); return this.aniyomi.request(payload);
    }
    if (payload.ecosystem === 'cloudstream' || String(payload.sourceId || '').startsWith('compat-cloudstream-')) {
      if (!this.cloudstream) throw Error('CloudStream host is unavailable');
      return this.cloudstream.request(payload);
    }
    await this.load();
    if (payload.op === 'status') return { platform: process.platform, runtimes: [
      { ecosystem: 'mihon', available: !!runtimeFor(), ready: await this.host.ready(), preparing: !!this.host.preparing, preparation: this.host.preparation, downloadBytes: runtimeFor()?.bytes, authentication: !!this.browser, message: 'Local Mihon runtime; platform builds require device validation' },
      { ecosystem: 'cloudstream', available: !!this.cloudstream && !!runtimeFor(), ready: !!this.cloudstream && await this.cloudstream.host.ready(), preparing: !!this.cloudstream?.host.preparing, preparation: this.cloudstream?.host.preparation?.stage === 'java' ? this.host.preparation : this.cloudstream?.host.preparation, downloadBytes: (runtimeFor()?.bytes || 0) + engineBytes, updates: true, message: 'Local original-CS3 JVM host; browser-dependent APIs require device integration' },
      { ecosystem: 'aniyomi', available: !!this.aniyomi && !!runtimeFor(), ready: !!this.aniyomi && await this.aniyomi.ready(), preparing: !!this.aniyomi?.preparing, preparation: this.aniyomi?.preparation?.stage === 'java' ? this.host.preparation : this.aniyomi?.preparation, downloadBytes: (await this.host.ready() ? 0 : runtimeFor()?.bytes || 0) + (this.aniyomi?.bundledRequired ? 0 : aniyomiPins.desktop.bytes + aniyomiPins.verifier.bytes), updates: true, authentication: false, message: 'Local original Aniyomi APK host; WebView and device validation remain incomplete' },
    ] };
    if (payload.ecosystem && payload.ecosystem !== 'mihon') throw Error('This ecosystem has no desktop compatibility host yet');
    if (this.calls.has(payload.requestId) || this.calls.size >= 24) throw Error('Too many compatibility requests');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), payload.op === 'prepare' ? 900000 : payload.op === 'authenticate' ? 310000 : 120000);
    this.calls.set(payload.requestId, { controller, sourceId: payload.sourceId });
    const run = () => this.execute(payload, controller.signal);
    try {
      const mutations = ['prepare', 'addRepository', 'removeRepository', 'install', 'remove', 'setEnabled', 'setPreference'];
      const result = mutations.includes(payload.op) ? await (this.mutations = this.mutations.catch(() => {}).then(run)) : await run();
      controller.signal.throwIfAborted();
      if (payload.sourceId && !['setEnabled', 'preferences', 'setPreference', 'authenticate'].includes(payload.op) && this.state.enabled[payload.sourceId] !== true) throw Error('Source was disabled');
      return result;
    } finally { clearTimeout(timer); this.calls.delete(payload.requestId); }
  }
  async execute(p, signal) {
    signal.throwIfAborted();
    if (p.op === 'prepare') { await this.host.prepare(signal); return { ready: true }; }
    if (p.op === 'installedPackages') {
      if (!await this.host.ready()) return [];
      await this.host.start();
      const b = await this.host.graphql('{ extensions { nodes { pkgName name versionName isInstalled hasUpdate storeIndexUrl iconUrl } } }', {}, signal);
      return Promise.all(b.extensions.nodes.filter(e => e.isInstalled).map(async e => ({ id: e.pkgName, pkgName: e.pkgName, name: e.name, version: e.versionName, installed: true, hasUpdate: e.hasUpdate, repository: e.storeIndexUrl || '', ecosystem: 'mihon', icon: await this.mediaUrl(e.iconUrl) })));
    }
    if (p.op === 'sources') {
      if (!p.ecosystem && this.cloudstream) {
        const results = await Promise.allSettled([this.sources(signal), this.cloudstream.sources(signal), this.aniyomi ? this.aniyomi.request({ op: 'sources', requestId: randomUUID() }) : Promise.resolve([])]);
        return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      }
      const sources = await this.sources(signal);
      return sources;
    }
    await this.host.start();
    const gql = (query, variables = {}) => this.host.graphql(query, variables, signal);
    if (p.op === 'repositories') return (await gql('{ extensionStores { nodes { indexUrl name } } }')).extensionStores.nodes.map(r => ({ url: r.indexUrl, name: r.name, ecosystem: 'mihon' }));
    if (p.op === 'addRepository' || p.op === 'removeRepository') {
      const url = httpsUrl(p.url);
      if (p.op === 'addRepository') {
        // A raw-endpoint retry must not change identities of already installed sources.
        await this.rememberSourceOrigins(signal);
        return addMihonRepository(url, u => gql('mutation($u: String!) { addExtensionStore(input: { indexUrl: $u }) { extensionStore { name indexUrl } } }', { u }), signal);
      }
      // Existing installed extensions retain their source identity; removing a repository does not delete packages.
      return gql('mutation($u: String!) { removeExtensionStore(input: { indexUrl: $u }) { clientMutationId } }', { u: url });
    }
    if (p.op === 'packages') {
      const b = await gql('mutation { fetchExtensions(input: {}) { extensions { pkgName name versionName isInstalled hasUpdate storeIndexUrl } } }');
      return b.fetchExtensions.extensions.map(e => ({ id: e.pkgName, name: e.name, version: e.versionName, installed: e.isInstalled, hasUpdate: e.hasUpdate, repository: e.storeIndexUrl, ecosystem: 'mihon' }));
    }
    if (p.op === 'install' || p.op === 'remove') {
      if (typeof p.packageId !== 'string' || !/^[\w.]{1,200}$/.test(p.packageId)) throw Error('Invalid extension package');
      const patch = p.op === 'remove' ? { uninstall: true } : p.update ? { update: true } : { install: true };
      if (p.op === 'install') await this.rememberSourceOrigins(signal);
      const removed = p.op === 'remove' ? (await this.sources(signal)).filter(s => s.packageId === p.packageId).map(s => s.id) : [];
      const b = await gql('mutation($id: String!, $patch: UpdateExtensionPatchInput!) { updateExtension(input: { id: $id, patch: $patch }) { extension { pkgName isInstalled } } }', { id: p.packageId, patch });
      if (!b.updateExtension.extension || b.updateExtension.extension.isInstalled !== (p.op === 'install')) throw Error('Extension installation state did not change');
      if (p.op === 'remove') {
        // Abort any in-flight source work before new results can reach the reader.
        for (const sourceId of removed) delete this.state.enabled[sourceId];
        for (const key of Object.keys(this.state.sourceOrigins || {})) if (JSON.parse(key)[0] === p.packageId) delete this.state.sourceOrigins[key];
        await this.save();
        for (const [id, call] of this.calls) if (id !== p.requestId && removed.includes(call.sourceId)) call.controller.abort();
      }
      return b.updateExtension.extension;
    }
    const source = (await this.sources(signal)).find(s => s.id === p.sourceId);
    if (!source) throw Error('Source is not installed');
    if (p.op === 'authenticate') {
      if (!this.browser || !this.host.command) throw Error('Source sign-in requires the installed desktop browser bridge');
      const data = await gql('query($id: LongString!) { source(id: $id) { homeUrl } }', { id: source.upstreamId });
      const target = new URL(data.source.homeUrl);
      if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) throw Error('Invalid source sign-in URL');
      const url = target.href;
      const result = await this.browser.authenticate(url, signal);
      if (!result) throw Error('Source sign-in was cancelled');
      await this.host.command('cookies', { ...result, replace: true }, signal); return null;
    }
    if (p.op === 'preferences' || p.op === 'setPreference') {
      const data = await gql(`query($id: LongString!) { source(id: $id) { preferences { ${PREFERENCE_FIELDS} } } }`, { id: source.upstreamId });
      if (p.op === 'preferences') return preferences(data.source.preferences);
      const change = preferenceChange(data.source.preferences, p.position, p.value);
      const result = await gql(`mutation($i: UpdateSourcePreferenceInput!) { updateSourcePreference(input: $i) { preferences { ${PREFERENCE_FIELDS} } } }`, { i: { source: source.upstreamId, change } });
      return preferences(result.updateSourcePreference.preferences);
    }
    if (p.op === 'setEnabled') {
      if (typeof p.enabled !== 'boolean') throw Error('Invalid enabled state');
      const previous = this.state.enabled[source.id];
      this.state.enabled[source.id] = p.enabled;
      try { await this.save(); } catch (error) { if (previous === undefined) delete this.state.enabled[source.id]; else this.state.enabled[source.id] = previous; throw error; }
      if (!p.enabled) for (const [id, c] of this.calls) if (id !== p.requestId && c.sourceId === source.id) c.controller.abort();
      return null;
    }
    if (!source.enabled) throw Error('Source is disabled');
    if (p.op === 'search' || p.op === 'browse') {
      const query = String(p.query || '').trim().slice(0, 300);
      const b = await gql('mutation($i: FetchSourceMangaInput!) { fetchSourceManga(input: $i) { hasNextPage mangas { id title thumbnailUrl } } }', { i: { source: source.upstreamId, type: query ? 'SEARCH' : 'POPULAR', query, page: Math.max(1, Math.min(Number(p.page) || 1, 100)) } });
      return { hasNextPage: b.fetchSourceManga.hasNextPage, results: await Promise.all(b.fetchSourceManga.mangas.map(async m => ({ id: String(m.id), title: m.title, image: await this.mediaUrl(m.thumbnailUrl) }))) };
    }
    if (p.op === 'info' || p.op === 'chapters') {
      const id = positiveId(p.id);
      const owner = await gql('query($id: Int!) { manga(id: $id) { sourceId } }', { id });
      if (String(owner.manga.sourceId) !== source.upstreamId) throw Error('Title does not belong to this source');
      const b = await gql('mutation($i: FetchMangaAndChaptersInput!) { fetchMangaAndChapters(input: $i) { manga { id title description thumbnailUrl initialized } chapters { id name chapterNumber } } }', { i: { id, fetchManga: true, fetchChapters: true } });
      const detail = b.fetchMangaAndChapters;
      return { id: String(id), title: detail.manga.title, description: detail.manga.description, image: await this.mediaUrl(detail.manga.thumbnailUrl),
        entries: detail.chapters.map(c => ({ id: String(c.id), label: c.name, number: c.chapterNumber })).sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity)) };
    }
    if (p.op === 'pages') {
      const id = positiveId(p.chapterId);
      const owner = await gql('query($id: Int!) { chapter(id: $id) { manga { sourceId } } }', { id });
      if (String(owner.chapter.manga.sourceId) !== source.upstreamId) throw Error('Chapter does not belong to this source');
      const b = await gql('mutation($i: FetchChapterPagesInput!) { fetchChapterPages(input: $i) { pages } }', { i: { chapterId: id } });
      return { pages: await Promise.all(b.fetchChapterPages.pages.map(async (url, index) => ({ pageNumber: index + 1, imageUrl: await this.mediaUrl(url), resourceIdentity: createHash('sha256').update(JSON.stringify([source.id, id, index, new URL(url, this.host.base).pathname])).digest('hex') }))) };
    }
    throw Error('Unsupported compatibility operation');
  }
  stop() { for (const c of this.calls.values()) c.controller.abort(); this.aniyomi?.stop(); this.browser?.stop(); this.cloudstream?.stop(); this.host.stop(); }
}
module.exports = { CompatibilityBroker, sourceKey, httpsUrl };
