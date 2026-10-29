import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CloudStreamBroker } = require('../desktop/runtime/compatibility/cloudstream.cjs');
const { SkyStreamHost } = require('../desktop/runtime/compatibility/skystream.cjs');
const { CompatibilityBroker } = require('../desktop/runtime/compatibility/broker.cjs');
const { LocalProxyServer } = require('../desktop/runtime/proxy/local-proxy-server.cjs');
const root = await fs.mkdtemp(path.resolve('.cache/extension-feasibility/cloudstream-broker-'));
const host = new SkyStreamHost({ root, javaHost: { ready: async () => true, java: path.resolve('.cache/extension-feasibility/suwayomi/Suwayomi-Server-v2.4.2366-windows-x64/jre/bin/java.exe') } });
Object.defineProperty(host, 'directory', { value: path.resolve('.cache/extension-feasibility/skystream/packages/cs3_engine/assets/engine') });
host.ready = async () => true;
const proxy = new LocalProxyServer({ info() {}, warn() {}, error() {}, debug() {} });
const broker = new CloudStreamBroker({ root, host, proxy: async (url, headers) => { await proxy.ensureStarted(); return proxy.registerSource({ url, headers }); } });
const transport = new CompatibilityBroker({ root: path.join(root, 'mihon'), host: { ready: async () => false, stop() {} } });
transport.cloudstream = broker;
const request = payload => transport.request({ requestId: crypto.randomUUID(), ecosystem: 'cloudstream', ...payload });
const tests = [];
try {
  await request({ op: 'addRepository', url: 'https://raw.githubusercontent.com/recloudstream/extensions/cf16b3b45cda911a36ddca69f9acbe4763c6a4b1/repo.json' });
  // Keep repository discovery original, and pin its moving package-list link for reproducibility.
  const originalJson = broker.json.bind(broker);
  broker.json = async (url, signal) => {
    if (url.includes('/builds/plugins.json')) url = 'https://raw.githubusercontent.com/recloudstream/extensions/fcb6101ce646951f5055a6aff67ee2e9f3e1fd54/plugins.json';
    const data = await originalJson(url, signal);
    if (Array.isArray(data)) for (const pkg of data) pkg.url = pkg.url.replace('/builds/', '/fcb6101ce646951f5055a6aff67ee2e9f3e1fd54/');
    return data;
  };
  const packages = await request({ op: 'packages' });
  const pkg = packages.find(p => p.internalName === (process.env.CS3_PROVIDER || 'InternetArchiveProvider'));
  if (!pkg) throw Error('Fixture package missing');
  await request({ op: 'install', packageId: pkg.id });
  const [source] = await request({ op: 'sources' });
  if (!source || source.enabled) throw Error('Source must install disabled');
  await request({ op: 'setEnabled', sourceId: source.id, enabled: true });
  const found = await request({ op: 'search', sourceId: source.id, query: process.env.CS3_QUERY || 'identifier:BigBuckBunny_124' });
  if (!found.results.length) throw Error('Original source returned no search results');
  tests.push({ name: 'Original repository/CS3 install/enable/search through production broker', status: 'demonstrated', count: found.results.length });
  try {
    const info = await request({ op: 'info', sourceId: source.id, id: found.results[0].id });
    const result = await request({ op: 'resolve', sourceId: source.id, id: info.id, episodeId: info.entries[0].id });
    tests.push({ name: 'Title and stream resolution through production broker', status: result.sources.length ? 'demonstrated' : 'blocked', streams: result.sources.length, subtitleCount: result.sources.reduce((n, s) => n + s.subtitles.length, 0) });
    const resolved = result.sources.find(s => /\.mp4(?:\?|$)/i.test(s.url)) || result.sources[0];
    const response = await fetch(resolved.url, { headers: { ...resolved.headers, Range: 'bytes=0-65535' }, signal: AbortSignal.timeout(45000) });
    const reader = response.body.getReader(); const chunk = await reader.read(); await reader.cancel();
    if (!response.ok || !chunk.value?.length) throw Error('Resolved stream could not deliver media bytes');
    tests.push({ name: 'Resolved original-provider media delivers bytes', status: 'demonstrated', statusCode: response.status, contentType: response.headers.get('content-type'), bytes: chunk.value.length });
    await fs.writeFile(path.join(root, 'resolved-stream.local.json'), JSON.stringify(resolved));
  } catch (e) { tests.push({ name: 'Title and stream resolution through production broker', status: 'blocked', error: e.message }); }
  broker.stop();
  const nextHost = new SkyStreamHost({ root, javaHost: host.javaHost });
  Object.defineProperty(nextHost, 'directory', { value: host.directory }); nextHost.ready = async () => true;
  const restarted = new CloudStreamBroker({ root, host: nextHost, proxy: broker.proxy }); restarted.json = broker.json;
  transport.cloudstream = restarted;
  const restored = (await request({ op: 'sources' })).find(s => s.id === source.id);
  if (!restored?.enabled) throw Error('Source identity/enable flag did not survive process restart');
  tests.push({ name: 'Original package and enabled source survive fresh host/broker restart', status: 'demonstrated' });
  await request({ op: 'setEnabled', sourceId: source.id, enabled: false });
  let rejected = false; try { await request({ op: 'search', sourceId: source.id, query: 'nature' }); } catch { rejected = true; }
  if (!rejected) throw Error('Disabled source still executed');
  await request({ op: 'remove', packageId: pkg.id });
  if ((await request({ op: 'sources' })).length) throw Error('Removed sources still visible');
  tests.push({ name: 'Disable gate and original-plugin removal', status: 'demonstrated' });
} catch (e) { tests.push({ name: 'Production broker integration', status: 'blocked', error: e.message }); process.exitCode = 1; }
finally { transport.stop(); proxy._server?.closeAllConnections(); await proxy.stop(); await require('undici').getGlobalDispatcher().destroy(); await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify({ recordedAt: new Date().toISOString(), provider: process.env.CS3_PROVIDER || 'InternetArchiveProvider', tests }, null, 2)); console.log(JSON.stringify(tests, null, 2)); }
