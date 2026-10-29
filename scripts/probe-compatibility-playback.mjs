// Exercises real Tatakai playback adapters in Electron. CS3 media comes from the
// original-provider broker probe; the independent DASH sample proves transport only.
import { createServer } from 'vite';
import { _electron as electron } from 'playwright';
import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
const fixture = path.resolve('.cache/compatibility-playback-fixture');
await mkdir(fixture, { recursive: true });
const candidates = await Promise.all((await readdir('.cache/extension-feasibility')).filter(n => n.startsWith('cloudstream-broker-')).map(async name => {
  const file = path.resolve('.cache/extension-feasibility', name, 'resolved-stream.local.json');
  try { return { file, mtime: (await stat(file)).mtimeMs }; } catch { return null; }
}));
const latest = candidates.filter(Boolean).sort((a, b) => b.mtime - a.mtime)[0];
if (!latest) throw Error('Run the original CloudStream broker probe first');
const resolved = JSON.parse(await readFile(latest.file, 'utf8'));
const entry = `import { DirectAdapter } from '/src/core/player/DirectAdapter.ts';import { DashAdapter } from '/src/core/player/DashAdapter.ts';
let adapter;window.probe=async(source)=>{await adapter?.unload();const video=document.createElement('video');video.muted=true;video.autoplay=true;video.playsInline=true;document.querySelector('video').replaceWith(video);adapter=source.mode==='dash'?new DashAdapter():new DirectAdapter();await adapter.load({source,videoElement:video,autoPlay:true});};`;
await writeFile(path.join(fixture, 'entry.mjs'), entry);
await writeFile(path.join(fixture, 'index.html'), '<!doctype html><html><body><video muted autoplay playsinline></video><script type="module" src="/.cache/compatibility-playback-fixture/entry.mjs"></script></body></html>');
await writeFile(path.join(fixture, 'preload.cjs'), `const{contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('electron',{proxyExtensionSource:p=>ipcRenderer.invoke('proxy',p)});`);
const main = `const{app,BrowserWindow,ipcMain}=require('electron');app.setPath('userData',${JSON.stringify(path.join(fixture, 'user-data'))});const{LocalProxyServer}=require(${JSON.stringify(path.resolve('desktop/runtime/proxy/local-proxy-server.cjs'))});
const proxy=new LocalProxyServer({info(){},warn(){},error(){}});ipcMain.handle('proxy',async(_e,p)=>{const u=new URL(p.url);if(!['http:','https:'].includes(u.protocol))throw Error('Invalid URL');await proxy.ensureStarted();return proxy.registerSource(p)});
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');app.whenReady().then(()=>{global.win=new BrowserWindow({show:false,webPreferences:{preload:${JSON.stringify(path.join(fixture, 'preload.cjs'))},backgroundThrottling:false,contextIsolation:true,sandbox:true,nodeIntegration:false}});win.loadURL(process.env.PROBE_URL)});app.on('before-quit',()=>proxy.stop());`;
await writeFile(path.join(fixture, 'main.cjs'), main);
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: '.cache/compatibility-playback-vite', resolve: { alias: { '@': path.resolve('src') } },
  optimizeDeps: { entries: ['.cache/compatibility-playback-fixture/index.html'] }, server: { host: '127.0.0.1', port: 0, watch: { ignored: ['**/*'] } } });
await server.listen();
let app;
const evidence = [];
try {
  app = await electron.launch({ args: [path.join(fixture, 'main.cjs')], env: { ...process.env, PROBE_URL: `http://127.0.0.1:${server.httpServer.address().port}/.cache/compatibility-playback-fixture/index.html` } });
  const page = await app.firstWindow();
  await page.waitForFunction(() => typeof window.probe === 'function', { timeout: 120000 });
  const direct = await page.evaluate(async source => ({ ...source, url: await window.electron.proxyExtensionSource({ url: source.url, headers: source.headers }) }), resolved);
  for (const source of [{ ...direct, mode: 'direct', id: 'original-cs3' }, { mode: 'dash', id: 'dash-transport-sample', url: 'https://dash.akamaized.net/envivio/EnvivioDash3/manifest.mpd', headers: {} }]) {
    try {
      await page.evaluate(source => window.probe(source), source);
      await page.waitForFunction(() => { const v = document.querySelector('video'); return v.videoWidth > 0 && v.currentTime > 1 && v.readyState >= 2; }, { timeout: 90000 });
      evidence.push({ name: source.id, status: 'demonstrated', ...await page.locator('video').evaluate(v => ({ width: v.videoWidth, height: v.videoHeight, seconds: v.currentTime, frames: v.getVideoPlaybackQuality().totalVideoFrames })) });
    } catch (error) { evidence.push({ name: source.id, status: 'blocked', error: error.message.slice(0, 500), mediaError: await page.locator('video').evaluate(v => v.error?.message || null) }); process.exitCode = 1; }
  }
} finally {
  await app?.close(); server.httpServer?.closeAllConnections(); await server.close();
  await writeFile(path.join(fixture, 'evidence.json'), JSON.stringify({ recordedAt: new Date().toISOString(), evidence }, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
}
