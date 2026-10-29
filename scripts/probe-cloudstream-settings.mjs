// Original CNC Verse CS3 settings: fixture work only, no provider code substitution.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CloudStreamBroker } = require('../desktop/runtime/compatibility/cloudstream.cjs');
const { SkyStreamHost } = require('../desktop/runtime/compatibility/skystream.cjs');
const root = await fs.mkdtemp(path.resolve('.cache/extension-feasibility/cs3-settings-'));
const host = new SkyStreamHost({ root, javaHost: { ready: async () => true, java: path.resolve('.cache/extension-feasibility/suwayomi/Suwayomi-Server-v2.4.2366-windows-x64/jre/bin/java.exe') } });
Object.defineProperty(host, 'directory', { value: path.resolve('.cache/extension-feasibility/skystream/packages/cs3_engine/assets/engine') }); host.ready = async () => true;
const broker = new CloudStreamBroker({ root, host, proxy: async url => url });
const request = payload => broker.request({ requestId: crypto.randomUUID(), ...payload });
const evidence = [];
let reloads = 0;
const originalCall = host.call.bind(host);
host.call = async (...args) => { if (args[0] === 'reloadPlugin') reloads++; return originalCall(...args); };
try {
  const fixture = { commit: '6d2c7b376bd9803c05dc431e7df9b7335e9fece9', repo: 'NivinCNC/CNCVerse-Cloud-Stream-Extension' };
  await request({ op: 'addRepository', url: `https://raw.githubusercontent.com/${fixture.repo}/${fixture.commit}/CNC.json` });
  const original = broker.json.bind(broker);
  broker.json = async (url, signal) => {
    url = url.replace('/refs/heads/builds/', `/${fixture.commit}/`).replace('/builds/', `/${fixture.commit}/`);
    const data = await original(url, signal);
    if (Array.isArray(data)) for (const pkg of data) pkg.url = pkg.url.replace('/refs/heads/builds/', `/${fixture.commit}/`).replace('/builds/', `/${fixture.commit}/`);
    return data;
  };
  const pkg = (await request({ op: 'packages' })).find(p => p.internalName === 'CNC Verse');
  if (!pkg) throw Error('Pinned CNC Verse package missing');
  await fs.writeFile(path.join(root, 'fixture.json'), JSON.stringify({ ...fixture, package: pkg }));
  await request({ op: 'install', packageId: pkg.id });
  const [source] = await request({ op: 'sources' });
  if (!source.hasSettings) throw Error('Original plugin did not expose a settings screen');
  const { session } = await request({ op: 'settings', sourceId: source.id });
  const state = await request({ op: 'settingsState', sourceId: source.id, session });
  const nodes = [];
  const walk = node => { nodes.push(node); for (const child of node.children || []) walk(child); };
  for (const window of state.windows) walk(window.root);
  if (!nodes.length) throw Error('Original settings screen returned no controls');
  evidence.push({ name: 'Original CS3 settings screen opened through production broker', status: 'demonstrated', controls: nodes.map(n => ({ id: n.id, kind: n.kind, input: n.input, tappable: n.tappable })) });
  const checkbox = nodes.find(node => node.kind === 'checkbox');
  if (!checkbox) throw Error('Representative settings screen has no checkbox');
  await request({ op: 'settingsAction', sourceId: source.id, session, node: checkbox.id, action: 'check', value: !checkbox.checked });
  const changedNodes = [];
  const scan = node => { changedNodes.push(node); for (const child of node.children || []) scan(child); };
  for (let attempt = 0; attempt < 20; attempt++) {
    const changed = await request({ op: 'settingsState', sourceId: source.id, session });
    changedNodes.length = 0; for (const window of changed.windows) scan(window.root);
    if (changedNodes.find(node => node.id === checkbox.id)?.checked === !checkbox.checked) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (changedNodes.find(node => node.id === checkbox.id)?.checked !== !checkbox.checked) throw Error('Original setting did not change');
  // Restore the test value before saving, so the isolated fixture's defaults remain reproducible.
  await request({ op: 'settingsAction', sourceId: source.id, session, node: checkbox.id, action: 'check', value: checkbox.checked });
  evidence.push({ name: 'Original CS3 checkbox changed and restored through native callbacks', status: 'demonstrated' });
  const save = nodes.find(node => /save settings/i.test(node.label || node.text || ''));
  if (!save) throw Error('Original settings screen has no save action');
  await request({ op: 'settingsAction', sourceId: source.id, session, node: save.id, action: 'click' });
  let yes;
  for (let attempt = 0; attempt < 30; attempt++) {
    const next = await request({ op: 'settingsState', sourceId: source.id, session });
    changedNodes.length = 0; for (const window of next.windows) scan(window.root);
    yes = changedNodes.find(node => node.text === 'Yes');
    if (yes) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!yes) throw Error('Original restart confirmation did not appear');
  await request({ op: 'settingsAction', sourceId: source.id, session, node: yes.id, action: 'click' });
  for (let attempt = 0; attempt < 50 && (!reloads || broker.reloads.size); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
  const refreshed = await request({ op: 'sources' });
  if (!reloads || !refreshed.some(s => s.id === source.id)) throw Error('Extension-requested restart did not restore the provider registry');
  evidence.push({ name: 'Original save/restart action reloads the plugin and restores source identity', status: 'demonstrated', reloads });
} catch (error) { evidence.push({ name: 'Original settings screen', status: 'blocked', error: error.message }); process.exitCode = 1; }
finally { broker.stop(); await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify({ recordedAt: new Date().toISOString(), evidence }, null, 2)); console.log(JSON.stringify(evidence, null, 2)); }
