import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.MOBILE_TEST_URL || 'http://127.0.0.1:8090';
await mkdir('artifacts/player-search', { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let fetched = 0;
await page.route('https://api.aniskip.com/**', route => {
  fetched++;
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ found: true, results: [
    { interval: { startTime: 0, endTime: 100 }, skipType: 'op', skipId: 'op', episodeLength: 600 },
    { interval: { startTime: 500, endTime: 580 }, skipType: 'ed', skipId: 'ed', episodeLength: 600 },
  ] }) });
});
await page.route('**/__desktop-skip', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>(type)=>type; window.__vite_plugin_react_preamble_installed__=true; import '/src/index.css';</script></head><body><div id="root"></div></body></html>` }));
try {
  await page.goto(`${base}/__desktop-skip`);
  await page.evaluate(async () => {
    localStorage.setItem('video-player-settings', JSON.stringify({ autoplay: false, autoSkipIntro: false }));
    const source = await (await fetch('/src/components/video/VideoPlayer.tsx')).text();
    const version = source.match(/react\.js\?v=([^"']+)/)[1];
    const { default: React } = await import(`/node_modules/.vite/deps/react.js?v=${version}`);
    const { default: { createRoot } } = await import(`/node_modules/.vite/deps/react-dom_client.js?v=${version}`);
    const { BrowserRouter } = await import(`/node_modules/.vite/deps/react-router-dom.js?v=${version}`);
    const { QueryClient, QueryClientProvider } = await import(`/node_modules/.vite/deps/@tanstack_react-query.js?v=${version}`);
    const { AuthProvider } = await import('/src/contexts/AuthContext.tsx');
    const { VideoPlayer } = await import('/src/components/video/VideoPlayer.tsx');
    createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter, null, React.createElement(QueryClientProvider, { client: new QueryClient() }, React.createElement(AuthProvider, null, React.createElement(VideoPlayer, { sources: [], isOffline: true, malId: 25, episodeNumber: 1, introWindow: { start: 0, end: 90 } })))));
  });
  await page.locator('video').waitFor({ state: 'attached' });
  const timingsResponse = page.waitForResponse('https://api.aniskip.com/**');
  await page.evaluate(() => {
    const video = document.querySelector('video');
    Object.defineProperty(video, 'duration', { configurable: true, value: 600 });
    video.currentTime = 30;
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('timeupdate'));
  });
  await page.getByRole('button', { name: 'Skip Intro', exact: true }).click();
  assert.equal(await page.locator('video').evaluate(video => video.currentTime), 90);
  await timingsResponse;
  assert.ok(fetched > 0, 'Metadata must fetch fallback timings even when a source intro exists');
  await page.evaluate(() => {
    const video = document.querySelector('video');
    video.currentTime = 520; video.dispatchEvent(new Event('timeupdate'));
    document.querySelector('.video-player-container').classList.add('is-player-fullscreen');
  });
  const outro = page.getByRole('button', { name: 'Skip Outro', exact: true });
  await outro.waitFor();
  assert.ok(await outro.evaluate(button => {
    const r = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  }), 'Fullscreen controls must not cover the skip button');
  await outro.click();
  assert.equal(await page.locator('video').evaluate(video => video.currentTime), 580);
  const slider = page.getByRole('slider', { name: 'Seek video' });
  const box = await slider.boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 10 });
  assert.equal(await page.locator('video').evaluate(video => video.currentTime), 580, 'Drag previews do not seek until released');
  await page.mouse.up();
  assert.ok(await page.locator('video').evaluate(video => video.currentTime > 300 && video.currentTime < 400));
  await slider.focus(); await page.keyboard.press('Home');
  assert.equal(await page.locator('video').evaluate(video => video.currentTime), 0);
  await page.screenshot({ path: 'artifacts/player-search/player-desktop.png' });
  assert.deepEqual(errors, []);
  console.log('Desktop metadata fetching, source intro precedence, fallback outro seeking and fullscreen skip hit target pass in Chromium.');
} catch (error) { console.error(errors); throw error; } finally { await browser.close(); }
