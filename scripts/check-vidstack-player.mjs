import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, _electron as electron } from 'playwright';

const base = process.env.PLAYER_TEST_URL || 'http://127.0.0.1:8090';
const fixtures = path.resolve('artifacts/search-playback/vidstack');
await mkdir(fixtures, { recursive: true });
const mp4 = path.join(fixtures, 'video.mp4');
const ffmpeg = args => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd: fixtures, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || String(result.error));
};
ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=15', '-t', '60', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
ffmpeg(['-i', mp4, '-c', 'copy', '-hls_time', '2', '-hls_list_size', '0', '-hls_segment_filename', path.join(fixtures, 'segment-%d.ts'), path.join(fixtures, 'manifest.m3u8')]);
ffmpeg(['-i', mp4, '-c', 'copy', '-f', 'dash', '-seg_duration', '2', 'manifest.mpd']);

const nativeElectron = process.env.VIDSTACK_ELECTRON_TEST === '1';
let browser;
let electronApp;
let page;
if (nativeElectron) {
  const preload = path.join(fixtures, 'fullscreen-preload.cjs');
  const main = path.join(fixtures, 'fullscreen-main.cjs');
  await writeFile(preload, `const {contextBridge,ipcRenderer}=require('electron'); contextBridge.exposeInMainWorld('electron', {
    setFullscreen: enabled => ipcRenderer.invoke('window:set-fullscreen', enabled),
    isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
    onFullscreenChanged: callback => { const handler=(_event,enabled)=>callback(enabled); ipcRenderer.on('window:fullscreen-changed',handler); return ()=>ipcRenderer.removeListener('window:fullscreen-changed',handler); },
    getTestFullscreenState: () => ipcRenderer.invoke('test:fullscreen-state')
  });`);
  await writeFile(main, `const {app,BrowserWindow,ipcMain}=require('electron');
    app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
    const requests=[]; let win;
    ipcMain.handle('window:set-fullscreen',(_event,enabled)=>{ requests.push(enabled); win.setFullScreen(enabled); return {success:true,fullscreen:win.isFullScreen()}; });
    ipcMain.handle('window:is-fullscreen',()=>({success:true,fullscreen:win.isFullScreen()}));
    ipcMain.handle('test:fullscreen-state',()=>({active:win.isFullScreen(),requests}));
    app.whenReady().then(()=>{ win=new BrowserWindow({show:false,frame:false,width:1100,height:800,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:require('path').join(__dirname,'fullscreen-preload.cjs')}});
      const changed=()=>win.webContents.send('window:fullscreen-changed',win.isFullScreen()); win.on('enter-full-screen',changed); win.on('leave-full-screen',changed); win.loadURL('about:blank'); });`);
  const electronEnv = { ...process.env };
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  electronApp = await electron.launch({ args: [main], env: electronEnv });
  page = await electronApp.firstWindow();
} else {
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
}
const errors = [];
const diagnostics = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('console', message => { if (message.type() === 'error') diagnostics.push(message.text()); });
page.on('requestfailed', request => { if (request.url().startsWith(base)) diagnostics.push({ url: request.url(), failure: request.failure() }); });
await page.route('**/__vidstack-test', route => route.fulfill({
  contentType: 'text/html',
  body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>(type)=>type; window.__vite_plugin_react_preamble_installed__=true; import '/src/index.css';</script><style>#settings-fixture{max-width:600px}#playback-fixture{width:100%;max-width:960px;margin:20px auto}#root{transform:translateX(17px)}</style></head><body><header data-titlebar>App title bar</header><aside data-sidebar>App navigation</aside><div id="root" data-main-layout></div></body></html>`,
}));
await page.route('**/__vidstack/**', async route => {
  const name = path.basename(new URL(route.request().url()).pathname);
  if (name === 'broken.mp4') return route.fulfill({ status: 404, contentType: 'video/mp4', body: 'Not found' });
  if (name === 'subtitles.vtt') return route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n\n00:00:00.000 --> 00:00:11.500\nFixture caption\n' });
  const buffer = await readFile(name.endsWith('.mp4') ? mp4 : path.join(fixtures, name));
  const contentType = name.endsWith('.mp4') ? 'video/mp4' : name.endsWith('.m3u8') ? 'application/x-mpegURL' : name.endsWith('.ts') ? 'video/mp2t' : name.endsWith('.mpd') ? 'application/dash+xml' : 'application/octet-stream';
  const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
  if (!range) return route.fulfill({ contentType, headers: { 'Accept-Ranges': 'bytes' }, body: buffer });
  const start = Number(range[1]);
  const end = range[2] ? Math.min(Number(range[2]), buffer.length - 1) : buffer.length - 1;
  return route.fulfill({ status: 206, contentType, headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${buffer.length}` }, body: buffer.subarray(start, end + 1) });
});

try {
  await page.goto(`${base}/__vidstack-test`);
  await page.evaluate(async () => {
    window.browserFullscreenRequests = 0;
    Element.prototype.requestFullscreen = async () => { window.browserFullscreenRequests++; throw new Error('Electron fullscreen must use the window bridge'); };
    if (!window.electron?.setFullscreen) {
      let active = false;
      const requests = [];
      const listeners = new Set();
      window.electron = {
        setFullscreen: async enabled => { active = enabled; requests.push(enabled); listeners.forEach(listener => listener(enabled)); return { success: true, fullscreen: enabled }; },
        isFullscreen: async () => ({ success: true, fullscreen: active }),
        onFullscreenChanged: callback => { listeners.add(callback); return () => listeners.delete(callback); },
        getTestFullscreenState: async () => ({ active, requests }),
      };
    }
    localStorage.setItem('video-player-settings', JSON.stringify({ autoplay: true, playerEngine: 'builtin', volume: 0.4, playbackSpeed: 1.25, subtitleLanguage: 'english' }));
    const source = await (await fetch('/src/components/video/VideoPlayer.tsx')).text();
    const reactPath = source.match(/["']([^"']*\/react\.js\?v=[^"']*)["']/)[1];
    const depsBase = reactPath.slice(0, reactPath.lastIndexOf('/'));
    const version = new URL(reactPath, location.origin).searchParams.get('v');
    const { default: React } = await import(reactPath);
    const { default: { createRoot } } = await import(`${depsBase}/react-dom_client.js?v=${version}`);
    const { BrowserRouter } = await import(`${depsBase}/react-router-dom.js?v=${version}`);
    const { QueryClient, QueryClientProvider } = await import(`${depsBase}/@tanstack_react-query.js?v=${version}`);
    const settingsSource = await (await fetch('/src/hooks/media/useVideoSettings.ts')).text();
    const authPath = settingsSource.match(/["'](\/src\/contexts\/AuthContext\.tsx[^"']*)["']/)[1];
    const { AuthProvider } = await import(authPath);
    const { VideoPlayer } = await import('/src/components/video/VideoPlayer.tsx');
    const { MobileVideoPlayer } = await import('/src/components/video/MobileVideoPlayer.tsx');
    const { VideoSettingsPanel } = await import('/src/components/video/VideoSettingsPanel.tsx');
    const { useVideoSettings } = await import('/src/hooks/media/useVideoSettings.ts');
    const { sourceAdapterRegistry } = await import('/src/core/player/SourceAdapterRegistry.ts');
    const { DirectAdapter } = await import('/src/core/player/DirectAdapter.ts');
    sourceAdapterRegistry.register('direct', new DirectAdapter());
    window.vidstackProgress = [];
    window.vidstackErrors = [];
    const onProgressUpdate = (time, duration, completed) => window.vidstackProgress.push({ time, duration, completed });
    const onError = error => window.vidstackErrors.push(error);
    function Fixture() {
      const [choice, setChoice] = React.useState({ name: 'server-a.mp4', episode: 'episode-1', mobile: false, advanced: false });
      const externalRef = React.useRef(null);
      const { updateSetting } = useVideoSettings();
      window.setVidstackSetting = updateSetting;
      window.switchVidstackServer = (name, episode = 'episode-1', mobile = false, advanced = false) => setChoice({ name, episode, mobile, advanced });
      const Player = choice.mobile ? MobileVideoPlayer : VideoPlayer;
      return React.createElement(React.Fragment, null,
        React.createElement('div', { id: 'settings-fixture' }, React.createElement(VideoSettingsPanel, { embedded: true, isOpen: true, onClose() {} })),
        React.createElement('div', { id: 'playback-fixture' }, React.createElement(Player, {
          sources: [{ url: `${location.origin}/__vidstack/${choice.name}`, isM3U8: choice.name.endsWith('.m3u8'), headers: { Cookie: 'fixture-token' } }],
          headers: { Referer: 'https://extension.test/' },
          subtitles: [{ lang: 'en', label: 'English', url: `${location.origin}/__vidstack/subtitles.vtt` }],
          animeId: 'fixture-anime', episodeId: choice.episode, animeName: 'Player test', serverName: choice.name,
          initialSeekSeconds: choice.episode === 'episode-1' ? 2 : 0, isLoading: true,
          externalRef: choice.advanced ? externalRef : undefined, onProgressUpdate, onError,
        })));
    }
    createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter, null,
      React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        React.createElement(AuthProvider, null, React.createElement(Fixture)))));
  });
  const selector = page.locator('#settings-fixture #player-engine');
  await selector.selectOption('vidstack');
  await page.waitForFunction(() => document.querySelector('.vidstack-player-container video')?.currentTime > 2.25);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('video-player-settings')).playerEngine), 'vidstack');
  assert.equal(await page.locator('.vidstack-player-container video').evaluate(video => video.volume), 0.4);
  assert.equal(await page.locator('.vidstack-player-container video').evaluate(video => video.playbackRate), 1.25);
  await page.waitForFunction(() => window.vidstackProgress.some(progress => progress.time > 2));
  await page.getByText('Fixture caption', { exact: true }).first().waitFor({ state: 'visible' });
  await page.locator('.vidstack-player-container').screenshot({ path: 'artifacts/search-playback/vidstack-desktop.png' });

  const enterFullscreen = page.locator('.vidstack-player-container .vds-fullscreen-button[aria-pressed="false"]');
  const exitFullscreen = page.locator('.vidstack-player-container .vds-fullscreen-button[aria-pressed="true"]');
  const clickFullscreen = locator => nativeElectron ? locator.evaluate(button => button.click()) : locator.click();
  const fullscreenVisibility = nativeElectron ? 'attached' : 'visible';
  await page.locator('.vidstack-player-container [data-media-player]').hover();
  await clickFullscreen(enterFullscreen);
  await page.waitForFunction(async () => document.documentElement.classList.contains('app-fullscreen') && (await window.electron.getTestFullscreenState()).active);
  await exitFullscreen.waitFor({ state: fullscreenVisibility });
  const geometry = await page.locator('.vidstack-player-container [data-media-player]').evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  assert.ok(Math.abs(geometry.left) < 1 && Math.abs(geometry.top) < 1 && Math.abs(geometry.width - geometry.viewportWidth) < 1 && Math.abs(geometry.height - geometry.viewportHeight) < 1, 'Electron fullscreen fills the viewport through transformed ancestors');
  assert.equal(await page.locator('[data-titlebar]').evaluate(element => getComputedStyle(element).display), 'none');
  assert.equal(await page.locator('[data-sidebar]').evaluate(element => getComputedStyle(element).display), 'none');
  await page.evaluate(() => window.switchVidstackServer('server-fullscreen.mp4'));
  await page.waitForFunction(() => document.querySelector('.vidstack-player-container video')?.currentSrc.endsWith('server-fullscreen.mp4'));
  await exitFullscreen.waitFor({ state: fullscreenVisibility });
  await page.locator('.vidstack-player-container').screenshot({ path: 'artifacts/search-playback/vidstack-fullscreen.png' });
  await page.locator('.vidstack-player-container [data-media-player]').hover();
  await clickFullscreen(exitFullscreen);
  await page.waitForFunction(async () => !document.documentElement.classList.contains('app-fullscreen') && !(await window.electron.getTestFullscreenState()).active);
  assert.equal(await page.locator('#root').evaluate(element => element.style.transform), '');
  assert.equal(await page.locator('#root').evaluate(element => getComputedStyle(element).transform), 'matrix(1, 0, 0, 1, 17, 0)');
  await clickFullscreen(enterFullscreen);
  await exitFullscreen.waitFor({ state: fullscreenVisibility });
  if (nativeElectron) await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  else await page.keyboard.press('Escape');
  await page.waitForFunction(async () => !document.documentElement.classList.contains('app-fullscreen') && !(await window.electron.getTestFullscreenState()).active);
  await clickFullscreen(enterFullscreen);
  await exitFullscreen.waitFor({ state: fullscreenVisibility });
  await page.evaluate(() => window.electron.setFullscreen(false));
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-fullscreen'));
  await enterFullscreen.waitFor({ state: fullscreenVisibility });
  assert.equal(await page.evaluate(() => window.browserFullscreenRequests), 0, 'Vidstack fullscreen requests never call the browser API in Electron');
  console.log('Fullscreen entry/exit, Escape, native exit notifications and server switching passed.');

  if (process.env.VIDSTACK_FULLSCREEN_ONLY === '1') {
    assert.deepEqual(errors, [], 'fullscreen must not raise browser errors');
    console.log(`Vidstack fullscreen checks passed in ${nativeElectron ? 'Electron' : 'Chromium with the Electron bridge'}.`);
  } else {
  const beforeSwitch = await page.locator('.vidstack-player-container video').evaluate(video => video.currentTime);
  await page.evaluate(() => window.switchVidstackServer('server-b.mp4'));
  await page.waitForFunction(() => {
    const video = document.querySelector('.vidstack-player-container video');
    return video?.currentSrc.endsWith('server-b.mp4') && video.readyState >= 3 && !video.paused && video.currentTime > 2.25;
  });
  const afterSwitch = await page.locator('.vidstack-player-container video').evaluate(video => video.currentTime);
  assert.ok(afterSwitch >= beforeSwitch - 0.2, `server switching preserves playback position (${beforeSwitch} to ${afterSwitch})`);

  for (const name of ['manifest.m3u8', 'manifest.mpd']) {
    const previousSrc = await page.locator('.vidstack-player-container video').evaluate(video => video.currentSrc);
    const manifest = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/__vidstack/${name}`), { timeout: 10000 });
    await page.evaluate(name => window.switchVidstackServer(name), name);
    await manifest;
    await page.waitForFunction(previousSrc => {
      const video = document.querySelector('.vidstack-player-container video');
      return video?.currentSrc !== previousSrc && video.readyState >= 3 && !video.paused && video.currentTime > 2.25;
    }, previousSrc);
    assert.equal(await page.locator('.vidstack-player-container [role="alert"]').count(), 0, `${name} plays without an error overlay`);
    console.log(`${name} playback passed.`);
  }

  await page.evaluate(() => window.switchVidstackServer('server-c.mp4', 'episode-2'));
  await page.waitForFunction(() => {
    const video = document.querySelector('.vidstack-player-container video');
    return video?.currentSrc.endsWith('server-c.mp4') && video.readyState >= 3 && !video.paused;
  });
  assert.ok(await page.locator('.vidstack-player-container video').evaluate(video => video.currentTime < 2), 'a different episode starts at its own position');

  await page.setViewportSize({ width: 393, height: 852 });
  await page.evaluate(() => window.switchVidstackServer('server-mobile.mp4', 'episode-2', true));
  await page.waitForFunction(() => { const video = document.querySelector('.vidstack-player-container video'); return video?.currentSrc.endsWith('server-mobile.mp4') && video.currentTime > 0.25; });
  assert.ok(await page.locator('.vidstack-player-container').evaluate(element => element.getBoundingClientRect().width <= 393), 'the alternative player fits the mobile viewport');
  await page.locator('.vidstack-player-container').screenshot({ path: 'artifacts/search-playback/vidstack-mobile.png' });

  await page.evaluate(() => window.switchVidstackServer('server-room.mp4', 'episode-2', false, true));
  await page.locator('.video-player-container').waitFor({ state: 'attached' });
  assert.equal(await page.locator('.vidstack-player-container').count(), 0, 'watch room synchronization retains the built-in player');
  await page.evaluate(() => window.switchVidstackServer('server-return.mp4', 'episode-2'));
  await page.waitForFunction(() => { const video = document.querySelector('.vidstack-player-container video'); return video?.currentSrc.endsWith('server-return.mp4') && video.currentTime > 0.25; });
  await page.evaluate(() => window.switchVidstackServer('broken.mp4', 'episode-2'));
  await page.locator('.vidstack-player-container [role="alert"]').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Use Tatakai player', exact: true }).click();
  await page.locator('.video-player-container').waitFor({ state: 'attached' });
  await page.evaluate(() => window.switchVidstackServer('server-recovered.mp4', 'episode-2'));
  await page.waitForFunction(() => { const video = document.querySelector('.vidstack-player-container video'); return video?.currentSrc.endsWith('server-recovered.mp4') && video.currentTime > 0.25; });
  assert.deepEqual(errors, [], 'Vidstack must not raise browser errors');
  assert.ok(await page.evaluate(() => window.vidstackErrors.some(error => error.reason === 'vidstack-playback-error')), 'playback failures reach the watch page');
  console.log(`Vidstack selection/persistence, real MP4/HLS/DASH playback, native fullscreen controls/Escape, progress, server/episode switching, mobile layout, room compatibility and error fallback passed in ${nativeElectron ? 'Electron' : 'Chromium with the Electron bridge'}.`);
  }
} catch (error) {
  console.error(errors);
  console.error(await page.evaluate(() => ({
    alerts: Array.from(document.querySelectorAll('[role="alert"]')).map(element => element.textContent),
    video: { src: document.querySelector('.vidstack-player-container video')?.currentSrc, error: document.querySelector('.vidstack-player-container video')?.error?.message },
    player: Array.from(document.querySelector('.vidstack-player-container [data-media-player]')?.attributes || []).map(attribute => [attribute.name, attribute.value]),
    errors: window.vidstackErrors,
  })));
  console.error(diagnostics);
  throw error;
} finally {
  if (electronApp) await electronApp.close();
  else await browser.close();
}
