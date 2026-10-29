// Real desktop/mobile players and reader UI; isolated source bridge and local fixture media.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('.cache/custom-playback-ui');
await mkdir(root, { recursive: true });
await writeFile(path.join(root, 'auth.ts'), `export const useAuth=()=>({user:null,profile:null,isAdmin:false,isBanned:false,isLoading:false,signOut:async()=>{}});`);
await writeFile(path.join(root, 'layout.tsx'), `export const Sidebar=()=>null;export const MobileNav=()=>null;`);
await writeFile(path.join(root, 'platform.ts'), `export const useIsMobileApp=()=>new URLSearchParams(location.search).has('mobile');export const useIsDesktopApp=()=>!useIsMobileApp();export const useIsNativeApp=()=>true;export const useIsMacOS=()=>false;`);
await writeFile(path.join(root, 'index.html'), '<html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>');
for (let index = 1; index <= 6; index++) await writeFile(path.join(root, `page-${index}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="1060"><rect width="760" height="1060" fill="#edeae4"/><text x="40" y="56" fill="#151515" font-size="24" font-family="sans-serif">Reader layout fixture · page ${index}</text><rect x="36" y="90" width="688" height="400" fill="#24242b"/><circle cx="380" cy="290" r="110" fill="#4b4b58"/><rect x="36" y="514" width="330" height="500" fill="#44444e"/><rect x="390" y="514" width="334" height="500" fill="#1f1f27"/><text x="80" y="586" fill="#fff" font-size="18" font-family="sans-serif">Original source pages</text><text x="432" y="940" fill="#fff" font-size="18" font-family="sans-serif">Progress stays local</text></svg>`);
await writeFile(path.join(root, 'main.tsx'), `import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route,useNavigate,useLocation}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{SettingsModalProvider}from'/src/contexts/SettingsModalContext.tsx';import{TooltipProvider}from'/src/components/ui/tooltip.tsx';import{sourceAdapterRegistry}from'/src/core/player/SourceAdapterRegistry.ts';import{DirectAdapter}from'/src/core/player/DirectAdapter.ts';import Watch from'/src/pages/custom/CustomWatchPage.tsx';import Read from'/src/pages/custom/CustomReadPage.tsx';import{db}from'/src/core/db/tatakai-db.ts';import{updateExtensionLibrary}from'/src/core/extensions/compatibility/library.ts';import'/src/index.css';
sourceAdapterRegistry.register('direct',new DirectAdapter());
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});window.testClient=client;window.testDb=db;client.setQueryData(['custom-sources'],window.fixtureSources);
await updateExtensionLibrary('guest',{namespace:'compat-mihon',sourceId:'read-source',id:'manga',title:'Reading fixture',kind:'read',sourceName:'Manga source',catalog:window.readEntries},{progress:{id:'chapter-1',label:'Chapter 1',position:2,duration:6,completed:false,updatedAt:new Date().toISOString()}});
function Controls(){const navigate=useNavigate();window.fixtureNavigate=navigate;return <output data-route style={{position:'fixed',left:0,bottom:0,zIndex:-1}}>{useLocation().pathname}</output>};
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><SettingsModalProvider><TooltipProvider><MemoryRouter initialEntries={['/x/compat-aniyomi/watch-source/watch/anime/episode-1']}><Routes><Route path='/x/:namespace/:sourceId/watch/:id/:episodeId' element={<Watch/>}/><Route path='/x/:namespace/:sourceId/read/:id/:chapterId' element={<Read/>}/><Route path='/x/:namespace/:sourceId/info/:id' element={<p>Original source title</p>}/></Routes><Controls/></MemoryRouter></TooltipProvider></SettingsModalProvider></QueryClientProvider>);`);
function fixture() {
  localStorage.setItem('video-player-settings', JSON.stringify({ autoplay: false, autoNextEpisode: false }));
  localStorage.setItem('reader-settings', JSON.stringify({ readingMode: 'paged', widthPercent: 70, loadingMethod: 'native' }));
  window.readEntries = Array.from({ length: 125 }, (_, index) => ({ id: `chapter-${index + 1}`, label: `Chapter ${index + 1}`, number: index + 1 }));
  window.fixtureSources = [{ namespace: 'compat-aniyomi', id: 'watch-source', name: 'Anime source', description: 'Aniyomi fixture', language: 'en', kind: 'watch', catalogMediaType: 'anime' }, { namespace: 'compat-mihon', id: 'read-source', name: 'Manga source', description: 'Mihon fixture', language: 'en', kind: 'read', catalogMediaType: 'manga' }];
  window.calls = [];
  window.electron = { compatibilityRequest: async payload => {
    window.calls.push(payload); let result;
    if (payload.op === 'cancel') return { ok: true };
    if (payload.op === 'sources') result = window.fixtureSources.map(source => ({ ...source, ecosystem: source.namespace.slice(7), packageId: 'fixture', repository: 'https://fixture.invalid/', upstreamId: source.id, extensionName: source.description, lang: source.language, enabled: true }));
    else if (payload.op === 'info') result = { id: payload.id, title: payload.ecosystem === 'mihon' ? 'Reading fixture' : 'Playback fixture', entries: payload.ecosystem === 'mihon' ? window.readEntries : Array.from({ length: 125 }, (_, index) => ({ id: `episode-${index + 1}`, label: `Episode ${index + 1} · Source episode`, number: index + 1 })) };
    else if (payload.op === 'resolve') result = { sources: ['Alpha', 'Beta'].map((server, index) => ({ server, source: 'Anime source', url: location.origin + '/.cache/custom-provider-ui/playback.webm?server=' + index, quality: '720p', sourceType: 'mp4', audioLanguage: index ? 'ja' : 'en', headers: { Referer: 'https://fixture.invalid/' }, subtitles: [] })) };
    else if (payload.op === 'pages') result = { pages: Array.from({ length: 6 }, (_, index) => ({ pageNumber: index + 1, imageUrl: location.origin + '/.cache/custom-playback-ui/page-' + (index + 1) + '.svg' })) };
    else throw Error('Unexpected fixture op ' + payload.op);
    return { ok: true, result };
  } };
}
const aliases = [
  { find: '@/contexts/AuthContext', replacement: path.join(root, 'auth.ts') },
  { find: '@/hooks/ui/useIsNativeApp', replacement: path.join(root, 'platform.ts') },
  ...['Sidebar', 'MobileNav'].map(name => ({ find: '@/components/layout/' + name, replacement: path.join(root, 'layout.tsx') })),
  { find: '@', replacement: path.resolve('src') },
  { find: '@tatakai/release-parser', replacement: path.resolve('desktop/runtime/torrent/naming/release-parser.cjs') },
  { find: '@tatakai/candidate-scorer', replacement: path.resolve('src/core/download/candidate-scorer.cjs') },
  { find: '@tatakai/candidate-evaluator', replacement: path.resolve('src/core/download/candidate-evaluator.cjs') },
];
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: '.cache/custom-provider-vite', plugins: [react()], resolve: { alias: aliases, dedupe: ['react', 'react-dom', '@tanstack/react-query'] }, optimizeDeps: { noDiscovery: true, include: ['react','react/jsx-runtime','react-dom','react-dom/client','react-router-dom','@tanstack/react-query','react-helmet-async','react-i18next','i18next','dexie','hls.js','js-cookie','dompurify','dayjs','lodash','prop-types','react-fast-compare','invariant'] }, server: { host: '127.0.0.1', port: 19438, hmr: false } });
let browser, page;
const errors = [];
try {
  await server.listen(); browser = await chromium.launch({ headless: true });
  for (const mobile of [false, true]) {
    console.log('Checking', mobile ? 'mobile' : 'desktop', 'playback and reading');
    page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile });
    page.setDefaultTimeout(60000); page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await page.addInitScript(fixture);
    await page.route('**/anilist/graphql', route => route.fulfill({ json: { data: { Page: { media: [] } } } }));
    await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }));
    await page.goto('http://127.0.0.1:19438/.cache/custom-playback-ui/index.html' + (mobile ? '?mobile=1' : ''), { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.locator('video').waitFor();
    await page.getByRole('button', { name: /Beta.*720p/ }).click();
    await page.waitForFunction(() => document.querySelector('video')?.currentSrc.includes('server=1'));
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
    console.log('Server switched and fixture media loaded');
    await page.getByRole('button', { name: /Beta.*720p/ }).hover();
    await page.getByRole('tooltip').filter({ hasText: 'Aniyomi fixture' }).waitFor();
    await page.mouse.move(1, 1);
    await page.getByRole('textbox', { name: 'Search episodes' }).fill('Episode 125');
    await page.getByRole('button', { name: /Ep 125/ }).click();
    await page.waitForFunction(() => document.querySelector('[data-route]').textContent.endsWith('/episode-125'));
    await page.getByRole('textbox', { name: 'Search episodes' }).fill('');
    await page.screenshot({ path: `.cache/extension-feasibility/custom-watch-${mobile ? 'mobile' : 'desktop'}.png` });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error('Watch viewport overflow');
    await page.evaluate(() => window.fixtureNavigate('/x/compat-mihon/read-source/read/manga/chapter-1'));
    console.log('Checking reader controls');
    await page.locator('[data-reader-scroll] img').first().waitFor();
    await page.waitForFunction(() => document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') === '3');
    await page.getByRole('button', { name: 'Reading tools', exact: true }).click();
    const seek = page.getByRole('slider', { name: 'Jump to page' });
    await seek.focus(); await seek.press('Home'); for(let index=0;index<4;index++) await seek.press('ArrowRight');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') === '5');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('heading', { name: 'Reader settings', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `.cache/extension-feasibility/custom-read-${mobile ? 'mobile' : 'desktop'}.png` });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error('Reader viewport overflow');
    if (!mobile) {
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') === '6');
    }
    await page.getByRole('button', { name: 'Next chapter', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-route]').textContent.endsWith('/chapter-2'));
    await page.close();
  }
  if (errors.length) throw Error(errors.join('\n'));
  console.log('Custom watch/read UI passed at desktop and mobile sizes: real players, server switching, provenance tooltip, episode paging, source routes, resume, page seeking, settings and chapter navigation. Device bridge and source media are fixtures.');
} catch (error) {
  console.error(error); if (page && !page.isClosed()) { console.error((await page.locator('body').innerText()).slice(-2500)); await page.screenshot({ path: '.cache/extension-feasibility/custom-playback-failure.png' }).catch(() => {}); } process.exitCode = 1;
} finally { await browser?.close(); await server.close(); }
