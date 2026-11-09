import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.SEARCH_TEST_URL || 'http://127.0.0.1:8090';
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/__search-input', route => route.fulfill({
  contentType: 'text/html',
  body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>(type)=>type; window.__vite_plugin_react_preamble_installed__=true; import '/src/index.css';</script></head><body><div id="root"></div></body></html>`,
}));
await page.route('**/content/search/suggestions**', route => route.fulfill({ contentType: 'application/json', body: '{"data":{"media":[]}}' }));
try {
  await page.goto(`${base}/__search-input`);
  await page.evaluate(async () => {
    const source = await (await fetch('/src/pages/base/SearchPage.tsx')).text();
    const reactPath = source.match(/["']([^"']*\/react\.js\?v=[^"']*)["']/)[1];
    const depsBase = reactPath.slice(0, reactPath.lastIndexOf('/'));
    const version = new URL(reactPath, location.origin).searchParams.get('v');
    const { default: React } = await import(reactPath);
    const { default: { createRoot } } = await import(`${depsBase}/react-dom_client.js?v=${version}`);
    const { BrowserRouter, useNavigate } = await import(`${depsBase}/react-router-dom.js?v=${version}`);
    const { QueryClient, QueryClientProvider } = await import(`${depsBase}/@tanstack_react-query.js?v=${version}`);
    const settingsSource = await (await fetch('/src/hooks/media/useVideoSettings.ts')).text();
    const authPath = settingsSource.match(/["'](\/src\/contexts\/AuthContext\.tsx[^"']*)["']/)[1];
    const navSource = await (await fetch('/src/components/layout/MobileNav.tsx')).text();
    const settingsPath = navSource.match(/["'](\/src\/contexts\/SettingsModalContext\.tsx[^"']*)["']/)[1];
    const { AuthProvider } = await import(authPath);
    const { SettingsModalProvider } = await import(settingsPath);
    const { contentGraph } = await import('/src/core/index.ts');
    window.searchRequests = [];
    contentGraph.search = async filters => {
      window.searchRequests.push(filters);
      return { media: [], pageInfo: { currentPage: 1, lastPage: 1, hasNextPage: false, total: 0 } };
    };
    const { default: SearchPage } = await import('/src/pages/base/SearchPage.tsx');
    function SearchFixture() {
      window.navigateSearch = useNavigate();
      return React.createElement(SearchPage);
    }
    createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter, null,
      React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        React.createElement(AuthProvider, null, React.createElement(SettingsModalProvider, null, React.createElement(SearchFixture))))));
  });
  const input = page.locator('#tatakai-search-page-input');
  await input.waitFor({ state: 'visible' });
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const submit = input.locator('xpath=ancestor::form').locator('button[type="submit"]');

  await input.pressSequentially('em');
  assert.equal(await input.inputValue(), 'em', 'typing e then m must retain the exact draft');
  await input.evaluate(element => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setValue.call(element, 'Eminence in Shadow');
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'Eminence in Shadow', inputType: 'insertCompositionText', isComposing: true }));
  });
  await settle();
  assert.equal(await input.inputValue(), 'Eminence in Shadow', 'composition updates must survive React renders');
  await submit.tap();
  await page.waitForURL('**/search?q=Eminence%20in%20Shadow');

  // Samsung IME/paste can update the field before React receives its change
  // notification. Submit must use the displayed value in that interval.
  await input.evaluate(element => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, '  Frieren: Beyond Journey’s End  ');
  });
  await submit.tap();
  await settle();
  assert.equal(new URL(page.url()).searchParams.get('q'), 'Frieren: Beyond Journey’s End', 'search must submit the latest native field value');
  await page.waitForFunction(() => window.searchRequests.some(filters => Object.values(filters).includes('Frieren: Beyond Journey’s End')));

  await input.fill('Naruto');
  await input.press('Enter');
  await page.waitForURL('**/search?q=Naruto');
  assert.equal(await input.inputValue(), 'Naruto');
  await input.evaluate(element => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, 'Naruto Shippuden');
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', isComposing: true }));
  });
  await page.evaluate(() => window.navigateSearch('/search?q=Naruto&type=anime'));
  await settle();
  assert.equal(await input.inputValue(), 'Naruto Shippuden', 'a filter change must not overwrite the keyboard draft');
  await input.evaluate(element => element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'Naruto Shippuden' })));
  await submit.tap();
  await page.waitForURL('**/search?q=Naruto%20Shippuden');

  await page.evaluate(() => window.navigateSearch('/search?q=One%20Piece'));
  await settle();
  assert.equal(await input.inputValue(), 'One Piece', 'navigation synchronizes the visible query');
  await input.locator('xpath=ancestor::form').locator('button[type="button"]').first().tap();
  await page.waitForURL('**/search');
  assert.equal(await input.inputValue(), '', 'clearing search clears the native field and route');
  assert.deepEqual(errors, [], 'search must not raise browser errors');
  console.log('Mobile search typing, IME composition, native paste, tap/Enter submission, filter changes, navigation and clearing passed in Chromium.');
} catch (error) {
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
