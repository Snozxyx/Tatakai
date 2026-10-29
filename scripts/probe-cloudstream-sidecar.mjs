// Original CS3 execution against pinned upstream engine jars, in a fresh local directory.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { SkyStreamHost } = require('../desktop/runtime/compatibility/skystream.cjs');
const root = await fs.mkdtemp(path.resolve('.cache/extension-feasibility/cloudstream-sidecar-'));
const java = path.resolve('.cache/extension-feasibility/suwayomi/Suwayomi-Server-v2.4.2366-windows-x64/jre/bin/java.exe');
const host = new SkyStreamHost({ root, javaHost: { java, ready: async () => true } });
Object.defineProperty(host, 'directory', { value: path.resolve('.cache/extension-feasibility/skystream/packages/cs3_engine/assets/engine') });
host.ready = async () => true; // Research cache only; start still verifies every jar against the production lock.
const evidence = { recordedAt: new Date().toISOString(), platform: process.platform, tests: [] };
try {
  evidence.hello = await host.call('hello');
  const plugin = path.resolve('.cache/extension-feasibility/fixtures/DailymotionProvider.cs3');
  const loaded = await host.call('loadPlugin', { path: plugin });
  evidence.tests.push({ name: 'Original Dailymotion CS3 loaded in desktop host', status: 'demonstrated', providers: loaded.providers });
  const provider = loaded.providers[0].name;
  const search = await host.call('search', { provider, plugin, query: 'nature', page: 1 });
  evidence.tests.push({ name: 'Original provider search', status: 'demonstrated', keys: Object.keys(search), count: (search.items || search.results || []).length });
  for (const item of (search.items || []).slice(0, 3)) {
    try {
      const detail = await host.call('load', { provider, plugin, url: item.url });
      const data = detail.dataUrl || detail.episodes?.[0]?.data;
      if (!data) throw Error('Provider returned no playable entry');
      const links = await host.call('loadLinks', { provider, plugin, data, timeoutMs: 30000 });
      evidence.tests.push({ name: 'Original title/stream callbacks', status: links.links?.length ? 'demonstrated' : 'blocked', title: detail.name,
        completed: links.completed, error: links.error, streams: links.links?.map(l => ({ type: l.type, drm: !!l.drm, headers: Object.keys(l.headers || {}) })), subtitles: links.subtitles?.length });
    } catch (error) { evidence.tests.push({ name: 'Original title/stream callbacks', status: 'blocked', error: error.message }); }
  }
  await host.call('unloadPlugin', { path: plugin });
  const providers = await host.call('providers');
  if (providers.some(p => p.name === provider)) throw Error('Removed provider still registered');
  evidence.tests.push({ name: 'Original plugin unload', status: 'demonstrated' });
} catch (error) {
  evidence.tests.push({ name: 'Desktop original bytecode execution', status: 'blocked', error: error.message });
  process.exitCode = 1;
} finally {
  host.stop();
  await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
}
