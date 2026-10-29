// Validate packaged bytes and launch their local runtimes from Electron's ASAR loader.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright';
const require = createRequire(import.meta.url), asar = require('@electron/asar');
const archive = path.resolve('.cache/compatibility-windows-package/win-unpacked/resources/app.asar');
const sourceRoot = path.resolve(process.env.PACKAGE_SOURCE_ROOT || '.');
const output = path.resolve('.cache/compatibility-package-fixture');
await fs.mkdir(output, { recursive: true });
const files = asar.listPackage(archive).map(name => name.replaceAll('\\', '/'));
assert(!files.some(name => name.includes('/.cache/')));
const sourceFiles = ['desktop/runtime/compatibility/bootstrap/compiled.json', 'desktop/runtime/compatibility/bootstrap/SuwayomiBootstrap.java',
  'desktop/runtime/compatibility/skystream-artifacts.json', 'desktop/runtime/compatibility/browser-preload.cjs', 'desktop/runtime/compatibility/browser.cjs',
  'desktop/runtime/compatibility/browser-files.cjs', 'desktop/runtime/compatibility/cloudstream.cjs', 'desktop/runtime/compatibility/suwayomi.cjs', 'desktop/runtime/compatibility/broker.cjs',
  'desktop/runtime/compatibility/mihon-repository.cjs', 'desktop/runtime/compatibility/aniyomi.cjs', 'desktop/runtime/compatibility/aniyomi-cookies.cjs',
  'desktop/runtime/compatibility/aniyomi-artifacts.json', 'desktop/runtime/compatibility/aniyomi-compiled.json',
  'desktop/ipc/ipc-compatibility.cjs', 'dist/index.html'];
