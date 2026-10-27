import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.MOBILE_TEST_URL || 'http://127.0.0.1:8090';
await mkdir('artifacts/player-search', { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
// Isolate guest playback from Vite's timestamped AuthContext module instances.
await page.route('**/src/contexts/AuthContext.tsx*', route => route.fulfill({ contentType: 'application/javascript', body: `export function useAuth(){return {user:null,profile:null}} export function AuthProvider({children}){return children}` }));
await page.route('**/__player-gestures', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>(type)=>type; window.__vite_plugin_react_preamble_installed__=true; import '/src/index.css';</script><style>body{margin:0;background:#141414}</style></head><body><div id="test-root"></div></body></html>` }));
await page.route('**/__video.mp4', route => route.fulfill({ status: 200, body: '' }));
try {
  await page.goto(`${base}/__player-gestures`);
  await page.evaluate(async () => {
    localStorage.setItem('video-player-settings', JSON.stringify({ autoplay: false, ambientMode: true }));
    document.addEventListener('error', event => event.stopImmediatePropagation(), true);
    const source = await (await fetch('/src/components/video/MobileVideoPlayer.tsx')).text();
    const version = source.match(/react\.js\?v=([^"']+)/)[1];
    const { default: React } = await import(`/node_modules/.vite/deps/react.js?v=${version}`);
    const { default: { createRoot } } = await import(`/node_modules/.vite/deps/react-dom_client.js?v=${version}`);
    const { BrowserRouter } = await import(`/node_modules/.vite/deps/react-router-dom.js?v=${version}`);
    const { QueryClient, QueryClientProvider } = await import(`/node_modules/.vite/deps/@tanstack_react-query.js?v=${version}`);
    const { MobileVideoPlayer } = await import('/src/components/video/MobileVideoPlayer.tsx');
    const { AuthProvider } = await import('/src/contexts/AuthContext.tsx');
    createRoot(document.getElementById('test-root')).render(React.createElement(BrowserRouter, null, React.createElement(QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(AuthProvider, null, React.createElement(MobileVideoPlayer, { sources: [{ url: location.origin + '/__video.mp4', isM3U8: false }], isOffline: true, animeName: 'Mobile player fixture', episodeNumber: 1, episodeId: 'fixture', serverName: 'Offline', introWindow: { start: 100, end: 120 } })))));
  });
  await page.getByRole('button', { name: 'Lock player', exact: true }).waitFor();
  // Controlled media state isolates the gesture behavior from stream/network availability.
  await page.evaluate(() => {
    const video = document.querySelector('video');
    Object.defineProperty(video, 'duration', { configurable: true, value: 600 });
    video.currentTime = 200;
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('durationchange'));
    video.dispatchEvent(new Event('timeupdate'));
  });
  const touch = async (type, points, changed = points) => page.evaluate(({ type, points, changed }) => {
    const target = document.querySelector('video');
    const make = ([x, y], identifier) => new Touch({ identifier, target, clientX: x, clientY: y });
    target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: points.map(make), changedTouches: changed.map(make) }));
  }, { type, points, changed });
  const tap = async (x, y = 150) => { await touch('touchstart', [[x, y]]); await touch('touchend', [], [[x, y]]); };
  const time = () => page.locator('video').evaluate(video => video.currentTime);
  await page.evaluate(() => { const video = document.querySelector('video'); video.currentTime = 110; video.dispatchEvent(new Event('timeupdate')); });
  await tap(190);
  await page.waitForTimeout(350);
  assert.equal(await page.locator('.mobile-player-controls').count(), 0);
  await page.getByRole('button', { name: 'Skip Intro', exact: true }).click();
  assert.equal(await time(), 120);
  await tap(190);
  await page.waitForTimeout(350);
  await page.evaluate(() => { const video = document.querySelector('video'); video.currentTime = 200; video.dispatchEvent(new Event('timeupdate')); });
  await page.getByRole('button', { name: 'Lock player', exact: true }).click();
  await page.getByRole('button', { name: 'Unlock player', exact: true }).waitFor({ state: 'hidden' });
  await tap(30); await tap(30); await tap(360); await tap(360);
  assert.equal(await time(), 200, 'Locked taps must never seek');
  await page.getByRole('button', { name: 'Unlock player', exact: true }).click();
  await tap(30); await tap(360);
  await page.waitForTimeout(350);
  assert.equal(await time(), 200, 'Opposite-side taps must never seek');
  await tap(30); await tap(30);
  assert.equal(await time(), 190, 'Same-side double tap rewinds ten seconds');
  await touch('touchstart', [[120, 150], [220, 150]]);
  await touch('touchmove', [[70, 150], [270, 150]]);
  await touch('touchend', [], [[70, 150], [270, 150]]);
  assert.match(await page.locator('video').getAttribute('style'), /scale\(2\)/);
  assert.equal(await time(), 190, 'Pinching must never seek');
  await tap(190);
  await page.getByRole('button', { name: 'Reset video zoom' }).click();
  assert.match(await page.locator('video').getAttribute('style'), /scale\(1\)/);
  await page.getByRole('slider', { name: 'Seek video' }).focus();
  await page.keyboard.press('ArrowRight');
  assert.ok(await time() > 190, 'Seek slider supports keyboard input');
  const slider = await page.getByRole('slider', { name: 'Seek video' }).boundingBox();
  const input = await page.context().newCDPSession(page);
  const point = fraction => ({ x: slider.x + slider.width * fraction, y: slider.y + slider.height / 2 });
  await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(0.3)] });
  await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(0.5)] });
  await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(0.75)] });
  await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await input.detach();
  assert.ok(await time() > 400, 'Touch dragging commits the previewed seek position');
  for (const width of [320, 393, 480]) {
    await page.setViewportSize({ width, height: 852 });
    const boxes = await page.locator('.mobile-player-controls button, .mobile-player-seek').evaluateAll(buttons => buttons.map(button => {
      const r = button.getBoundingClientRect();
      return { label: button.getAttribute('aria-label'), x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    }));
    for (const box of boxes) assert.ok(box.width >= 44 && box.height >= (box.label === 'Seek video' ? 32 : 44) && box.x >= 0 && box.right <= width, JSON.stringify(box));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      assert.ok(!(a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y), `Controls overlap: ${JSON.stringify([a, b])}`);
    }
  }
  await page.screenshot({ path: '.artifacts/mobile-player-controls.png' });
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
  for (const size of [{ width: 568, height: 320 }, { width: 852, height: 393 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(size);
    const boxes = await page.locator('.mobile-player-controls button, .mobile-player-seek').evaluateAll(controls => controls.map(control => {
      const { x, y, right, bottom } = control.getBoundingClientRect();
      return { label: control.getAttribute('aria-label'), x, y, right, bottom };
    }));
    for (const box of boxes) assert.ok(box.x >= 0 && box.y >= 0 && box.right <= size.width && box.bottom <= size.height, JSON.stringify(box));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      assert.ok(!(a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y), `Fullscreen controls overlap: ${JSON.stringify([a, b])}`);
    }
    if (size.width === 852) await page.screenshot({ path: 'artifacts/player-search/player-mobile-landscape.png' });
  }
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await page.setViewportSize({ width: 393, height: 852 });
  // A real decoded MediaStream frame exercises the ambient canvas without an external server.
  await page.evaluate(async () => {
    const source = document.createElement('canvas');
    source.width = 160; source.height = 90;
    const ctx = source.getContext('2d');
    ctx.fillStyle = '#c04020'; ctx.fillRect(0, 0, 160, 90);
    window.ambientTestStream = source.captureStream(10);
    const video = document.querySelector('video');
    video.srcObject = window.ambientTestStream;
    await video.play();
  });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.mobile-player-ambient');
    const pixel = canvas?.getContext('2d').getImageData(0, 0, 1, 1).data;
    return pixel && pixel[0] > 100 && pixel[3] > 0;
  });
  await page.evaluate(() => { document.querySelector('video').pause(); window.ambientTestStream.getTracks().forEach(track => track.stop()); });
  assert.deepEqual(errors, []);
  await page.screenshot({ path: 'artifacts/player-search/player-mobile.png' });
  console.log('Mobile control spacing, portrait/landscape fullscreen, skip with hidden controls, lock auto-hide, locked seeking, same-side double tap, pinch zoom/reset, accessible scrubbing and ambient frame rendering pass in Chromium.');
} catch (error) {
  console.error('Player browser errors:', errors);
  console.error('Player page:', await page.locator('body').innerText());
  throw error;
} finally { await browser.close(); }
