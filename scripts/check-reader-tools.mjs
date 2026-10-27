import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.MOBILE_TEST_URL || 'http://127.0.0.1:8090';
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/src/hooks/api/useMangaData.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `const chapters={mappedChapters:[{canonicalOrder:0,chapterNumber:1,sources:[]}]};const detail={detail:{title:{english:'Reader fixture'},canonicalTitle:'Reader fixture'}};export const useMangaChapters=()=>({data:chapters});export const useMangaDetail=()=>({data:detail});` }));
await page.route('**/__reader/fixture*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>(type)=>type; window.__vite_plugin_react_preamble_installed__=true; import '/src/index.css';</script><style>body{margin:0}</style></head><body><div id="root"></div></body></html>` }));
try {
  await page.goto(`${base}/__reader/fixture?chapterKey=ch1&chapterNumber=1`);
  await page.evaluate(async () => {
    window.electron = { setFullscreen: async () => {} };
    localStorage.setItem('reader-settings', JSON.stringify({ continuousScroll: false, showComments: false, preloading: 'none', readingMode: 'vertical' }));
    const source = await (await fetch('/src/pages/manga/MangaReaderPage.tsx')).text();
    const version = source.match(/react\.js\?v=([^"']+)/)[1];
    const { default: React } = await import(`/node_modules/.vite/deps/react.js?v=${version}`);
    const { default: { createRoot } } = await import(`/node_modules/.vite/deps/react-dom_client.js?v=${version}`);
    const { BrowserRouter, Routes, Route } = await import(`/node_modules/.vite/deps/react-router-dom.js?v=${version}`);
    const { QueryClient, QueryClientProvider } = await import(`/node_modules/.vite/deps/@tanstack_react-query.js?v=${version}`);
    const { AuthProvider } = await import('/src/contexts/AuthContext.tsx');
    const { default: Reader } = await import('/src/pages/manga/MangaReaderPage.tsx');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const svg = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700"><rect width="400" height="700" fill="#282238"/><text x="40" y="100" fill="white" font-size="32">Reader page fixture</text></svg>')}`;
    client.setQueryData(['manga-read', 'fixture', 'ch1', '', '', '', 0], { success: true, data: { pages: Array.from({ length: 5 }, (_, pageNumber) => ({ pageNumber, imageUrl: svg, width: 400, height: 700 })), chapter: { number: 1, chapterKey: 'ch1', provider: '', title: 'Chapter 1' } } });
    createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter, null, React.createElement(QueryClientProvider, { client }, React.createElement(AuthProvider, null, React.createElement(Routes, null, React.createElement(Route, { path: '/__reader/:mangaId', element: React.createElement(Reader) }))))));
  });
  await page.getByRole('button', { name: 'Reading tools', exact: true }).click();
  await page.getByRole('slider', { name: 'Jump to page' }).fill('3');
  await page.waitForFunction(() => document.querySelector('[data-reader-scroll]').scrollTop > 500);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  assert.match(await page.getByRole('button', { name: 'Reset reader zoom' }).innerText(), /110%/);
  await page.getByRole('button', { name: 'Reset reader zoom' }).click();
  const currentPage = await page.getByRole('slider', { name: 'Jump to page' }).inputValue();
  await page.getByRole('button', { name: 'Page by page', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Page by page' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('slider', { name: 'Jump to page' }).inputValue(), currentPage, 'Changing mode preserves the current page');
  await page.getByRole('slider', { name: 'Jump to page' }).fill('2');
  await page.getByRole('button', { name: 'Webtoon scroll', exact: true }).click();
  await page.getByRole('button', { name: 'Auto-scroll', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Pause auto-scroll' }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Pause auto-scroll' }).click();
  await page.screenshot({ path: '.artifacts/reader-tools.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await page.locator('[data-reader-fullscreen=true]').waitFor();
  assert.equal(await page.locator('.reader-tools button').count(), 1);
  assert.equal(await page.locator('.reader-topbar').count(), 0);
  await page.waitForFunction(() => document.querySelector('.reader-tools').classList.contains('opacity-0'));
  await page.mouse.move(100, 200);
  await page.waitForFunction(() => document.querySelector('.reader-tools').classList.contains('opacity-100'));
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  assert.equal(await page.locator('.reader-topbar').count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('app-fullscreen')), false);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await page.locator('[data-reader-scroll]').dblclick({ position: { x: 100, y: 200 } });
  assert.equal(await page.locator('[data-reader-fullscreen=true]').count(), 0);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-reader-fullscreen=true]').count(), 0);
  await page.evaluate(() => { delete window.electron; });
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await page.waitForFunction(() => document.fullscreenElement !== null);
  assert.equal(await page.locator('.reader-tools button').count(), 1);
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await page.waitForFunction(() => document.fullscreenElement === null);
  // Both the page counter/title and the list button must open the navigator on
  // touch screens, including short landscape viewports.
  for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    const triggers = page.locator('.reader-topbar button[aria-label="Open chapter and provider navigator"]');
    assert.equal(await triggers.count(), 2);
    for (let index = 0; index < 2; index++) {
      await triggers.nth(index).tap();
      const sheet = page.getByRole('dialog');
      await sheet.waitFor({ state: 'visible' });
      await page.waitForTimeout(350);
      const bounds = await sheet.boundingBox();
      assert(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1, 'navigator fits viewport');
      const seek = sheet.getByRole('slider', { name: 'Jump to page' });
      await seek.fill('4');
      assert(await seek.isVisible(), 'page seek stays accessible');
      if (index === 0) await page.screenshot({ path: `.artifacts/reader-navigation-${viewport.width}.png` });
      await page.keyboard.press('Escape');
      await sheet.waitFor({ state: 'hidden' });
    }
  }
  // A burst of drag events should produce at most one jump per animation frame,
  // plus the final release. This used to do a layout read and jump on every move.
  const drag = await page.locator('.reader-page-rail-track').evaluate(track => {
    const root = document.querySelector('[data-reader-scroll]');
    const original = root.scrollTo;
    let jumps = 0;
    root.scrollTo = function (...args) { jumps++; return original.apply(this, args); };
    const rect = track.getBoundingClientRect();
    const send = (type, y) => track.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: rect.x + 10, clientY: y }));
    // Synthetic events have no active native pointer, so supply capture locally.
    const capture = track.setPointerCapture, has = track.hasPointerCapture, release = track.releasePointerCapture;
    track.setPointerCapture = () => {};
    track.hasPointerCapture = () => true;
    track.releasePointerCapture = () => {};
    send('pointerdown', rect.top + 1);
    for (let index = 0; index < 100; index++) send('pointermove', rect.top + rect.height * index / 100);
    send('pointerup', rect.bottom - 1);
    track.setPointerCapture = capture; track.hasPointerCapture = has; track.releasePointerCapture = release;
    root.scrollTo = original;
    return { jumps, finalOffset: root.scrollTop };
  });
  assert.equal(drag.jumps, 2, 'drag jumps once on press and once to the final released page');
  assert(drag.finalOffset > 500, 'release commits the final page');
  console.log('Touch navigator opens from both header targets at 320px, 390px, landscape and desktop; 100 drag moves produce', drag.jumps, 'page jumps.');
  assert.deepEqual(errors, []);
  console.log('Reader page navigation, zoom/reset, reading modes, auto-scroll and fullscreen-only exit control pass in Chromium with a simulated Electron bridge.');
} catch (error) { console.error(errors); throw error; } finally { await browser.close(); }
