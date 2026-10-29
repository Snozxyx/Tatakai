// Opt-in integration probe. Uses an isolated database and the previously verified runtime cache.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CompatibilityBroker } = require('../desktop/runtime/compatibility/broker.cjs');
const { SuwayomiHost } = require('../desktop/runtime/compatibility/suwayomi.cjs');
const { LocalProxyServer } = require('../desktop/runtime/proxy/local-proxy-server.cjs');
const root = await fs.mkdtemp(path.resolve('.cache/extension-feasibility/broker-'));
const host = new SuwayomiHost(root);
Object.defineProperty(host, 'distribution', { value: path.resolve('.cache/extension-feasibility/suwayomi/Suwayomi-Server-v2.4.2366-windows-x64') });
// The research preparation tool already hash-verifies this distribution. It has
// no production activation marker and is never copied into app user data here.
host.ready = async () => host.filesPresent();
const proxy = new LocalProxyServer({ info() {}, warn() {}, error() {}, debug() {} });
const broker = new CompatibilityBroker({ root, host, proxy: async (url, headers) => { await proxy.ensureStarted(); return proxy.registerSource({ url, headers }); } });
const request = p => broker.request({ requestId: crypto.randomUUID(), ...p });
const checks = [];
try {
  await request({ op: 'addRepository', url: 'https://raw.githubusercontent.com/keiyoushi/extensions/c886cdfc0c1d1bbb997f652396347c64f044729a/index.pb' });
  const unauthorized = await fetch(host.base + '/api/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '{__typename}' }) });
  if (unauthorized.status !== 401) throw Error('Local runtime accepted an unauthenticated request');
  checks.push('Local runtime requires authentication');
  const cookieResult = await host.command('cookies', { url: 'https://example.invalid/', cookies: [{ name: 'tatakai_fixture', value: 'local-only', domain: 'example.invalid', path: '/', secure: true, expirationDate: Math.floor(Date.now() / 1000) + 3600 }], userAgent: 'Tatakai-local-compatibility-test' });
  if (cookieResult.cookies !== 1) throw Error('Local cookie bridge did not accept the fixture');
  checks.push('Private cookie bridge updates the original runtime cookie store');
  const packages = await request({ op: 'packages' });
  const pkg = packages.find(p => p.name === 'MANGA Plus by SHUEISHA');
  if (!pkg) throw Error('Fixture package missing');
  await request({ op: 'install', packageId: pkg.id });
  const installed = await request({ op: 'installedPackages' });
  const iconUrl = installed.find(row => row.id === pkg.id)?.icon;
  if (!iconUrl || iconUrl.includes(host.authorization)) throw Error('Installed extension icon was missing or exposed credentials');
  const icon = await fetch(iconUrl);
  if (!icon.ok || !icon.headers.get('content-type')?.startsWith('image/') || !(await icon.arrayBuffer()).byteLength) throw Error('Installed extension icon proxy failed');
  checks.push('Original installed extension icon loads through the credential-free renderer proxy');
  const source = (await request({ op: 'sources' })).find(s => s.packageId === pkg.id && s.lang === 'en');
  if (!source || source.enabled) throw Error('Sources must initially be disabled');
  await request({ op: 'setEnabled', sourceId: source.id, enabled: true });
  const preferences = await request({ op: 'preferences', sourceId: source.id });
  checks.push(`Original source preferences enumerated (${preferences.length} controls)`);
  const toggle = preferences.find(p => p.kind === 'boolean' && p.enabled && p.visible);
  if (toggle) {
    try {
      const changed = await request({ op: 'setPreference', sourceId: source.id, position: toggle.position, value: !toggle.value });
      if (changed[toggle.position].value !== !toggle.value) throw Error('Source preference was not saved');
      checks.push('Original source preference changed and restored');
    } finally { await request({ op: 'setPreference', sourceId: source.id, position: toggle.position, value: !!toggle.value }); }
  }
  const search = await request({ op: 'search', sourceId: source.id, query: 'Naruto' });
  if (!search.results.length) throw Error('Search returned no results');
  checks.push('Original APK installed, enabled and searched through production broker');
  const info = await request({ op: 'info', sourceId: source.id, id: search.results[0].id });
  if (!info.entries.length) throw Error('No chapters');
  const pages = await request({ op: 'pages', sourceId: source.id, chapterId: info.entries[0].id });
  const image = await fetch(pages.pages[0].imageUrl);
  if (!image.ok || !image.headers.get('content-type')?.startsWith('image/')) throw Error('Protected page proxy failed');
  await image.arrayBuffer(); checks.push('Chapter and image resolved through production proxy without exposing credentials');
  if (!process.env.SKIP_DOWNLOADS) {
  const handlers = new Map();
  let complete, fail;
  const downloaded = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
  const downloadTimer = setTimeout(() => fail(Error('Chapter queue timed out')), 600000);
  const logger = { info() {}, debug() {}, warn() {}, error() {} };
  const downloadRoot = path.join(root, 'downloads');
  require('../desktop/ipc/ipc-manga-download-manager.cjs')({ handle: (channel, callback) => handlers.set(channel, callback) }, { getPath: () => root }, require('node:fs'), path, logger,
    () => ({ isDestroyed: () => false, webContents: { send: (channel, data) => { if (channel === 'manga-download-completed') complete(data); if (channel === 'manga-download-error') fail(Error(data.error)); } } }),
    { compatibilityBroker: broker, workerPool: {}, registry: { listLoaded: () => [] } });
  try {
    const chapterId = info.entries[0].id;
    const queued = await handlers.get('manga-download:enqueue-chapter')({}, { anilistId: -123456789, title: info.title, downloadPath: downloadRoot,
      chapter: { chapterKey: source.id + ':fixture', provider: source.id, providerChapterId: chapterId } });
    if (!queued.success) throw Error(queued.error);
    const result = await downloaded;
    const manifest = JSON.parse(await fs.readFile(path.join(result.localDir, 'manifest.json'), 'utf8'));
    if (manifest.pageCount !== pages.pages.length) throw Error('Downloaded chapter is incomplete');
    for (const page of manifest.pages) if (!(await fs.stat(path.join(result.localDir, page.file))).size) throw Error('Offline page is empty');
    checks.push(`Original APK chapter downloaded through production queue (${manifest.pageCount} complete pages)`);
  } finally { clearTimeout(downloadTimer); }
  }
  await request({ op: 'setEnabled', sourceId: source.id, enabled: false });
  let rejected = false; try { await request({ op: 'pages', sourceId: source.id, chapterId: info.entries[0].id }); } catch { rejected = true; }
  if (!rejected) throw Error('Disabled source still executed');
  checks.push('Disabled source blocked at broker boundary');
  await request({ op: 'remove', packageId: pkg.id });
  console.log(JSON.stringify({ ok: true, checks }, null, 2));
  await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify({ recordedAt: new Date().toISOString(), platform: process.platform, checks }, null, 2));
} finally {
  broker.stop();
  proxy._server?.closeAllConnections();
  await proxy.stop();
  // undici can retain the connections opened to the now-stopped local hosts.
  const { getGlobalDispatcher } = require('undici');
  await getGlobalDispatcher().destroy();
  if (process.env.COMPATIBILITY_PROBE_DEBUG) console.log('Remaining resources:', process.getActiveResourcesInfo());
}
