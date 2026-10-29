// Exercises production preparation/extraction and fresh launch, in isolated data.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const require = createRequire(import.meta.url);
const { SuwayomiHost } = require('../desktop/runtime/compatibility/suwayomi.cjs');
const { SkyStreamHost, artifacts } = require('../desktop/runtime/compatibility/skystream.cjs');
const root = process.env.COMPATIBILITY_INSTALL_ROOT || await fs.mkdtemp(path.resolve('.cache/extension-feasibility/installation-'));
const host = new SuwayomiHost(path.join(root, 'mihon'));
const cloud = new SkyStreamHost({ root: path.join(root, 'cloudstream'), javaHost: host });
const evidence = { platform: process.platform, arch: process.arch, recordedAt: new Date().toISOString(), runtime: host.runtime, engineCommit: artifacts.commit, checks: [] };
const archiveWasCached = !!await fs.stat(path.join(root, 'mihon', `runtime-${host.runtime.name}.zip`)).catch(() => null);
evidence.archiveWasCached = archiveWasCached;
evidence.preparation = [];
let previousPhase;
const preparationTimer = setInterval(() => {
  const current = host.preparation;
  if (!current) return;
  const phase = current.stage + ':' + Math.floor((current.receivedBytes || 0) / (16 * 1024 * 1024));
  if (phase !== previousPhase) { evidence.preparation.push({ ...current }); previousPhase = phase; }
}, 100);
const step = async (name, work) => {
  const started = performance.now();
  try { const details = await work(); evidence.checks.push({ name, status: 'demonstrated', milliseconds: Math.round(performance.now() - started), ...details }); }
  catch (error) { evidence.checks.push({ name, status: 'blocked', error: error.message }); throw error; }
  console.log(name);
};
try {
  await step(archiveWasCached ? 'Cached official archive SHA verification, extraction and activation' : 'Production archive download, SHA verification, extraction and activation', async () => { await host.prepare(); if (!await host.ready()) throw Error('Runtime not ready'); });
  await step('Prepared original Mihon host starts with private bootstrap and authenticated GraphQL', async () => {
    await host.start(); const value = await host.graphql('{__typename}'); if (!value.__typename) throw Error('No GraphQL response');
  });
  await step('Production CS3 engine artifacts download, verify and launch', async () => { await cloud.prepare(); const hello = await cloud.call('hello'); return { hello }; });
  if (process.platform === 'win32') await step('Windows process working sets (single idle snapshot; not peak memory)', async () => {
    const values = [];
    for (const [name, child] of [['mihon', host.child], ['cloudstream', cloud.child]]) {
      const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${Number(child.pid)}).WorkingSet64`], { windowsHide: true });
      values.push({ name, workingSetBytes: Number(stdout.trim()) });
    }
    return { processes: values };
  });
} catch { process.exitCode = 1; }
finally {
  clearInterval(preparationTimer);
  cloud.stop(); host.stop();
  await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ root, ...evidence }, null, 2));
}
