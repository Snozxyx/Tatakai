import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.MOBILE_TEST_URL || 'http://127.0.0.1:8090';
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
const page = await browser.newPage({ viewport: { width: 852, height: 393 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/__player-test', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>(type)=>type; window.__vite_plugin_react_preamble_installed__=true; import '/src/index.css';</script><style>html{transform:translateX(5px)!important} #test-root{transform:translateX(37px)!important;filter:brightness(1);width:600px;margin:30px} body{margin:0}</style></head><body><div id="test-root"></div></body></html>` }));
await page.route('**/__video.mp4', route => route.fulfill({ status: 200, body: '' }));
try {
  await page.goto(`${base}/__player-test`);
  await page.evaluate(async () => {
    document.addEventListener('error', event => event.stopImmediatePropagation(), true);
    const source = await (await fetch('/src/components/video/MobileVideoPlayer.tsx')).text();
    const version = source.match(/react\.js\?v=([^"']+)/)[1];
    const { default: React } = await import(`/node_modules/.vite/deps/react.js?v=${version}`);
    const { default: { createRoot } } = await import(`/node_modules/.vite/deps/react-dom_client.js?v=${version}`);
    const { BrowserRouter } = await import(`/node_modules/.vite/deps/react-router-dom.js?v=${version}`);
    const { QueryClient, QueryClientProvider } = await import(`/node_modules/.vite/deps/@tanstack_react-query.js?v=${version}`);
    const { MobileVideoPlayer } = await import('/src/components/video/MobileVideoPlayer.tsx');
    const { AuthProvider } = await import('/src/contexts/AuthContext.tsx');
    window.testRoot = createRoot(document.getElementById('test-root'));
    window.testRoot.render(React.createElement(BrowserRouter, null, React.createElement(QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(AuthProvider, null, React.createElement(MobileVideoPlayer, { sources: [{ url: location.origin + '/__video.mp4', isM3U8: false }], isOffline: true, animeName: 'Fullscreen layout fixture', episodeTitle: 'Landscape', introWindow: { start: 0, end: 90 } })))));
  });
  try { await page.getByRole('button', { name: 'Enter fullscreen' }).click(); }
  catch (error) { console.error(errors, await page.locator('body').innerText()); throw error; }
  for (const size of [{ width: 852, height: 393 }, { width: 932, height: 430 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(size);
    await page.waitForFunction(() => Math.abs(document.querySelector('.is-player-fullscreen').getBoundingClientRect().width - visualViewport.width) < 1);
    const measurements = await page.evaluate(() => {
      const player = document.querySelector('.is-player-fullscreen').getBoundingClientRect();
      const viewport = visualViewport;
      const controls = [...document.querySelectorAll('.is-player-fullscreen button')].map(button => ({ name: button.getAttribute('aria-label') || button.textContent, left: button.getBoundingClientRect().left, right: button.getBoundingClientRect().right }));
      return { player: { left: player.left, right: player.right, height: player.height }, width: viewport.width, height: viewport.height, controls };
    });
    assert.ok(Math.abs(measurements.player.left) < 1, JSON.stringify(measurements));
    assert.ok(Math.abs(measurements.player.right - measurements.width) < 1, JSON.stringify(measurements));
    assert.ok(Math.abs(measurements.player.height - measurements.height) < 1, JSON.stringify(measurements));
    for (const control of measurements.controls) assert.ok(control.left >= -1 && control.right <= measurements.width + 1, JSON.stringify(control));
  }
  await page.getByRole('button', { name: 'Exit fullscreen' }).click();
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).transform), 'matrix(1, 0, 0, 1, 5, 0)');
  assert.equal(await page.evaluate(() => document.getElementById('test-root').style.getPropertyValue('transform')), '');
  assert.deepEqual(errors, []);
  console.log('Player fits landscape and portrait viewports; controls remain visible; ancestor styles and scroll restore on exit.');
} finally { await browser.close(); }
