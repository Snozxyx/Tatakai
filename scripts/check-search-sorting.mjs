import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.SEARCH_TEST_URL || 'http://127.0.0.1:8090';
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true });
const errors = [];
const requests = [];
page.on('pageerror', error => errors.push(error.message));
const anime = { anilistId: 201, titleRomaji: 'Zulu Anime', titleEnglish: 'Zulu Anime', format: 'TV', averageScore: 80, seasonYear: 2018, startDate: { year: 2018 }, genres: [], tags: [], studios: [], synonyms: [], isAdult: false };
const manga = { anilistId: 202, titleRomaji: 'Bravo Manga', titleEnglish: 'Bravo Manga', format: 'MANGA', averageScore: 90, startDate: { year: 2026 }, genres: [], isAdult: false };
const novel = { id: 203, title: { romaji: 'Alpha Novel', english: 'Alpha Novel' }, format: 'NOVEL', averageScore: 95, startDate: { year: 2023 }, genres: [], isAdult: false };
const pageInfo = { currentPage: 1, lastPage: 1, total: 1, hasNextPage: false };
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.pathname === '/__search-sorting') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>(type)=>type; window.__vite_plugin_react_preamble_installed__=true; import '/src/index.css';</script></head><body><div id="root"></div></body></html>` });
  if (url.pathname.endsWith('/content/search')) {
    requests.push({ kind: 'anime', sort: url.searchParams.get('sort'), format: url.searchParams.get('format') });
    // Match the backend: blank text without formats is not an anime browse request.
    const media = url.searchParams.has('q') || url.searchParams.has('format') ? [anime] : [];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { media, pageInfo } }) });
  }
  if (url.pathname.endsWith('/manga/search')) {
    requests.push({ kind: 'manga', sort: url.searchParams.get('sort'), mode: url.searchParams.get('mode') });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [manga], meta: pageInfo }) });
  }
  if (url.pathname.includes('graphql')) {
    const body = route.request().postDataJSON();
    const isNovel = body?.query?.includes('NovelSearch');
    if (isNovel) requests.push({ kind: 'novel', sort: body.variables.sort[0] });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { GenreCollection: [], MediaTagCollection: [], Page: { pageInfo, media: isNovel ? [novel] : [] } } }) });
  }
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [], results: [], meta: pageInfo }) });
  return route.continue();
});

try {
  await page.goto(`${base}/__search-sorting`);
  await page.evaluate(async () => {
    const source = await (await fetch('/src/pages/base/SearchPage.tsx')).text();
    const reactPath = source.match(/["']([^"']*\/react\.js\?v=[^"']*)["']/)[1];
    const depsBase = reactPath.slice(0, reactPath.lastIndexOf('/'));
    const version = new URL(reactPath, location.origin).searchParams.get('v');
    const { default: React } = await import(reactPath);
    const { default: { createRoot } } = await import(`${depsBase}/react-dom_client.js?v=${version}`);
    const { BrowserRouter } = await import(`${depsBase}/react-router-dom.js?v=${version}`);
    const { QueryClient, QueryClientProvider } = await import(`${depsBase}/@tanstack_react-query.js?v=${version}`);
    const settingsSource = await (await fetch('/src/hooks/media/useVideoSettings.ts')).text();
    const authPath = settingsSource.match(/["'](\/src\/contexts\/AuthContext\.tsx[^"']*)["']/)[1];
    const navSource = await (await fetch('/src/components/layout/MobileNav.tsx')).text();
    const settingsPath = navSource.match(/["'](\/src\/contexts\/SettingsModalContext\.tsx[^"']*)["']/)[1];
    const { AuthProvider } = await import(authPath);
    const { SettingsModalProvider } = await import(settingsPath);
    const { default: SearchPage } = await import('/src/pages/base/SearchPage.tsx');
    createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter, null,
      React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        React.createElement(AuthProvider, null, React.createElement(SettingsModalProvider, null, React.createElement(SearchPage))))));
  });

  const names = ['Zulu Anime', 'Bravo Manga', 'Alpha Novel'];
  for (const [label, sort, order] of [
    ['Top rated', 'SCORE_DESC', ['Alpha Novel', 'Bravo Manga', 'Zulu Anime']],
    ['Newest', 'START_DATE_DESC', ['Bravo Manga', 'Alpha Novel', 'Zulu Anime']],
    ['A–Z', 'TITLE_ROMAJI', ['Alpha Novel', 'Bravo Manga', 'Zulu Anime']],
  ]) {
    await page.getByRole('tab', { name: label, exact: true }).tap();
    for (const name of names) await page.getByText(name, { exact: true }).first().waitFor({ state: 'visible', timeout: 5000 });
    for (const kind of ['anime', 'manga', 'novel']) {
      assert.equal(requests.filter(request => request.kind === kind).at(-1)?.sort, sort, `${label} applies the sort to ${kind}`);
    }
    const titles = await page.evaluate(names => [...new Set(Array.from(document.querySelectorAll('main *'))
      .filter(element => !element.children.length && names.includes(element.textContent))
      .map(element => element.textContent))], names);
    assert.deepEqual(titles, order, `${label} orders mixed media results`);
  }
  await page.getByRole('button', { name: 'Anime', exact: true }).tap();
  await page.getByText('Zulu Anime', { exact: true }).first().waitFor({ state: 'visible' });
  assert.equal(await page.getByText('Bravo Manga', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Alpha Novel', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Manga', exact: true }).tap();
  await page.getByText('Bravo Manga', { exact: true }).first().waitFor({ state: 'visible' });
  assert.equal(await page.getByText('Zulu Anime', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Alpha Novel', { exact: true }).count(), 0);
  assert.deepEqual(errors, [], 'sorted browsing must not raise browser errors');
  console.log('Top rated, Newest and A–Z load and order anime, manga and novels, and respect media tabs in Chromium.');
} catch (error) {
  console.error(errors, requests);
  throw error;
} finally {
  await browser.close();
}