for (const directory of ['shared/aniyomi/java', 'desktop/runtime/compatibility/aniyomi-java']) {
  for (const name of await fs.readdir(path.join(sourceRoot, directory), { recursive: true })) if (name.endsWith('.java')) sourceFiles.push(`${directory}/${name.replaceAll('\\', '/')}`);
}
for (const name of sourceFiles) assert(asar.extractFile(archive, path.normalize(name)).equals(await fs.readFile(path.join(sourceRoot, name))), `Stale packaged file: ${name}`);
// Every final renderer chunk must exist with identical bytes; catches stale modal builds.
for (const name of await fs.readdir(path.join(sourceRoot, 'dist/assets'))) if (/\.(js|css|wasm)$/.test(name)) {
  const relative = `dist/assets/${name}`;
  assert(asar.extractFile(archive, path.normalize(relative)).equals(await fs.readFile(path.join(sourceRoot, relative))), `Stale renderer asset: ${name}`);
}
// Detect concurrent-input corruption anywhere in the archive, including files
// outside the compatibility paths. Sizes alone cannot detect shifted offsets.
let integrityChecked = 0;
for (const name of files) {
  const relative = path.normalize(name.replace(/^[/\\]+/, ''));
  const stat = asar.statFile(archive, relative);
  if (!stat.integrity || stat.size === undefined) continue;
  assert.equal(createHash('sha256').update(asar.extractFile(archive, relative)).digest('hex'), stat.integrity.hash, `Corrupt archive entry: ${name}`);
  integrityChecked++;
}
assert((await fs.stat(archive + '.unpacked/desktop/runtime/compatibility/expand-runtime.ps1')).size > 0);
assert((await fs.readFile(archive + '.unpacked/desktop/runtime/compatibility/expand-runtime.ps1')).equals(await fs.readFile(path.join(sourceRoot, 'desktop/runtime/compatibility/expand-runtime.ps1'))), 'Stale packaged extraction helper');
const evidence = { recordedAt: new Date().toISOString(), platform: process.platform, archiveBytes: (await fs.stat(archive)).size, fileCount: files.length, checks: ['Current compatibility code/bootstrap/locks and final renderer assets match packaged bytes', 'Extraction helper is outside ASAR; research caches are excluded'] };
evidence.checks.push(`SHA-256 integrity verified for all ${integrityChecked} archived files`);
const installations = await Promise.all((await fs.readdir('.cache/extension-feasibility')).filter(name => name.startsWith('installation-')).map(async name => {
  const root = path.resolve('.cache/extension-feasibility', name);
  try { const value = JSON.parse(await fs.readFile(path.join(root, 'evidence.json'))); return value.checks.every(check => check.status === 'demonstrated') ? root : null; } catch { return null; }
}));
const prepared = installations.filter(Boolean).at(-1);
if (!prepared) throw Error('Run the production installation probe first');
const aniyomiEvidence = JSON.parse(await fs.readFile('.cache/extension-feasibility/aniyomi-runtime-evidence.json'));
assert(aniyomiEvidence.checks.length && aniyomiEvidence.checks.every(row => row.status === 'demonstrated'), 'Run the original Aniyomi runtime probe first');
const aniyomiRoot = await fs.mkdtemp(path.join(output, 'aniyomi-'));
const originalAnime = process.env.ANIYOMI_ANIZONE_FIXTURE;
if (originalAnime) {
  // Copy only the original APK and public package receipt from the isolated probe.
  const state = JSON.parse(await fs.readFile(path.join(originalAnime, 'state.json'), 'utf8'));
  const packages = Object.values(state.packages);
  assert.equal(packages.length, 1); const pkg = packages[0];
  assert.equal(pkg.pkgName, 'eu.kanade.tachiyomi.animeextension.all.anizone');
  assert.equal(pkg.digest, '12224d70262d7d028d609c41407b923cda684fc28c59ea59ced9cef0af03c07f');
  assert(/^[a-f0-9]{64}$/.test(pkg.id));
  const name = pkg.id + '.' + pkg.digest + '.apk';
  await fs.mkdir(path.join(aniyomiRoot, 'artifacts'));
  await fs.copyFile(path.join(originalAnime, 'artifacts', name), path.join(aniyomiRoot, 'artifacts', name));
  await fs.writeFile(path.join(aniyomiRoot, 'state.json'), JSON.stringify(state));
}
// A fresh private host prepares from the actual installation's offline assets.
const { pins } = require('../desktop/runtime/compatibility/aniyomi.cjs');
const bundledRoot = path.join(path.dirname(archive), 'compatibility-runtimes');
for (const pin of [pins.desktop, pins.verifier, { name: 'LICENSE', sha256: pins.licenseSha256 }]) {
  const bytes = await fs.readFile(path.join(bundledRoot, 'aniyomi', pins.desktop.sha256, pin.name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pin.sha256, 'Wrong bundled runtime bytes');
}
assert((await fs.readFile(path.join(bundledRoot, 'aniyomi', pins.desktop.sha256, 'SOURCE.txt'), 'utf8')).includes(pins.commit));
const assets = await fs.readdir('dist/assets');
let soraWorker;
for (const name of assets.filter(name => /^worker-.*\.js$/.test(name))) if ((await fs.readFile(path.join('dist/assets', name), 'utf8')).includes('original-sora-module.js')) soraWorker = name;
assert(soraWorker, 'No production Sora worker in the build');
await fs.writeFile(path.join(output, 'main.cjs'), `const{app,protocol,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(aniyomiRoot, 'browser-data'))});
const scheme=require(${JSON.stringify(path.join(archive, 'desktop/window/app-scheme.cjs'))});protocol.registerSchemesAsPrivileged([scheme.APP_SCHEME_PRIVILEGES]);
global.ready=app.whenReady().then(()=>{const{SuwayomiHost}=require(${JSON.stringify(path.join(archive, 'desktop/runtime/compatibility/suwayomi.cjs'))});const{SkyStreamHost}=require(${JSON.stringify(path.join(archive, 'desktop/runtime/compatibility/skystream.cjs'))});
let serve;scheme.registerAppScheme({handle:(_,handler)=>{serve=handler}},${JSON.stringify(path.join(archive, 'dist'))});protocol.handle(scheme.APP_SCHEME,request=>new URL(request.url).pathname==='/compatibility-probe.html'?new Response('<!doctype html><title>Local compatibility package probe</title>',{headers:{'Content-Type':'text/html'}}):serve(request));
const host=new SuwayomiHost(${JSON.stringify(path.join(prepared, 'mihon'))});const cloud=new SkyStreamHost({root:${JSON.stringify(path.join(prepared, 'cloudstream'))},javaHost:host});
const{AniyomiHost}=require(${JSON.stringify(path.join(archive, 'desktop/runtime/compatibility/aniyomi.cjs'))});
const{CompatibilityBrowser}=require(${JSON.stringify(path.join(archive, 'desktop/runtime/compatibility/browser.cjs'))});
const browser=new CompatibilityBrowser(undefined,{root:${JSON.stringify(path.join(aniyomiRoot, 'browser-files'))}});
const aniyomi=new AniyomiHost({root:${JSON.stringify(aniyomiRoot)},javaHost:host,bundledRoot:${JSON.stringify(bundledRoot)},bundledRequired:true,browser});
global.run=async()=>{await host.start();const graph=await host.graphql('{__typename}');const hello=await cloud.call('hello');const originalFetch=global.fetch;global.fetch=async()=>{throw Error('Unexpected runtime download')};try{await aniyomi.prepare()}finally{global.fetch=originalFetch}await aniyomi.start();const anime=await aniyomi.call({op:'ping',requestId:'packaged-aniyomi'});return{graphql:graph.__typename,engine:hello.engine,aniyomi:anime}};
global.originalAnime=async()=>{const source=(await aniyomi.request({op:'sources'}))[0];await aniyomi.request({op:'setEnabled',sourceId:source.id,enabled:true});const found=await aniyomi.request({op:'search',sourceId:source.id,query:'Naruto',page:1});const title=found.results[0];const detail=await aniyomi.request({op:'info',sourceId:source.id,id:title.id});const videos=await aniyomi.request({op:'resolve',sourceId:source.id,id:title.id,episodeId:detail.entries[0].id});return{episodes:detail.entries.length,streams:videos.sources.length,subtitles:videos.sources.reduce((n,s)=>n+(s.subtitles?.length||0),0)}};
global.renderer=async()=>{const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false}});await win.loadURL('app://tatakai.me/compatibility-probe.html');return win};
app.on('before-quit',()=>{aniyomi.stop();cloud.stop();host.stop();browser.stop()});});app.on('window-all-closed',()=>{});`);
let app;
try {
  app = await electron.launch({ args: [path.join(output, 'main.cjs')] });
  await app.evaluate(async () => { await global.ready; });
  const result = await app.evaluate(async () => global.run());
  assert(result.graphql); assert.equal(result.engine, '0.3.0');
  assert.equal(result.aniyomi, 'pong');
  evidence.checks.push('Packaged bootstrap starts the original Mihon host with authenticated GraphQL', 'Packaged CS3 host verifies its engine and completes the hello handshake');
  evidence.checks.push('Packaged Aniyomi host prepares verified original runtime bytes without a network download, verifies its Java bootstrap, then answers ping');
  if (originalAnime) {
    evidence.aniyomiOriginalAnime = await app.evaluate(async () => global.originalAnime());
    assert(evidence.aniyomiOriginalAnime.episodes > 0 && evidence.aniyomiOriginalAnime.streams > 0 && evidence.aniyomiOriginalAnime.subtitles > 0);
    evidence.checks.push('Unchanged original AniZone APK completes search, title/episode retrieval and stream/subtitle resolution through the packaged host with a fresh real Chromium cookie store');
  }
  await app.evaluate(async () => { global.fixtureWindow = await global.renderer(); });
  const renderer = await app.firstWindow();
  const guest = await renderer.evaluate(async workerFile => {
    async function run(code, method, profile, body) {
      const worker = new Worker(new URL('/assets/' + workerFile, location.href), { type: 'module' });
      try { return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Packaged Sora worker timed out')), 30000);
        worker.onerror = event => { clearTimeout(timer); reject(Error(event.message)); };
        worker.onmessage = ({ data }) => {
          if (data.type === 'http') return worker.postMessage({ type: 'http', id: data.id, result: { status: 200, headers: {}, body: body || JSON.stringify(['original-module', data.request.headers.Cookie]) } });
          clearTimeout(timer); data.type === 'error' ? reject(Error(data.error)) : resolve(data.result);
        };
        worker.postMessage({ type: 'run', code, method, args: [], profile });
      }); } finally { worker.terminate(); }
    }
    const sora = await run('async function searchResults(){if(typeof window!=="undefined"||typeof indexedDB!=="undefined"||typeof require!=="undefined")throw Error("Application capability leaked");const response=await fetchv2("https://source.test/fixture",{Cookie:"fixture-cookie"});return await response.json()}', 'searchResults');
    const mangayomi = await run('class DefaultExtension extends MProvider {async search(){if(typeof window!=="undefined"||typeof indexedDB!=="undefined"||typeof require!=="undefined")throw Error("Application capability leaked");const response=await new Client().get("https://source.test/fixture");return new Document(response.body).select("a").map(el=>({title:el.text,id:el.attr("href")}));}}', 'search', { family: 'mangayomi', context: { source: {}, preferences: {} } }, '<a href="opaque-雨">Original module 雨</a>');
    return { sora, mangayomi };
  }, soraWorker);
  assert.deepEqual(guest.sora, ['original-module', 'fixture-cookie']);
  assert.deepEqual(guest.mangayomi.value, [{ title: 'Original module 雨', id: 'opaque-雨' }]);
  evidence.checks.push('Packaged Sora WASM worker executes async HTTP callbacks on the production app:// origin without application globals');
  evidence.checks.push('Packaged Mangayomi provider, HTTP and detached CSS modules load on the production app:// origin without application globals');
} finally { await app?.close(); }
await fs.writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
